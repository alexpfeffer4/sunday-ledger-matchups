begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Shared disposable fixture, kept self-contained for the Supabase pgTAP runner.
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
-- The approved hosted baseline already has global game-only 1.3; keep this
-- fixture transaction aligned while preserving the unchanged production catalog.
update private.authoritative_season_rulesets a set ruleset_version='1.3',product_bible_version='3.2',
 canonical_json=p.canonical_json,sha256_hash=p.sha256_hash from private.prepared_rolling_rulesets p where p.mode=a.mode;
create temporary table cutover_context as select pg_temp.card_reset_fixture('open-week2-props') c;
grant select,update on cutover_context to authenticated;
create function pg_temp.stage_week2(c jsonb) returns jsonb language sql as $$
 select private.stage_open_week2_props((c->>'league')::uuid,(c->>'season')::uuid,(c->>'week')::uuid,(c->>'card')::uuid,
 array(select jsonb_array_elements_text(c->'receiptIds')::uuid),c->>'receiptHash','Owner-approved exact Week 2 reset for props');
$$;
create function pg_temp.cutover_week2(c jsonb,p_menu_hash text default null,p_key text default 'week2-cutover-test') returns jsonb language sql as $$
 select private.cutover_open_week2_props((c->>'week')::uuid,coalesce(p_menu_hash,private.week2_props_menu_hash((c->>'week')::uuid)),
 repeat('a',64),repeat('b',40),p_key,'Reset the exact original card when all Week 2 props are ready.');
$$;
create temporary table cutover_original_receipts as select to_jsonb(r) receipt from private.position_receipts r where r.week_id=(select (c->>'week')::uuid from cutover_context);
create temporary table cutover_original_week as select to_jsonb(w) week from private.season_weeks w where w.id=(select (c->>'week')::uuid from cutover_context);
create temporary table cutover_original_cards as select to_jsonb(card) card from private.weekly_cards card where card.week_id=(select (c->>'week')::uuid from cutover_context);
select function_privs_are('private','stage_open_week2_props',array['uuid','uuid','uuid','uuid','uuid[]','text','text'],'authenticated',array[]::text[],'members cannot stage owner-authorized resets');
select function_privs_are('private','cutover_open_week2_props',array['uuid','text','text','text','text','text'],'authenticated',array[]::text[],'the commissioner review does not itself grant release/reset authority');
select table_privs_are('private','week2_props_stages','authenticated',array[]::text[],'staging never discloses original receipt identity to clients');
select lives_ok($$select pg_temp.stage_week2(c) from cutover_context$$,'an exact approved opened-week amendment can stage without paid entitlement');
select is(pg_temp.stage_week2(c)->>'status','STAGED','exact staging retry is idempotent') from cutover_context;
select is((select count(*) from private.player_catalog_jobs),0::bigint,'staging makes no jobs or provider calls');
select is((select count(*) from private.player_prop_leagues),0::bigint,'staging changes no offer, rule or acquisition flags');
select is((select to_jsonb(w) from private.season_weeks w where w.id=(c->>'week')::uuid),(select week from cutover_original_week),'staging keeps every original opened-week field') from cutover_context;
select ok(private.is_rolling_week((c->>'week')::uuid) and not private.is_player_props_week((c->>'week')::uuid),'staged game betting keeps the original 1.3 authority') from cutover_context;
select ok(private.week2_props_stage_current((c->>'week')::uuid),'exact existing bets do not make staged source/menu work ineligible') from cutover_context;
select is((api.get_player_prop_menu(c->>'slug')->>'amendmentPending')::boolean,true,'commissioner sees that this is staged preparation') from cutover_context;
select is((api.get_player_prop_menu(c->>'slug')->>'canOpen')::boolean,false,'a staged open amendment cannot invoke ordinary future-week opening') from cutover_context;
select is((select count(*) from private.week_player_menu where week_id=(c->>'week')::uuid),30::bigint,'all five games have six honest structural slots') from cutover_context;
select throws_ok($$select private.start_open_week2_props_catalog((c->>'week')::uuid) from cutover_context$$,'55000','Reviewed paid-plan budget and fresh verified entitlement are required.','source acquisition cannot spend a free-tier allowance');
select throws_ok($$select pg_temp.cutover_week2(c) from cutover_context$$,'55000','Reviewed paid-plan budget and fresh verified entitlement are required.','activation fails before resetting when entitlement is missing');
select is((select count(*) from private.card_reset_events),0::bigint,'failed readiness leaves the original card active');

