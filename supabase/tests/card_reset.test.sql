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

create temporary table reset_context as select pg_temp.card_reset_fixture('week2-recorded-reset') c;
grant select,update on reset_context to authenticated;
create function pg_temp.reset_card(c jsonb,p_key text default 'week2-recorded-reset-operation') returns jsonb language sql as $$
 select private.reset_prestart_week2_card((c->>'league')::uuid,(c->>'season')::uuid,(c->>'week')::uuid,(c->>'card')::uuid,
  array(select jsonb_array_elements_text(c->'receiptIds')::uuid),c->>'receiptHash',p_key,repeat('b',40),
  'Explicit owner approval in disposable acceptance','Before kickoff: reset original picks so member can include props.');
$$;
create function pg_temp.try_reset(c jsonb,mutation text default null) returns jsonb language plpgsql as $$
declare answer jsonb;
begin
 begin
  if mutation is not null then execute mutation; end if;
  begin
   answer:=jsonb_build_object('accepted',true,'result',pg_temp.reset_card(c,(c->>'slug')||'-trial-operation'));
  exception when others then answer:=jsonb_build_object('accepted',false,'code',sqlstate,'message',sqlerrm);
  end;
  raise exception using errcode='ZX001',message=answer::text;
 exception when sqlstate 'ZX001' then return sqlerrm::jsonb;
 end;
end;
$$;
create function pg_temp.reset_actor(u uuid) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true)::text::void;
$$;
create temporary table reset_original_receipts as select to_jsonb(r) receipt from private.position_receipts r where r.card_id=(select (c->>'card')::uuid from reset_context);
create temporary table reset_original_scores as select to_jsonb(s) score from private.weekly_score_versions s where s.card_id=(select (c->>'card')::uuid from reset_context);
create temporary table reset_original_bindings as select w.id,w.ruleset_snapshot_id from private.season_weeks w;
create temporary table reset_original_catalog as select to_jsonb(a) value from private.authoritative_season_rulesets a;
select is((select count(*) from reset_original_receipts),4::bigint,'the real acceptance fixture has four original receipts');
select ok(exists(select 1 from reset_original_scores where score->>'status'='PROVISIONAL' and score->>'is_complete'='false'
 and score->>'score_centicredits'='0'),'real acceptance created the incomplete zero provisional score encountered in Week 2');
select function_privs_are('private','reset_prestart_week2_card',array['uuid','uuid','uuid','uuid','uuid[]','text','text','text','text','text'],'authenticated',array[]::text[],'commissioners and members cannot directly reset accepted cards');
select function_privs_are('private','reset_prestart_week2_card',array['uuid','uuid','uuid','uuid','uuid[]','text','text','text','text','text'],'anon',array[]::text[],'anonymous callers cannot invoke the operator exception');
select table_privs_are('private','card_reset_events','authenticated',array[]::text[],'the private reset audit cannot expose former selections');
select table_privs_are('private','effective_position_receipts','authenticated',array[]::text[],'effective receipts remain behind public membership and reveal guards');
select is(pg_temp.try_reset(c||jsonb_build_object('week',gen_random_uuid()))->>'accepted','false','a different week ID cannot reset this card') from reset_context;
select is(pg_temp.try_reset(c||jsonb_build_object('season',gen_random_uuid()))->>'accepted','false','a different season ID cannot reset this card') from reset_context;
select is(pg_temp.try_reset(c||jsonb_build_object('league',gen_random_uuid()))->>'accepted','false','a different league ID cannot reset this card') from reset_context;
select is(pg_temp.try_reset(c||jsonb_build_object('receiptIds','[]'::jsonb))->>'accepted','false','exact reviewed receipt IDs are required') from reset_context;
select is(pg_temp.try_reset(c||jsonb_build_object('receiptHash',repeat('0',64)))->>'accepted','false','changed original receipt evidence blocks the operation') from reset_context;
select is(pg_temp.try_reset(c,format('update private.sports_events set state=''LIVE'',actual_started_at=clock_timestamp() where id=%L::uuid',c->>'event'))->>'accepted','false','confirmed early kickoff closes the reset even before scheduled start') from reset_context;
select is(pg_temp.try_reset(c,format('update private.sports_events set scheduled_start_at=clock_timestamp()-interval ''1 second'' where id=%L::uuid',c->>'event'))->>'accepted','false','the time cutoff alone closes reset without a LIVE flag') from reset_context;
select is(pg_temp.try_reset(c,format('insert into private.event_result_versions(event_id,week_id,league_id,version,status,away_score,home_score,source,reason,recorded_by,input_hash) values(%L::uuid,%L::uuid,%L::uuid,1,''FINAL'',7,14,''THE_ODDS_API'',''Disposable authoritative result'',%L::uuid,repeat(''e'',64))',c->>'event',c->>'week',c->>'league',c->>'owner'))->>'accepted','false','any result evidence blocks reset even if an event flag is delayed') from reset_context;
select is((select count(*) from private.card_reset_events),0::bigint,'every refused operation is atomic and leaves no reset audit');

