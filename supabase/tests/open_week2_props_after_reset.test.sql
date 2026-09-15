begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Disposable public-acceptance fixture: no trigger bypass or provider calls.
-- BEGIN CARD RESET FIXTURE
-- Disposable native PostgreSQL fixture only. Callers enforce a loopback DB.
-- Seed a real LIVE Week 2 before any kickoff, then accept via the public RPC.
-- No provider, email, hosted connection, trigger bypass, or receipt mutation.
create function pg_temp.card_reset_fixture(p_slug text,p_stake integer default 1000,p_owner_id uuid default null,p_intent_id uuid default null,p_nfl_week integer default 2,p_nfl_year integer default 2026)
returns jsonb language plpgsql as $$
<<card_reset_fixture>>
declare
 owner_id uuid:=coalesce(p_owner_id,gen_random_uuid()); league_id uuid:=gen_random_uuid(); season_id uuid:=gen_random_uuid();
 week_id uuid:=gen_random_uuid(); snapshot_id uuid:=gen_random_uuid(); slate_id uuid:=gen_random_uuid();
 publication_id uuid:=gen_random_uuid(); card_id uuid:=gen_random_uuid();
 members uuid[]:=array[owner_id,gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 entries uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 events uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 markets jsonb:='[]'; quote_id uuid; payload_hash text; observation timestamptz:=clock_timestamp();
 prior jsonb; n integer; response jsonb; review_id uuid; accepted_positions jsonb; operation_key text; request_id uuid;
begin
 select jsonb_agg(to_jsonb(a)) into prior from private.authoritative_season_rulesets a;
 update private.authoritative_season_rulesets a set ruleset_version='1.3',product_bible_version='3.2',
  canonical_json=p.canonical_json,sha256_hash=p.sha256_hash from private.prepared_rolling_rulesets p where p.mode=a.mode;
 for n in 1..4 loop
  insert into auth.users(id,email) values(members[n],members[n]::text||'@reset-acceptance.test') on conflict(id) do nothing;
  insert into private.profiles(id,display_name) values(members[n],'Reset fixture member '||n) on conflict(id) do nothing;
 end loop;
 insert into private.leagues(id,name,slug,created_by) values(league_id,'Reset acceptance',p_slug,owner_id);
 for n in 1..4 loop
  insert into private.league_memberships(league_id,user_id,role)
   values(league_id,members[n],case when n=1 then 'COMMISSIONER' else 'MEMBER' end);
 end loop;
 insert into private.season_ruleset_snapshots(id,ruleset_id,ruleset_version,product_bible_id,product_bible_version,mode,canonical_json,sha256_hash,frozen_at)
  select snapshot_id,a.ruleset_id,a.ruleset_version,a.product_bible_id,a.product_bible_version,a.mode,a.canonical_json,a.sha256_hash,observation-interval '1 hour'
  from private.authoritative_season_rulesets a where a.mode='LIVE';
 insert into private.seasons(id,league_id,ruleset_snapshot_id,mode,nfl_year,lifecycle,roster_seed,schedule_seed,roster_locked_at)
  values(season_id,league_id,snapshot_id,'LIVE',p_nfl_year,'REGULAR',repeat('a',64),repeat('b',64),observation-interval '1 hour');
 for n in 1..4 loop
  insert into private.season_entries(id,season_id,league_id,user_id,standing_tiebreak)
   values(entries[n],season_id,league_id,members[n],lpad(n::text,64,'0'));
 end loop;
 insert into private.season_weeks(id,season_id,league_id,nfl_week,state,opens_at,common_lock_at)
  values(week_id,season_id,league_id,p_nfl_week,'OPEN',observation-interval '1 hour',observation+interval '55 minutes');
 insert into private.schedule_publications(id,season_id,league_id,version,algorithm_version,seed,ordered_entry_ids,output_hash,created_by)
  values(publication_id,season_id,league_id,1,'reset-fixture','reset-fixture',entries,repeat('c',64),owner_id);
 for n in 1..2 loop
  insert into private.matchups(week_id,season_id,league_id,schedule_publication_id,side_a_entry_id,side_b_entry_id,display_order)
   values(week_id,season_id,league_id,publication_id,entries[n*2-1],entries[n*2],n);
 end loop;
 for n in 1..4 loop
  insert into private.weekly_cards(id,week_id,season_id,league_id,entry_id,owner_user_id,granted_at)
   values(case when n=1 then card_id else gen_random_uuid() end,week_id,season_id,league_id,entries[n],members[n],observation-interval '1 hour');
 end loop;
 for n in 1..5 loop
  insert into private.sports_events(id,week_id,season_id,league_id,fixture_event_key,away_team,home_team,scheduled_start_at)
   values(events[n],week_id,season_id,league_id,p_slug||'-game-'||n,'Away '||n,'Home '||n,observation+n*interval '1 hour');
 end loop;
 insert into private.slates(id,week_id,season_id,league_id,version,fixture_id,common_lock_at)
  values(slate_id,week_id,season_id,league_id,1,p_slug,observation+interval '55 minutes');
 for n in 1..5 loop
  quote_id:=gen_random_uuid(); payload_hash:=encode(extensions.digest(quote_id::text,'sha256'),'hex');
  insert into private.market_snapshots(id,event_id,week_id,league_id,book_key,market_type,outcome_key,proposition,american_odds,quality_status,observed_at,payload_hash)
   values(quote_id,events[n],week_id,league_id,'draftkings','MONEYLINE','HOME','Home '||n||' to win',100,'HEALTHY',observation,payload_hash);
  insert into private.slate_items(slate_id,event_id,market_snapshot_id,week_id,league_id)
   values(slate_id,events[n],quote_id,week_id,league_id);
  markets:=markets||jsonb_build_array(jsonb_build_object('marketSnapshotId',quote_id,'payloadHash',payload_hash,'stakeCredits',p_stake/4));
 end loop;
 -- Trusted server-side fixture observations establish the same successful
 -- refresh evidence as the adapter. Review and acceptance guards remain real.
 update private.odds_refresh_policy set enabled=true;
 insert into private.shared_quote_requests(kind,event_ids,families,state,fetched_at)
  values('MAIN',array(select p_slug||'-game-'||i from generate_series(1,5) i),array['MAIN'],'SUCCEEDED',clock_timestamp()) returning id into request_id;
 update private.live_quote_heads h set verified_request_id=request_id where h.week_id=card_reset_fixture.week_id;
 update private.authoritative_season_rulesets a set ruleset_version=p.ruleset_version,product_bible_version=p.product_bible_version,
  canonical_json=p.canonical_json,sha256_hash=p.sha256_hash
  from jsonb_populate_recordset(null::private.authoritative_season_rulesets,prior) p where p.mode=a.mode;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 insert into private.live_card_quote_reviews(card_id,actor_user_id,positions,reviewed_at,expires_at,fetched_at)
  values(card_id,owner_id,markets-4,clock_timestamp(),clock_timestamp()+interval '30 seconds',clock_timestamp()) returning id into review_id;
 accepted_positions:=jsonb_set(markets-4,'{0}',markets->0||jsonb_build_object('reviewId',review_id));
 operation_key:=p_slug||'-accepted';
 if p_intent_id is not null then
  perform api.bind_card_submission_intent(p_slug,p_intent_id,markets-4);
  accepted_positions:=jsonb_set(accepted_positions,'{0}',accepted_positions->0||jsonb_build_object('intentId',p_intent_id));
  operation_key:='intent:'||p_intent_id::text;
 end if;
 response:=api.accept_stage1_card(p_slug,accepted_positions,operation_key);
 return jsonb_build_object('owner',owner_id,'member',members[2],'league',league_id,'season',season_id,'week',week_id,
  'card',card_id,'slug',p_slug,'positions',accepted_positions,'rawPositions',markets-4,'sparePositions',jsonb_build_array(markets->4||jsonb_build_object('stakeCredits',100)),'event',events[1],'originalResponse',response,'operationKey',operation_key,'intentId',p_intent_id,
  'receiptIds',(select jsonb_agg(r.id order by r.id) from private.position_receipts r where r.card_id=card_reset_fixture.card_id),
  'receiptHash',private.card_receipt_fingerprint(card_id,0));
end;
$$;
-- END CARD RESET FIXTURE

-- BEGIN AFTER RESET CUTOVER HELPERS
create function pg_temp.stage_after_reset_fixture(c jsonb) returns jsonb language sql as $$
 select private.stage_open_week2_props((c->>'league')::uuid,(c->>'season')::uuid,(c->>'week')::uuid,(c->>'card')::uuid,
 array(select jsonb_array_elements_text(c->'receiptIds')::uuid),c->>'receiptHash','Earlier owner approval for the exact Week 2 props amendment');
$$;
create function pg_temp.record_separate_reset(c jsonb) returns jsonb language sql as $$
 select private.reset_prestart_week2_card((c->>'league')::uuid,(c->>'season')::uuid,(c->>'week')::uuid,(c->>'card')::uuid,
 array(select jsonb_array_elements_text(c->'receiptIds')::uuid),c->>'receiptHash',(c->>'slug')||'-standalone-reset',repeat('b',40),
 'Later independent owner approval to restore picks immediately','Restore the exact approved picks before any game starts.');
$$;
create function pg_temp.finish_after_reset_cutover(c jsonb,p_hash text default null) returns jsonb language sql as $$
 select private.cutover_open_week2_props((c->>'week')::uuid,coalesce(p_hash,private.week2_props_menu_hash((c->>'week')::uuid)),
 repeat('a',64),repeat('c',40),(c->>'slug')||'-props-cutover','Complete the approved Week 2 props amendment after its separate reset.');
$$;
create function pg_temp.prepare_after_reset_readiness() returns void language plpgsql as $$
begin
 -- Disposable evidence only. No provider status is fabricated in a hosted DB.
 update private.authoritative_season_rulesets a set ruleset_version='1.3',product_bible_version='3.2',
 canonical_json=p.canonical_json,sha256_hash=p.sha256_hash from private.prepared_rolling_rulesets p where p.mode=a.mode;
 update private.odds_refresh_policy set enabled=true,daily_credit_limit=1000,monthly_credit_limit=5000,
 protected_core_daily_credits=350,protected_core_monthly_credits=2000,provider_entitlement_credits=20000,
 quota_reset_policy='FIRST_OF_MONTH_CONFIRMED_HEADERS',next_quota_reset_at=clock_timestamp()+interval '20 days',provider_cycle_verified_at=clock_timestamp();
 update private.player_result_policy set metadata_enabled=true,processing_enabled=true,api_sports_contract_validated=true,nflverse_contract_validated=true;
 execute 'create or replace function private.dispatch_player_result_checkpoints() returns bigint language sql as $fn$ select null::bigint $fn$';
 execute 'create or replace function private.dispatch_score_checkpoints() returns bigint language plpgsql security definer set search_path='''' as $fn$ begin perform private.dispatch_player_result_checkpoints(); return null; end; $fn$';
end; $$;
create function pg_temp.prepare_after_reset_menu(c jsonb,p_confirm boolean default true) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',c->>'owner','role','authenticated')::text,true);
 perform private.start_open_week2_props_catalog((c->>'week')::uuid);
 perform api.import_player_catalog((select jsonb_agg(jsonb_build_object(
 'canonicalKey',e.id::text||':'||t.team||':'||role.position,'displayName',t.team||' Test '||role.position,'position',role.position,
 'provider','SIMULATION_FIXTURE','externalEventId',e.fixture_event_key,'externalPlayerId',e.id::text||':'||t.team||':'||role.position,
 'team',t.team,'gameDate',(e.scheduled_start_at at time zone 'America/New_York')::date,
 'verifiedAt',clock_timestamp(),'evidenceHash',repeat('a',64),'roleRank',1,'roleEvidence','Disposable verified current role','resultPathVerified',true))
 from private.sports_events e cross join lateral(values(e.away_team),(e.home_team)) t(team)
 cross join(values('QB'),('RB'),('WR')) role(position) where e.week_id=(c->>'week')::uuid));
 perform api.prepare_player_prop_menu(c->>'slug');
 if p_confirm then
 perform api.confirm_player_prop_menu(c->>'slug',(select jsonb_agg(jsonb_build_object('eventId',event_id,'team',team,'slot',slot,'subjectId',subject_id))
 from private.week_player_menu where week_id=(c->>'week')::uuid));
 end if;
end; $$;
create function pg_temp.accept_after_reset_fixture(c jsonb,p_actor uuid) returns jsonb language plpgsql as $$
declare batch jsonb:=jsonb_build_array((c#>'{rawPositions,0}')||jsonb_build_object('stakeCredits',50)); proof uuid;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 insert into private.live_card_quote_reviews(card_id,actor_user_id,positions,reviewed_at,expires_at,fetched_at)
 select card.id,card.owner_user_id,batch,clock_timestamp(),clock_timestamp()+interval '30 seconds',clock_timestamp()
 from private.weekly_cards card where card.week_id=(c->>'week')::uuid and card.owner_user_id=p_actor returning id into proof;
 return api.accept_stage1_card(c->>'slug',jsonb_set(batch,'{0}',batch->0||jsonb_build_object('reviewId',proof)),(c->>'slug')||'-fresh-'||p_actor::text);
end; $$;
-- END AFTER RESET CUTOVER HELPERS

update private.authoritative_season_rulesets a set ruleset_version='1.3',product_bible_version='3.2',
 canonical_json=p.canonical_json,sha256_hash=p.sha256_hash from private.prepared_rolling_rulesets p where p.mode=a.mode;
create temporary table after_reset_context as select pg_temp.card_reset_fixture('week2-cutover-after-reset') c;
select lives_ok($$select pg_temp.stage_after_reset_fixture(c) from after_reset_context$$,'the original exact card stages before its independently approved reset');
create temporary table after_reset_original_receipts as select to_jsonb(r) receipt from private.position_receipts r where r.week_id=(select (c->>'week')::uuid from after_reset_context);
create temporary table after_reset_original_week as select to_jsonb(w) week from private.season_weeks w where w.id=(select (c->>'week')::uuid from after_reset_context);
select is(private.week2_props_matching_reset((c->>'week')::uuid),null::uuid,'the original generation-zero path does not pretend a reset has happened') from after_reset_context;
select ok(private.week2_props_stage_current((c->>'week')::uuid),'the preexisting atomic reset and cutover path remains eligible') from after_reset_context;
select lives_ok($$update after_reset_context set c=c||jsonb_build_object('reset',pg_temp.record_separate_reset(c))$$,'the separately approved reset runs before menu readiness');
create temporary table after_reset_original_reset as select to_jsonb(r) reset from private.card_reset_events r where r.week_id=(select (c->>'week')::uuid from after_reset_context);
create temporary table after_reset_original_stage as select to_jsonb(s) stage from private.week2_props_stages s where s.week_id=(select (c->>'week')::uuid from after_reset_context);
create temporary table after_reset_original_cards as select to_jsonb(card) card from private.weekly_cards card where card.week_id=(select (c->>'week')::uuid from after_reset_context);
select is((select count(*) from after_reset_original_receipts),4::bigint,'the exact original four receipts were accepted by the public authority');
select is(private.week2_props_matching_reset((c->>'week')::uuid),(c#>>'{reset,resetId}')::uuid,'matching uses the existing exact reset ID') from after_reset_context;
select ok(private.week2_props_stage_current((c->>'week')::uuid),'the staged amendment remains current after the exact separate reset') from after_reset_context;
select ok((select reset->>'approval_reference' from after_reset_original_reset)<>(select stage->>'approval_reference' from after_reset_original_stage),'both independent approvals remain distinct audit facts');
select is((select count(*) from private.effective_position_receipts where week_id=(c->>'week')::uuid),0::bigint,'the reset leaves no active receipt anywhere in the week') from after_reset_context;
select is((select to_jsonb(w) from private.season_weeks w where w.id=(c->>'week')::uuid),(select week from after_reset_original_week),'standalone reset has not repinned the original opened rules') from after_reset_context;
select function_privs_are('private','week2_props_matching_reset',array['uuid'],'authenticated',array[]::text[],'members cannot inspect the private reset matcher');
select function_privs_are('private','week2_props_matching_reset',array['uuid'],'anon',array[]::text[],'anonymous callers cannot inspect reset evidence');
select throws_ok($$update private.position_receipts set stake_credits=50 where card_id=(select (c->>'card')::uuid from after_reset_context) and card_generation=0$$,'55000',null,'original receipt changes remain forbidden after the separate reset');
select throws_ok($$update private.card_reset_events set approval_reference='Replacement approval' where week_id=(select (c->>'week')::uuid from after_reset_context)$$,'55000',null,'the separate approval cannot be rewritten to match the staged approval');
select throws_ok($$select pg_temp.finish_after_reset_cutover(c) from after_reset_context$$,'55000','Reviewed paid-plan budget and fresh verified entitlement are required.','an existing reset does not waive paid-plan readiness');
select pg_temp.prepare_after_reset_readiness();
select pg_temp.prepare_after_reset_menu(c,false) from after_reset_context;
select throws_ok($$select pg_temp.finish_after_reset_cutover(c) from after_reset_context$$,'55000','The complete current player slate must be reviewed once before the Week 2 reset.','an existing reset does not waive full commissioner review');
select lives_ok($$select api.confirm_player_prop_menu(c->>'slug',(select jsonb_agg(jsonb_build_object('eventId',event_id,'team',team,'slot',slot,'subjectId',subject_id))
 from private.week_player_menu where week_id=(c->>'week')::uuid)) from after_reset_context$$,'commissioner can review the exact staged menu after the separate reset');
select throws_ok($$select pg_temp.finish_after_reset_cutover(c,repeat('0',64)) from after_reset_context$$,'55000','The complete current player slate must be reviewed once before the Week 2 reset.','a stale reviewed-menu fingerprint cannot reuse the reset');

-- Each trial rolls back all ordinary writes; rejection must come from the
-- cutover authority, rather than replacing fixtures or disabling any trigger.
create function pg_temp.trial_after_reset_cutover(c jsonb,mutation text) returns jsonb language plpgsql as $$
declare answer jsonb;
begin
 begin
  execute mutation;
  answer:=jsonb_build_object('stageCurrent',private.week2_props_stage_current((c->>'week')::uuid));
  begin
   perform pg_temp.finish_after_reset_cutover(c);
   answer:=answer||jsonb_build_object('cutoverAccepted',true);
  exception when others then answer:=answer||jsonb_build_object('cutoverAccepted',false,'code',sqlstate,'message',sqlerrm);end;
  raise exception using errcode='ZX001',message=answer::text;
 exception when sqlstate 'ZX001' then return sqlerrm::jsonb;end;
end; $$;
create temporary table after_reset_bet_trials as
 select 'reset member' actor,pg_temp.trial_after_reset_cutover(c,format('select pg_temp.accept_after_reset_fixture(%L::jsonb,%L::uuid)',c::text,c->>'owner')) result from after_reset_context
 union all select 'another member',pg_temp.trial_after_reset_cutover(c,format('select pg_temp.accept_after_reset_fixture(%L::jsonb,%L::uuid)',c::text,c->>'member')) from after_reset_context;
select is((result->>'stageCurrent')::boolean,false,'fresh accepted picks by '||actor||' invalidate the staged prior-reset path') from after_reset_bet_trials;
select is(result->>'message','The exact unstarted Week 2 card or original rules have changed.','cutover preserves fresh picks by '||actor||' instead of resetting again') from after_reset_bet_trials;
create temporary table after_reset_play_trials as
 select 'actual kickoff' boundary,pg_temp.trial_after_reset_cutover(c,format('update private.sports_events set state=''LIVE'',actual_started_at=clock_timestamp() where id=%L::uuid',c->>'event')) result from after_reset_context
 union all select 'scheduled start',pg_temp.trial_after_reset_cutover(c,format('update private.sports_events set scheduled_start_at=clock_timestamp()-interval ''1 second'' where id=%L::uuid',c->>'event')) from after_reset_context
 union all select 'authoritative result',pg_temp.trial_after_reset_cutover(c,format('insert into private.event_result_versions(event_id,week_id,league_id,version,status,away_score,home_score,source,reason,recorded_by,input_hash) values(%L::uuid,%L::uuid,%L::uuid,1,''FINAL'',7,14,''THE_ODDS_API'',''Disposable authoritative result'',%L::uuid,repeat(''e'',64))',c->>'event',c->>'week',c->>'league',c->>'owner')) from after_reset_context
 union all select 'complete score',pg_temp.trial_after_reset_cutover(c,format('insert into private.weekly_score_versions(card_id,week_id,league_id,entry_id,input_hash,compliance,score_centicredits,is_complete,status,card_generation) select id,week_id,league_id,entry_id,repeat(''f'',64),''INCOMPLETE'',0,true,''FINAL'',card_generation from private.weekly_cards where id=%L::uuid',c->>'card')) from after_reset_context;
select is((result->>'stageCurrent')::boolean,false,boundary||' invalidates the stage even after the separate reset') from after_reset_play_trials;
select is(result->>'message','The exact unstarted Week 2 card or original rules have changed.',boundary||' is rechecked before any rules or menu change') from after_reset_play_trials;
select ok(private.week2_props_stage_current((c->>'week')::uuid),'rolled-back mutation trials leave the exact empty generation eligible') from after_reset_context;
select is((select count(*) from private.week2_props_cutovers where week_id=(c->>'week')::uuid),0::bigint,'failed readiness and safety checks leave no partial cutover') from after_reset_context;
select is((select count(*) from private.week_player_menu where week_id=(c->>'week')::uuid and frozen_at is not null),0::bigint,'failed cutovers never freeze an incomplete transition') from after_reset_context;

-- Adversarial operator audit rows use normal INSERT authority. Competitive
-- receipts and immutable reset/stage rows are never rewritten or bypassed.
create function pg_temp.trial_mismatched_reset(p_kind text) returns jsonb language plpgsql as $$
declare c jsonb; r jsonb; answer jsonb; ids uuid[]; fingerprint text;
begin
 begin
  c:=pg_temp.card_reset_fixture('after-reset-mismatch-'||p_kind);
  ids:=array(select jsonb_array_elements_text(c->'receiptIds')::uuid);
  fingerprint:=c->>'receiptHash';
  if p_kind='receipt-ids' then ids:=array[gen_random_uuid()];end if;
  if p_kind='fingerprint' then fingerprint:=repeat('0',64);end if;
  if p_kind='reset-before-stage' then r:=pg_temp.record_separate_reset(c);end if;
  insert into private.week2_props_stages(week_id,league_id,season_id,card_id,original_ruleset_snapshot_id,expected_receipt_ids,expected_receipt_fingerprint,approval_reference)
  select id,league_id,season_id,(c->>'card')::uuid,ruleset_snapshot_id,ids,fingerprint,'Disposable mismatched amendment evidence' from private.season_weeks where id=(c->>'week')::uuid;
  if p_kind<>'reset-before-stage' then r:=pg_temp.record_separate_reset(c);end if;
  answer:=jsonb_build_object('matched',private.week2_props_matching_reset((c->>'week')::uuid),'stageCurrent',private.week2_props_stage_current((c->>'week')::uuid));
  begin perform pg_temp.finish_after_reset_cutover(c);answer:=answer||jsonb_build_object('accepted',true);
  exception when others then answer:=answer||jsonb_build_object('accepted',false,'message',sqlerrm);end;
  raise exception using errcode='ZX001',message=answer::text;
 exception when sqlstate 'ZX001' then return sqlerrm::jsonb;end;
end; $$;
create temporary table after_reset_mismatch_trials as select kind,pg_temp.trial_mismatched_reset(kind) result from unnest(array['receipt-ids','fingerprint','reset-before-stage']) kind;
select is(result->>'matched',null::text,kind||' cannot substitute for the staged exact reset') from after_reset_mismatch_trials;
select is((result->>'stageCurrent')::boolean,false,kind||' cannot make the amendment current') from after_reset_mismatch_trials;
select is(result->>'message','The exact unstarted Week 2 card or original rules have changed.',kind||' fails before activation') from after_reset_mismatch_trials;

update after_reset_context set c=c||jsonb_build_object('menuHash',private.week2_props_menu_hash((c->>'week')::uuid));
select lives_ok($$update after_reset_context set c=c||jsonb_build_object('cutover',pg_temp.finish_after_reset_cutover(c,c->>'menuHash'))$$,'a fully reviewed amendment completes using the already recorded reset');
select is(c#>>'{cutover,status}','ACTIVATED','cutover reports activation') from after_reset_context;
select is(c#>>'{cutover,resetId}',c#>>'{reset,resetId}','the response identifies the original separate reset') from after_reset_context;
select is((select count(*) from private.card_reset_events where week_id=(c->>'week')::uuid),1::bigint,'cutover records no second reset') from after_reset_context;
select is((select to_jsonb(r) from private.card_reset_events r where r.week_id=(c->>'week')::uuid),(select reset from after_reset_original_reset),'all original reset fields and independent approval remain byte-for-byte unchanged') from after_reset_context;
select is((select to_jsonb(s) from private.week2_props_stages s where s.week_id=(c->>'week')::uuid),(select stage from after_reset_original_stage),'the original staged approval remains byte-for-byte unchanged') from after_reset_context;
select is((select jsonb_agg(to_jsonb(r) order by r.id) from private.position_receipts r where r.week_id=(c->>'week')::uuid),
 (select jsonb_agg(receipt order by receipt->>'id') from after_reset_original_receipts),'cutover preserves every original accepted receipt byte') from after_reset_context;
select is((select jsonb_agg(to_jsonb(card) order by card.id) from private.weekly_cards card where card.week_id=(c->>'week')::uuid),
 (select jsonb_agg(card order by card->>'id') from after_reset_original_cards),'cutover changes no member card or grant after the reset') from after_reset_context;
select is((select card_generation from private.weekly_cards where id=(c->>'card')::uuid),1,'cutover does not advance beyond the one approved generation') from after_reset_context;
select is((select count(*) from private.week_player_menu where week_id=(c->>'week')::uuid and frozen_at is not null),30::bigint,'every reviewed slot freezes together') from after_reset_context;
select ok(private.is_player_props_week((c->>'week')::uuid),'only the staged current week is pinned to the reviewed props rules') from after_reset_context;
select is((select reset_id from private.week2_props_cutovers where week_id=(c->>'week')::uuid),(c#>>'{reset,resetId}')::uuid,'the cutover audit retains the earlier reset reference') from after_reset_context;
select is(pg_temp.finish_after_reset_cutover(c,c->>'menuHash')->>'replayed','true','an exact retry is idempotent after the separate-reset cutover') from after_reset_context;
select throws_ok($$update private.season_weeks set ruleset_snapshot_id=(select previous_ruleset_snapshot_id from private.week2_props_cutovers where week_id=(select (c->>'week')::uuid from after_reset_context)) where id=(select (c->>'week')::uuid from after_reset_context)$$,'55000','An opened week keeps its original rules.','existing audit evidence never permits arbitrary later repinning');
select is((select count(*) from private.authoritative_season_rulesets where ruleset_version='1.4'),0::bigint,'the exception never changes the global rules catalog');
select * from finish();
rollback;