-- Disposable evidence only: no HTTP calls or live provider claims. Preserve the
-- real readiness gate and satisfy its independently tested budget configuration.
update private.odds_refresh_policy set enabled=true,daily_credit_limit=1000,monthly_credit_limit=5000,
 protected_core_daily_credits=350,protected_core_monthly_credits=2000,provider_entitlement_credits=20000,
 quota_reset_policy='FIRST_OF_MONTH_CONFIRMED_HEADERS',next_quota_reset_at=clock_timestamp()+interval '20 days',provider_cycle_verified_at=clock_timestamp();
select throws_ok($$select private.start_open_week2_props_catalog((c->>'week')::uuid) from cutover_context$$,'55000','Validated player sources and protected request budgets are required.','paid odds alone does not waive source permission and completeness');
update private.player_result_policy set metadata_enabled=true,api_sports_contract_validated=true,nflverse_contract_validated=true;
select lives_ok($$select private.start_open_week2_props_catalog((c->>'week')::uuid) from cutover_context$$,'approved source acquisition queues the current slate without a hold');
select ok(catalog_enabled and not enabled and not rules_enabled and catalog_hold_from_week is null,'catalog work does not activate props or block ordinary entry') from private.player_prop_leagues where league_id=(select (c->>'league')::uuid from cutover_context);
select is((select count(*) from private.card_reset_events),0::bigint,'catalog setup never resets the accepted card');
select throws_ok($$select pg_temp.cutover_week2(c) from cutover_context$$,'55000','Validated player sources and protected request budgets are required.','result processing is independently required at cutover');
update private.player_result_policy set processing_enabled=true;
select throws_ok($$select pg_temp.cutover_week2(c) from cutover_context$$,'55000','The player result dispatcher is not installed.','the scheduler gate precedes reset');
-- Transaction-local no-network dispatcher fixture; the original is restored by rollback.
create function private.dispatch_player_result_checkpoints() returns bigint language sql as $$ select null::bigint $$;
create or replace function private.dispatch_score_checkpoints() returns bigint language plpgsql security definer set search_path='' as $$
begin perform private.dispatch_player_result_checkpoints(); return null; end; $$;
select throws_ok($$select pg_temp.cutover_week2(c) from cutover_context$$,'55000','The complete current player slate must be reviewed once before the Week 2 reset.','a ready scheduler cannot activate an incomplete unreviewed slate');
-- Verified deterministic role identities are scoped to each published game.
select api.import_player_catalog((select jsonb_agg(jsonb_build_object(
 'canonicalKey',e.id::text||':'||t.team||':'||role.position,'displayName',t.team||' Test '||role.position,'position',role.position,
 'provider','SIMULATION_FIXTURE','externalEventId',e.fixture_event_key,'externalPlayerId',e.id::text||':'||t.team||':'||role.position,
 'team',t.team,'gameDate',(e.scheduled_start_at at time zone 'America/New_York')::date,
 'verifiedAt',clock_timestamp(),'evidenceHash',repeat('a',64),'roleRank',1,'roleEvidence','Disposable verified current role','resultPathVerified',true))
 from private.sports_events e cross join lateral(values(e.away_team),(e.home_team)) t(team)
 cross join(values('QB'),('RB'),('WR')) role(position) where e.week_id=(select (c->>'week')::uuid from cutover_context)));
select api.prepare_player_prop_menu(c->>'slug') from cutover_context;
select throws_ok($$select api.confirm_player_prop_menu(c->>'slug','[]'::jsonb) from cutover_context$$,'22023','Confirm the complete player slate once, including unavailable slots.','partial commissioner review is rejected');
select lives_ok($$select api.confirm_player_prop_menu(c->>'slug',(select jsonb_agg(jsonb_build_object('eventId',event_id,'team',team,'slot',slot,'subjectId',subject_id))
 from private.week_player_menu where week_id=(c->>'week')::uuid)) from cutover_context$$,'one full commissioner review can prepare the exact still-active original card amendment');