-- Both an uncommitted intent and a valid unconsumed quote review were created
-- on the old generation. Neither is current consent after the reset.
create temporary table reset_stale_intent as select gen_random_uuid() id,c->'rawPositions' positions from reset_context;
select api.bind_card_submission_intent(c->>'slug',i.id,i.positions) from reset_context,reset_stale_intent i;
create temporary table reset_stale_review as
 with r as(insert into private.live_card_quote_reviews(card_id,actor_user_id,positions,reviewed_at,expires_at,fetched_at)
  select (c->>'card')::uuid,(c->>'owner')::uuid,c->'rawPositions',clock_timestamp(),clock_timestamp()+interval '30 seconds',clock_timestamp() from reset_context returning *)
 select * from r;
select lives_ok($$update reset_context set c=c||jsonb_build_object('reset',pg_temp.reset_card(c))$$,'the reviewed before-kickoff reset succeeds despite the old zero provisional score');
select is(c#>>'{reset,status}','RESET','the response names the recorded reset') from reset_context;
select is(c#>>'{reset,remainingCredits}','1000','the original weekly allocation is restored') from reset_context;
select is((select card_generation from private.weekly_cards where id=(c->>'card')::uuid),1,'the same card advances to generation 1') from reset_context;
select is((select count(*) from private.effective_position_receipts where card_id=(c->>'card')::uuid),0::bigint,'no original pick remains effective') from reset_context;
select is((select granted_credits from private.weekly_cards where id=(c->>'card')::uuid),1000,'reset does not mint an additional weekly grant') from reset_context;
select is((select compliance from private.weekly_cards where id=(c->>'card')::uuid),'PENDING','the reset member is ready to make fresh picks') from reset_context;
select is(jsonb_array_length(api.get_stage1_state(c->>'slug')#>'{ownerCard,resetReceipts}'),4,'the owner retains a clearly canceled receipt audit') from reset_context;
select is(api.get_stage1_state(c->>'slug')#>>'{ownerCard,cardGeneration}','1','the owner read model identifies the restored card generation') from reset_context;
select is((select jsonb_agg(to_jsonb(r) order by r.id) from private.position_receipts r where r.card_id=(c->>'card')::uuid),
 (select jsonb_agg(receipt order by receipt->>'id') from reset_original_receipts),'all original receipt bytes and hashes remain unchanged') from reset_context;
select ok(not exists(select score from reset_original_scores except select to_jsonb(s) from private.weekly_score_versions s),'previous provisional scores remain append-only audit evidence');
select is((select count(*) from private.effective_weekly_score_versions where card_id=(c->>'card')::uuid),0::bigint,'the canceled generation has no active score before fresh picks') from reset_context;
select ok(not exists(select * from reset_original_bindings except select id,ruleset_snapshot_id from private.season_weeks),'the reset itself never repins any week rules');
select is((select jsonb_agg(to_jsonb(a) order by mode) from private.authoritative_season_rulesets a),
 (select jsonb_agg(value order by value->>'mode') from reset_original_catalog),'global rules catalogs remain unchanged');
select is(pg_temp.reset_card(c)->>'replayed','true','an exact operator retry returns the same reset') from reset_context;
select is((select count(*) from private.card_reset_events),1::bigint,'operator retry cannot append a second reset or grant');
select throws_ok($$select pg_temp.reset_card(c,'week2-different-reset-operation') from reset_context$$,null::text,'the card cannot be reset a second time');
select is(api.accept_stage1_card(c->>'slug',c->'positions',(c->>'slug')||'-accepted')->>'status','RESET','an old successful command reports cancellation instead of resurrecting original success') from reset_context;
select throws_like($$select api.revalidate_card_submission_intent(i.id,r.id) from reset_stale_intent i,reset_stale_review r$$,'%CARD_RESET_REVIEW_REQUIRED%','old uncommitted intent cannot renew into current consent');
select throws_like($$select api.accept_stage1_card(c->>'slug',jsonb_set(c->'rawPositions','{0}',c#>'{rawPositions,0}'||jsonb_build_object('reviewId',r.id)),'week2-stale-review-submit') from reset_context,reset_stale_review r$$,'%CARD_RESET_REVIEW_REQUIRED%','an unused but previously valid review is rejected after reset');
select is((select count(*) from private.effective_position_receipts where card_id=(c->>'card')::uuid),0::bigint,'stale retries leave the restored allocation untouched') from reset_context;
select pg_temp.reset_actor((c->>'member')::uuid) from reset_context;
select is(jsonb_array_length(api.get_stage1_state(c->>'slug')#>'{ownerCard,resetReceipts}'),0,'another member cannot read the former selections from owner-only audit fields') from reset_context;
select is((select count(*) from jsonb_array_elements(api.get_league_matchup_cards(c->>'slug',(c->>'week')::uuid)->'cards') card
 where card->>'submitted'='true'),0::bigint,'opponent projection no longer discloses canceled selected games') from reset_context;
select is((select count(*) from jsonb_array_elements(api.get_league_matchup_cards(c->>'slug',(c->>'week')::uuid)->'cards') card
 cross join lateral jsonb_array_elements(card->'positions') position),0::bigint,'reset audit does not leak canceled selection details through matchup projection') from reset_context;
select pg_temp.reset_actor(gen_random_uuid());
select throws_ok($$select api.get_league_matchup_cards(c->>'slug',(c->>'week')::uuid) from reset_context$$,'42501','League membership required.','outsiders remain unable to discover the card or its reset');
select pg_temp.reset_actor((c->>'owner')::uuid) from reset_context;

-- Fresh evidence and a fresh explicit request may select the same four markets.
create temporary table reset_fresh_review as
 with r as(insert into private.live_card_quote_reviews(card_id,actor_user_id,positions,reviewed_at,expires_at,fetched_at)
  select (c->>'card')::uuid,(c->>'owner')::uuid,c->'rawPositions',clock_timestamp(),clock_timestamp()+interval '30 seconds',clock_timestamp() from reset_context returning *)
 select * from r;
select lives_ok($$select api.accept_stage1_card(c->>'slug',jsonb_set(c->'rawPositions','{0}',c#>'{rawPositions,0}'||jsonb_build_object('reviewId',r.id)),'week2-fresh-generation-picks') from reset_context,reset_fresh_review r$$,'fresh consent can reuse all 1000 credits and the same event/market identities');
select is((select count(*) from private.effective_position_receipts where card_id=(c->>'card')::uuid),4::bigint,'only the four new receipts are effective') from reset_context;
select is((select sum(stake_credits) from private.effective_position_receipts where card_id=(c->>'card')::uuid),1000::bigint,'the active card remains bounded to its original 1000-credit budget') from reset_context;
select is((select count(*) from private.position_receipts where card_id=(c->>'card')::uuid),8::bigint,'four original and four replacement receipts coexist as immutable evidence') from reset_context;
select is((select card_generation from private.effective_weekly_score_versions where card_id=(c->>'card')::uuid order by created_at desc,id desc limit 1),1,'fresh acceptance scores the new generation') from reset_context;
select ok((select supersedes_id from private.effective_weekly_score_versions where card_id=(c->>'card')::uuid order by created_at desc,id desc limit 1)
 in(select (score->>'id')::uuid from reset_original_scores),'the new score retains lineage to the original zero provisional predecessor') from reset_context;
select is((select jsonb_agg(to_jsonb(r) order by r.id) from private.position_receipts r where r.card_id=(c->>'card')::uuid and r.card_generation=0),
 (select jsonb_agg(receipt order by receipt->>'id') from reset_original_receipts),'new acceptance still leaves the original generation byte-for-byte intact') from reset_context;
select throws_ok($$update private.position_receipts set stake_credits=50 where card_id=(select (c->>'card')::uuid from reset_context) and card_generation=0$$,'55000',null,'canceled receipt records retain the immutable write guard');
select throws_ok($$delete from private.card_reset_events$$,'55000',null,'the reset itself is append-only evidence');

-- A later authoritative final must grade only the replacement bet, and its
-- revealed history must not show or count the canceled predecessor.
update private.sports_events set state='LIVE',scheduled_start_at=clock_timestamp()-interval '2 minutes',actual_started_at=clock_timestamp()-interval '1 minute'
 where id=(select (c->>'event')::uuid from reset_context);
select lives_ok($$select api.record_stage1_result((c->>'event')::uuid,'FINAL',10,20,'Disposable verified home-team final','THE_ODDS_API','reset-new-generation-result') from reset_context$$,'replacement receipt grades through the existing authoritative result engine');
select is((select count(*) from private.settlement_versions s join private.position_receipts r on r.id=s.receipt_id where r.card_id=(c->>'card')::uuid and r.card_generation=0),0::bigint,'no canceled receipt receives a settlement') from reset_context;
select is((select score_centicredits from private.effective_weekly_score_versions where card_id=(c->>'card')::uuid order by created_at desc,id desc limit 1),50000::bigint,'only the replacement 250-credit winning pick contributes its 500-credit return') from reset_context;
select is((select count(*) from jsonb_array_elements(api.get_league_matchup_cards(c->>'slug',(c->>'week')::uuid)->'cards') card
 cross join lateral jsonb_array_elements(card->'positions') position),1::bigint,'revealed matchup history contains one replacement pick rather than both generations') from reset_context;
select ok(not exists(select 1 from jsonb_array_elements(api.get_league_matchup_cards(c->>'slug',(c->>'week')::uuid)->'cards') card
 cross join lateral jsonb_array_elements(card->'positions') position where (position->>'id')::uuid in(select (receipt->>'id')::uuid from reset_original_receipts)),
 'canceled receipt IDs never enter the revealed matchup payload') from reset_context;

create temporary table reset_committed_intent as select pg_temp.card_reset_fixture('week2-reset-committed-intent',1000,null,gen_random_uuid()) c;
select lives_ok($$select pg_temp.reset_card(c,'week2-reset-committed-intent-operation') from reset_committed_intent$$,'the exact exception also cancels a card accepted through durable intent');
select is(api.bind_card_submission_intent(c->>'slug',(c->>'intentId')::uuid,c->'rawPositions')->>'reset','true','lost-response recovery explicitly reports the committed intent was reset') from reset_committed_intent;
select is(api.bind_card_submission_intent(c->>'slug',(c->>'intentId')::uuid,c->'rawPositions')->>'committed','false','reset recovery never claims canceled picks are currently committed') from reset_committed_intent;
select is(api.accept_stage1_card(c->>'slug',c->'positions',c->>'operationKey')->>'status','RESET','retrying the old committed intent returns reset without another acceptance') from reset_committed_intent;
select is((select count(*) from private.effective_position_receipts where card_id=(c->>'card')::uuid),0::bigint,'committed intent recovery cannot resurrect old selections') from reset_committed_intent;
select is(private.card_receipt_fingerprint((c->>'card')::uuid,0),c->>'receiptHash','committed intent recovery preserves original receipt evidence') from reset_committed_intent;

-- Build valid other-week/year fixtures instead of mutating immutable bindings.
-- The reset primitive itself, not a fixture mutation trigger, must reject them.
create temporary table reset_wrong_scope as
 select 'week' scope,pg_temp.card_reset_fixture('reset-ineligible-week3',1000,null,null,3,2026) c
 union all select 'year',pg_temp.card_reset_fixture('reset-ineligible-year2027',1000,null,null,2,2027);
select is(pg_temp.try_reset(c)->>'message','CARD_RESET_SCOPE_INELIGIBLE','the exact exception refuses another '||scope) from reset_wrong_scope;
select * from finish();
rollback;
