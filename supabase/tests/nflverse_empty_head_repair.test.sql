begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Real local public-acceptance/reset fixture. Every change rolls back; no HTTP.

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
create function pg_temp.stage_after_reset_fixture(c jsonb) returns jsonb language sql as $$
 select private.stage_open_week2_props((c->>'league')::uuid,(c->>'season')::uuid,(c->>'week')::uuid,(c->>'card')::uuid,
 array(select jsonb_array_elements_text(c->'receiptIds')::uuid),c->>'receiptHash','Earlier owner approval for the exact Week 2 props amendment');
$$;
create function pg_temp.record_separate_reset(c jsonb) returns jsonb language sql as $$
 select private.reset_prestart_week2_card((c->>'league')::uuid,(c->>'season')::uuid,(c->>'week')::uuid,(c->>'card')::uuid,
 array(select jsonb_array_elements_text(c->'receiptIds')::uuid),c->>'receiptHash',(c->>'slug')||'-standalone-reset',repeat('b',40),
 'Later independent owner approval to restore picks immediately','Restore the exact approved picks before any game starts.');
$$;
create function pg_temp.accept_after_reset_fixture(c jsonb,p_actor uuid) returns jsonb language plpgsql as $$
declare batch jsonb:=jsonb_build_array((c#>'{rawPositions,0}')||jsonb_build_object('stakeCredits',50)); proof uuid;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 insert into private.live_card_quote_reviews(card_id,actor_user_id,positions,reviewed_at,expires_at,fetched_at)
 select card.id,card.owner_user_id,batch,clock_timestamp(),clock_timestamp()+interval '30 seconds',clock_timestamp()
 from private.weekly_cards card where card.week_id=(c->>'week')::uuid and card.owner_user_id=p_actor returning id into proof;
 return api.accept_stage1_card(c->>'slug',jsonb_set(batch,'{0}',batch->0||jsonb_build_object('reviewId',proof)),(c->>'slug')||'-fresh-'||p_actor::text);
end; $$;
select private.configure_nflverse_primary_pilot(repeat('a',64),'Approved empty-head recovery test fixture');
update private.player_result_policy set metadata_enabled=true,nflverse_contract_validated=true;
update private.authoritative_season_rulesets a set ruleset_version='1.3',product_bible_version='3.2',
 canonical_json=p.canonical_json,sha256_hash=p.sha256_hash from private.prepared_rolling_rulesets p where p.mode=a.mode;
create temporary table repair_context as select pg_temp.card_reset_fixture('empty-head-repair') c;
select pg_temp.stage_after_reset_fixture(c) from repair_context;
select pg_temp.record_separate_reset(c) from repair_context;
insert into private.player_prop_leagues(league_id,season_id,catalog_enabled)
 select (c->>'league')::uuid,(c->>'season')::uuid,true from repair_context;
insert into private.player_catalog_jobs(week_id) select (c->>'week')::uuid from repair_context;
create temporary table initial_repair_lease as select api.claim_player_catalog_job((c->>'week')::uuid) response from repair_context;
create temporary table repair_nominations as select jsonb_agg(jsonb_build_object(
 'externalEventId',e.fixture_event_key,'team',team,'slot',slot,'proposedCanonicalKey',null,'candidates','[]'::jsonb,
 'nominationExpiresAt',clock_timestamp()+interval '30 minutes','nominationEvidenceHash',repeat('a',64),
 'nominationVerifiedAt',clock_timestamp()-interval '2 minutes') order by e.fixture_event_key,team,slot) proposals
 from private.sports_events e cross join lateral unnest(array[e.away_team,e.home_team])team cross join unnest(array['QB_PASS','RB_RUSH','RECEIVER'])slot
 where week_id=(select (c->>'week')::uuid from repair_context);
select api.record_player_catalog_nominations((response->>'leaseId')::uuid,(select proposals from repair_nominations)) from initial_repair_lease;
select api.import_player_catalog(jsonb_build_array(jsonb_build_object('canonicalKey','repair-verified-qb','displayName','Repair Verified QB','position','QB',
 'provider','THE_ODDS_API','externalEventId','empty-head-repair-game-1','externalPlayerId','Repair Verified QB','team','Away 1',
 'gameDate',(e.scheduled_start_at at time zone 'America/New_York')::date,'verifiedAt',clock_timestamp(),
 'evidenceHash',repeat('b',64),'roleRank',0,'roleEvidence','Verified cached standard passing line','resultPathVerified',true)))
 from private.sports_events e where e.id=(select (c->>'event')::uuid from repair_context);
select api.complete_player_catalog_job((response->>'leaseId')::uuid,'PENDING',1,'EMPTY_GENERATION_DIAGNOSTIC') from initial_repair_lease;
update private.player_result_policy set metadata_enabled=false;
update repair_context set c=c||jsonb_build_object('generationId',g.id,'contentHash',g.content_hash)
 from private.player_catalog_nomination_heads h join private.player_catalog_nomination_generations g on g.id=h.generation_id
 where h.week_id=(c->>'week')::uuid;
create temporary table repair_before as select
 (select jsonb_agg(to_jsonb(g) order by id) from private.player_catalog_nomination_generations g) generations,
 (select jsonb_agg(to_jsonb(r) order by id) from private.position_receipts r) receipts,
 (select jsonb_agg(to_jsonb(r) order by id) from private.card_reset_events r) resets,
 (select jsonb_agg(to_jsonb(r) order by id) from private.weekly_cards r) cards,
 (select jsonb_agg(to_jsonb(j) order by week_id) from private.player_catalog_jobs j) jobs,
 (select jsonb_agg(to_jsonb(c) order by cache_key) from private.player_catalog_sources c) sources;
create function pg_temp.repair_empty_head(p_key text default 'verified-empty-head-repair',p_reason text default 'Recover verified kickoff serialization fault from unchanged cached evidence.') returns jsonb language sql as $$
 select private.invalidate_empty_nflverse_nomination_head((c->>'week')::uuid,(c->>'generationId')::uuid,
 c->>'contentHash',repeat('c',40),p_key,p_reason) from repair_context;
$$;
create function pg_temp.nonempty_repair_head() returns void language plpgsql as $$
declare c jsonb;new_generation uuid;proposals jsonb;
begin
 select ctx.c into c from repair_context ctx;
 select jsonb_agg(case when n->>'externalEventId'='empty-head-repair-game-1' and n->>'team'='Away 1' and n->>'slot'='QB_PASS'
 then n||jsonb_build_object('proposedCanonicalKey','repair-verified-qb','candidates',
 '[{"canonicalKey":"repair-verified-qb","displayName":"Repair Verified QB","roleRank":0,"roleEvidence":"Verified cached standard passing line"}]'::jsonb) else n end)
 into proposals from repair_nominations original cross join lateral jsonb_array_elements(original.proposals)n;
 insert into private.player_catalog_nomination_generations(week_id,source_validation_id,nominations,content_hash)
 select g.week_id,g.source_validation_id,proposals,
 (select encode(extensions.digest(jsonb_agg(n order by n->>'externalEventId',n->>'team',n->>'slot')::text,'sha256'),'hex') from jsonb_array_elements(proposals)n)
 from private.player_catalog_nomination_generations g where id=(c->>'generationId')::uuid returning id into new_generation;
 update private.player_catalog_nomination_heads set generation_id=new_generation where week_id=(c->>'week')::uuid;
 update repair_context set c=repair_context.c||jsonb_build_object('generationId',g.id,'contentHash',g.content_hash)
 from private.player_catalog_nomination_generations g where id=new_generation;
end; $$;
create function pg_temp.repair_fault(p_fault text) returns text language plpgsql as $$
declare c jsonb;result text;
begin
 begin
  select ctx.c into c from repair_context ctx;
  case p_fault
  when 'metadata' then update private.player_result_policy set metadata_enabled=true;
  when 'processing' then update private.player_result_policy set processing_enabled=true;
  when 'offers' then update private.player_prop_controls set offers_enabled=true;
  when 'validation' then update private.player_result_policy set nflverse_contract_validated=false;
  when 'league-offers' then update private.player_prop_leagues set enabled=true;
  when 'lease' then update private.player_catalog_jobs set lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '1 minute';
  when 'job-ready' then update private.player_catalog_jobs set state='READY';
  when 'selected' then perform pg_temp.nonempty_repair_head();update private.week_player_menu set subject_id=(select id from private.player_subjects where canonical_key='repair-verified-qb') where event_id=(c->>'event')::uuid and team='Away 1' and slot='QB_PASS';
  when 'confirmed' then update private.week_player_menu set confirmed_at=clock_timestamp(),confirmed_by=(c->>'owner')::uuid where week_id=(c->>'week')::uuid;
  when 'frozen' then update private.week_player_menu set frozen_at=clock_timestamp() where week_id=(c->>'week')::uuid;
  when 'started' then update private.sports_events set actual_started_at=clock_timestamp() where id=(c->>'event')::uuid;
  when 'new-pick' then perform pg_temp.accept_after_reset_fixture(c,(c->>'member')::uuid);
  when 'wrong-head' then update repair_context set c=jsonb_set(repair_context.c,'{generationId}',to_jsonb(gen_random_uuid()));
  when 'wrong-hash' then update repair_context set c=jsonb_set(repair_context.c,'{contentHash}',to_jsonb(repeat('d',64)));
  when 'nonempty' then perform pg_temp.nonempty_repair_head();
  else raise exception 'Unknown test fault';
  end case;
  begin perform pg_temp.repair_empty_head();result:='ACCEPTED';
  exception when others then result:=sqlstate;end;
  raise exception using errcode='ZX001',message=result;
 exception when sqlstate 'ZX001' then return sqlerrm;end;
end; $$;
select is(pg_temp.repair_fault(fault),'55000','repair rejects '||fault)
 from unnest(array['metadata','processing','offers','validation','league-offers','lease','job-ready',
 'selected','confirmed','frozen','started','new-pick','wrong-head','wrong-hash','nonempty'])fault;
select is((select count(*) from private.player_catalog_empty_head_repairs),0::bigint,'failed repairs create no audit');
select is((select count(*) from private.player_catalog_nomination_heads),1::bigint,'failed repairs retain the expected head');
select function_privs_are('private','invalidate_empty_nflverse_nomination_head',array['uuid','uuid','text','text','text','text'],role_name,array[]::text[],role_name||' cannot repair nomination authority')
 from unnest(array['anon','authenticated','service_role'])role_name;
select table_privs_are('private','player_catalog_empty_head_repairs',role_name,array[]::text[],role_name||' cannot access repair audit')
 from unnest(array['anon','authenticated','service_role'])role_name;
select ok((select relrowsecurity from pg_class where oid='private.player_catalog_empty_head_repairs'::regclass),'repair audit enables RLS');
select is((select count(*) from pg_policy where polrelid='private.player_catalog_empty_head_repairs'::regclass),0::bigint,'repair audit has no participant policies');
select lives_ok($$select pg_temp.repair_empty_head()$$,'exact quiescent empty head invalidates through audited operator authority');
select is((select count(*) from private.player_catalog_nomination_heads),0::bigint,'repair removes only the derived current head');
select is((select count(*) from private.player_catalog_empty_head_repairs),1::bigint,'repair records exactly one immutable audit');
select is((select jsonb_agg(to_jsonb(g) order by id) from private.player_catalog_nomination_generations g),(select generations from repair_before),'all original generation bytes remain unchanged');
select is((select jsonb_agg(to_jsonb(r) order by id) from private.position_receipts r),(select receipts from repair_before),'repair preserves original receipts');
select is((select jsonb_agg(to_jsonb(r) order by id) from private.card_reset_events r),(select resets from repair_before),'repair preserves the one completed reset');
select is((select jsonb_agg(to_jsonb(r) order by id) from private.weekly_cards r),(select cards from repair_before),'repair preserves every card and credit balance');
select is((select jsonb_agg(to_jsonb(j) order by week_id) from private.player_catalog_jobs j),(select jobs from repair_before),'repair preserves job state, lease and cadence');
select is((select jsonb_agg(to_jsonb(c) order by cache_key) from private.player_catalog_sources c),(select sources from repair_before),'repair preserves all source caches');
select is(pg_temp.repair_empty_head()->>'replayed','true','exact repair replay is read-only');
select throws_ok($$select pg_temp.repair_empty_head('different-repair-operation')$$,'22000',null,'different operation cannot repeat repair');
select throws_ok($$select pg_temp.repair_empty_head('verified-empty-head-repair','A conflicting reason for the same operation.')$$,'22000',null,'conflicting operation arguments cannot replay');
select throws_ok($$update private.player_catalog_empty_head_repairs set reason='Rewrite audit evidence'$$,'55000',null,'repair audit cannot be updated');
select throws_ok($$delete from private.player_catalog_empty_head_repairs$$,'55000',null,'repair audit cannot be deleted');
select throws_ok($$delete from private.player_catalog_nomination_generations$$,'55000',null,'invalidated nomination history remains append-only');
-- Model the next due checkpoint in this rollback-only fixture; repair itself
-- neither changes this timestamp nor obtains any worker lease.
update private.player_catalog_jobs set next_attempt_at=clock_timestamp();
update private.player_result_policy set metadata_enabled=true;
create temporary table recovered_repair_lease as select api.claim_player_catalog_job((c->>'week')::uuid) response from repair_context;
create temporary table corrected_repair_nominations as select jsonb_agg(case when n->>'externalEventId'='empty-head-repair-game-1' and n->>'team'='Away 1' and n->>'slot'='QB_PASS'
 then n||jsonb_build_object('proposedCanonicalKey','repair-verified-qb','candidates',
 '[{"canonicalKey":"repair-verified-qb","displayName":"Repair Verified QB","roleRank":0,"roleEvidence":"Verified cached standard passing line"}]'::jsonb,
 'nominationEvidenceHash',repeat('b',64)) else n end) proposals from repair_nominations cross join lateral jsonb_array_elements(proposals)n;
select lives_ok($$select api.record_player_catalog_nominations((select (response->>'leaseId')::uuid from recovered_repair_lease),(select proposals from corrected_repair_nominations))$$,'normal authority accepts corrected membership with original truthful source timestamps');
select is((select count(*) from private.player_menu_candidates((c->>'event')::uuid,'Away 1','QB_PASS')),1::bigint,'corrected current nominee is available for actual review') from repair_context;
select is((select count(*) from private.player_catalog_nomination_generations),2::bigint,'recovery appends a new generation while retaining invalidated evidence');
select ok(not exists(select 1 from repair_nominations original cross join lateral jsonb_array_elements(original.proposals)o
 join lateral (select n from corrected_repair_nominations corrected cross join lateral jsonb_array_elements(corrected.proposals)n
 where n->>'externalEventId'=o->>'externalEventId' and n->>'team'=o->>'team' and n->>'slot'=o->>'slot')corrected on true
 where o->>'nominationVerifiedAt'<>corrected.n->>'nominationVerifiedAt'),'recovery never advances the source timestamp');
create temporary table repaired_head as table private.player_catalog_nomination_heads;
select is(pg_temp.repair_empty_head()->>'replayed','true','exact replay still succeeds after metadata resumes and a new head exists');
select is((select generation_id from private.player_catalog_nomination_heads),(select generation_id from repaired_head),'late replay does not clear recovered current membership');
select throws_ok($$select api.record_player_catalog_nominations((select (response->>'leaseId')::uuid from recovered_repair_lease),(select proposals from repair_nominations))$$,'55000',null,'normal monotonic evidence ordering still rejects the old faulty generation');
select is((select count(*) from private.effective_position_receipts where week_id=(c->>'week')::uuid),0::bigint,'repair and recovery never create or cancel new picks') from repair_context;
select is((select count(*) from private.week_player_menu where confirmed_at is not null or frozen_at is not null),0::bigint,'repair and recovery do not impersonate commissioner approval');
select * from finish();
rollback;