select throws_ok($$select pg_temp.cutover_week2(c,repeat('0',64)) from cutover_context$$,'55000','The complete current player slate must be reviewed once before the Week 2 reset.','a stale reviewed-menu hash fails before reset');
-- A fresh accepted bet from another member must never be silently canceled by
-- the earlier approval. Trial runs in a subtransaction and restores its data.
create function pg_temp.trial_extra_week2_bet(c jsonb) returns jsonb language plpgsql as $$
declare batch jsonb:=jsonb_build_array((c#>'{rawPositions,0}')||jsonb_build_object('stakeCredits',50));
 proof uuid;answer jsonb;
begin
 begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',c->>'member','role','authenticated')::text,true);
  insert into private.live_card_quote_reviews(card_id,actor_user_id,positions,reviewed_at,expires_at,fetched_at)
  select card.id,card.owner_user_id,batch,clock_timestamp(),clock_timestamp()+interval '30 seconds',clock_timestamp()
  from private.weekly_cards card where card.week_id=(c->>'week')::uuid and card.owner_user_id=(c->>'member')::uuid returning id into proof;
  perform api.accept_stage1_card(c->>'slug',jsonb_set(batch,'{0}',batch->0||jsonb_build_object('reviewId',proof)),'week2-concurrent-member-pick');
  answer:=jsonb_build_object('stageCurrent',private.week2_props_stage_current((c->>'week')::uuid));
  begin perform pg_temp.cutover_week2(c);answer:=answer||jsonb_build_object('cutoverAccepted',true);
  exception when others then answer:=answer||jsonb_build_object('cutoverAccepted',false,'message',sqlerrm);end;
  raise exception using errcode='ZX001',message=answer::text;
 exception when sqlstate 'ZX001' then return sqlerrm::jsonb;end;
end; $$;
create temporary table cutover_extra_bet_trial as select pg_temp.trial_extra_week2_bet(c) result from cutover_context;
select is((result->>'stageCurrent')::boolean,false,'a new accepted bet invalidates the previously recorded exact receipt set') from cutover_extra_bet_trial;
select is(result->>'message','The exact unstarted Week 2 card or original rules have changed.','cutover refuses the new member bet rather than resetting additional cards') from cutover_extra_bet_trial;
select ok(private.week2_props_stage_current((c->>'week')::uuid),'the rolled-back concurrency trial leaves the original amendment ready') from cutover_context;
-- Snapshot attestation invalidates this other member's generation-0 proof too.
create temporary table cutover_stale_review as with proof as (
 insert into private.live_card_quote_reviews(card_id,actor_user_id,positions,reviewed_at,expires_at,fetched_at)
 select card.id,card.owner_user_id,c->'rawPositions',clock_timestamp(),clock_timestamp()+interval '30 seconds',clock_timestamp()
 from cutover_context join private.weekly_cards card on card.week_id=(c->>'week')::uuid and card.owner_user_id=(c->>'member')::uuid returning *) select * from proof;
update cutover_context set c=c||jsonb_build_object('menuHash',private.week2_props_menu_hash((c->>'week')::uuid));
select lives_ok($$update cutover_context set c=c||jsonb_build_object('cutover',pg_temp.cutover_week2(c,c->>'menuHash'))$$,'fully ready cutover resets only the recorded card and activates props atomically');
select is(c#>>'{cutover,status}','ACTIVATED','cutover reports completed activation') from cutover_context;
select is((select count(*) from private.card_reset_events),1::bigint,'exactly one recorded reset exists');
select is((select count(*) from private.effective_position_receipts where week_id=(c->>'week')::uuid),0::bigint,'the original picks are no longer competitive') from cutover_context;
select is((select jsonb_agg(to_jsonb(r) order by r.id) from private.position_receipts r where r.week_id=(c->>'week')::uuid),
 (select jsonb_agg(receipt order by receipt->>'id') from cutover_original_receipts),'original accepted receipt bytes remain unchanged') from cutover_context;
select is((select count(*) from private.week_player_menu where week_id=(c->>'week')::uuid and frozen_at is not null),30::bigint,'the full reviewed slate freezes together at the exceptional cutover') from cutover_context;
select ok(private.is_player_props_week((c->>'week')::uuid),'only the approved current week adopts 1.4') from cutover_context;
select is((api.get_player_prop_menu(c->>'slug')->>'amendmentApplied')::boolean,true,'the read model identifies amendment-based menu freeze') from cutover_context;
select is((api.get_player_prop_menu(c->>'slug')->>'amendmentPending')::boolean,false,'completed amendment is not presented as pending') from cutover_context;
select is((select ruleset_version from private.season_ruleset_snapshots r join private.week2_props_cutovers a on a.previous_ruleset_snapshot_id=r.id),'1.3','the append-only cutover retains the original binding');
select ok(not exists(select card from cutover_original_cards where card->>'id'<>(select c->>'card' from cutover_context)
 except select to_jsonb(card) from private.weekly_cards card where card.id<>(select (c->>'card')::uuid from cutover_context)),'other member cards and credit grants are unchanged');
select is(pg_temp.cutover_week2(c,c->>'menuHash')->>'replayed','true','a lost cutover response replays without a second reset') from cutover_context;
select throws_ok($$select pg_temp.cutover_week2(c,c->>'menuHash','different-amendment-key') from cutover_context$$,'22000','Week 2 already has a different completed amendment.','a different release operation cannot reset again');
select throws_ok($$update private.season_weeks set ruleset_snapshot_id=(select previous_ruleset_snapshot_id from private.week2_props_cutovers) where id=(select (c->>'week')::uuid from cutover_context)$$,'55000','An opened week keeps its original rules.','the narrow audit does not permit arbitrary later repinning');
select throws_ok($$select private.assert_live_card_quote_review(r.card_id,r.actor_user_id,
 jsonb_set(r.positions,'{0}',r.positions->0||jsonb_build_object('reviewId',r.id)),clock_timestamp()) from cutover_stale_review r$$,'55000','CARD_RESET_REVIEW_REQUIRED','another member must re-review under the amended rules even though their card generation remains zero');
select is((select count(*) from private.authoritative_season_rulesets where ruleset_version='1.4'),0::bigint,'the pilot amendment does not replace global rules catalogs');

-- New prop receipts use the same public Live review and acceptance authority.
-- Two distinct quarterbacks in one game are distinct opportunities across batches.
create temporary table cutover_prop_quotes(id uuid primary key,team text);
do $$ declare e private.sports_events%rowtype;m record;quote_id uuid;request_id uuid;
begin
 select * into e from private.sports_events where id=(select (c->>'event')::uuid from cutover_context);
 insert into private.shared_quote_requests(kind,event_ids,families,state,fetched_at)
 values('PROPS',array[e.fixture_event_key],array['player_pass_yds'],'SUCCEEDED',clock_timestamp()) returning id into request_id;
 for m in select menu.*,subject.display_name from private.week_player_menu menu join private.player_subjects subject on subject.id=menu.subject_id where menu.event_id=e.id and menu.slot='QB_PASS' loop
 insert into private.market_snapshots(event_id,week_id,league_id,book_key,market_type,outcome_key,proposition,line_milli,american_odds,observed_at,payload_hash,subject_id,statistic,period)
 values(e.id,e.week_id,e.league_id,'draftkings','PLAYER_PASSING_YARDS','OVER',m.display_name||' over225.5',225500,-110,clock_timestamp(),
 encode(extensions.digest(m.subject_id::text||'cutover','sha256'),'hex'),m.subject_id,'PASSING_YARDS','FULL_GAME') returning id into quote_id;
 insert into private.slate_items(slate_id,event_id,market_snapshot_id,week_id,league_id)
 select id,e.id,quote_id,e.week_id,e.league_id from private.slates where week_id=e.week_id order by version desc limit 1;
 update private.live_quote_heads set verified_request_id=request_id where market_snapshot_id=quote_id;
 insert into cutover_prop_quotes values(quote_id,m.team);
 end loop;
end; $$;
create function pg_temp.cutover_prop_batch(p_offset integer) returns jsonb language sql as $$
 select jsonb_build_array(jsonb_build_object('marketSnapshotId',q.id,'payloadHash',q.payload_hash,'stakeCredits',100))
 from cutover_prop_quotes fixture join private.market_snapshots q on q.id=fixture.id order by fixture.team limit 1 offset p_offset;
$$;
create function pg_temp.accept_cutover_prop(p_offset integer,p_key text) returns jsonb language plpgsql as $$
declare batch jsonb:=pg_temp.cutover_prop_batch(p_offset);review jsonb;
begin
 review:=api.review_live_card_quotes((select c->>'slug' from cutover_context),batch);
 batch:=jsonb_set(batch,'{0}',batch->0||jsonb_build_object('reviewId',review->>'reviewId'));
 return api.accept_stage1_card((select c->>'slug' from cutover_context),batch,p_key);
end; $$;
select lives_ok($$select pg_temp.accept_cutover_prop(0,'cutover-first-qb')$$,'the reset member can spend restored credits on a prop');
select lives_ok($$select pg_temp.accept_cutover_prop(1,'cutover-second-qb')$$,'Live quote review allows a distinct quarterback in the same game and statistic after the first batch');
select throws_ok($$select pg_temp.accept_cutover_prop(0,'cutover-repeat-qb')$$,'22023','The batch exceeds the remaining budget or includes a closed or submitted market.','the same player/statistic/period cannot be selected twice');
select is((select sum(stake_credits) from private.effective_position_receipts where card_id=(c->>'card')::uuid),200::bigint,'new props spend only the original restored allocation') from cutover_context;
select is((select count(*) from private.position_receipts where card_id=(c->>'card')::uuid and card_generation=0),4::bigint,'original game picks remain stored after new prop submissions') from cutover_context;
select * from finish();
rollback;
