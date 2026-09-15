begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
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

-- BEGIN PROGRESSIVE PLAYER PROPS HELPERS
-- Disposable native PostgreSQL fixture only. Callers enforce a loopback DB.
-- Seed a real LIVE Week 2 before any kickoff, then accept via the public RPC.
-- No provider, email, hosted connection, trigger bypass, or receipt mutation.
create function pg_temp.progressive_base_fixture(p_slug text,p_stake integer default 1000,p_owner_id uuid default null,p_intent_id uuid default null,p_nfl_week integer default 2,p_nfl_year integer default 2026,p_event_shift interval default interval '0 hours')
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
   values(events[n],week_id,season_id,league_id,p_slug||'-game-'||n,'Away '||n,'Home '||n,observation+p_event_shift+n*interval '1 hour');
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

-- Disposable fixture only: actual accept/reset/review/cutover/nomination RPCs;
-- source payloads and no-network scheduler stand-ins are explicit test evidence.
create function pg_temp.progressive_fixture(p_label text,p_shift interval default interval '0 hours',p_owner_id uuid default null,p_activate boolean default true) returns jsonb
language plpgsql as $$
declare c jsonb;claim jsonb;proposals jsonb;late jsonb;e private.sports_events%rowtype;
 frozen private.week_player_menu%rowtype;pending private.week_player_menu%rowtype;request_id uuid;stamp timestamptz:=clock_timestamp();
begin
 perform private.configure_nflverse_primary_pilot(repeat('a',64),'Progressive source validation fixture approval');
 perform pg_temp.prepare_after_reset_readiness();
 update private.player_prop_controls set offers_enabled=false;
 update private.player_result_policy set api_sports_contract_validated=false;
 c:=pg_temp.progressive_base_fixture(p_label,p_owner_id=>p_owner_id,p_event_shift=>p_shift);
 perform pg_temp.stage_after_reset_fixture(c);
 perform pg_temp.record_separate_reset(c);
 perform private.start_open_week2_props_catalog((c->>'week')::uuid);
 perform private.authorize_progressive_player_props((c->>'week')::uuid,repeat('c',40),'Owner approved progressive publication for this pilot season');
 claim:=api.claim_player_catalog_job((c->>'week')::uuid);
 -- Verify all directory identities but initially nominate only the first game.
 perform api.import_player_catalog((select jsonb_agg(jsonb_build_object(
 'canonicalKey',ev.fixture_event_key||':'||team||':'||position,'displayName',team||' Verified '||position,'position',position,
 'provider','THE_ODDS_API','externalEventId',ev.fixture_event_key,'externalPlayerId',ev.fixture_event_key||':'||team||':'||position,
 'team',team,'gameDate',(ev.scheduled_start_at at time zone 'America/New_York')::date,'verifiedAt',stamp,
 'evidenceHash',repeat('b',64),'roleRank',0,'roleEvidence','Verified highest standard line fixture','resultPathVerified',true))
 from private.sports_events ev cross join lateral unnest(array[ev.away_team,ev.home_team])team cross join unnest(array['QB','RB','WR'])position
 where ev.week_id=(c->>'week')::uuid));
 select jsonb_agg(jsonb_build_object('externalEventId',ev.fixture_event_key,'team',team,'slot',sl.slot,
 'proposedCanonicalKey',case when ev.id=(c->>'event')::uuid then ev.fixture_event_key||':'||team||':'||sl.position else null end,
 'candidates',case when ev.id=(c->>'event')::uuid then jsonb_build_array(jsonb_build_object('canonicalKey',ev.fixture_event_key||':'||team||':'||sl.position,
 'displayName',team||' Verified '||sl.position,'roleRank',0,'roleEvidence','Verified highest standard line fixture')) else '[]'::jsonb end,
 'warnings','[]'::jsonb,'availableQuotes',case when ev.id=(c->>'event')::uuid then 1 else 0 end,
 'nominationEvidenceHash',repeat('b',64),'nominationVerifiedAt',stamp,'nominationExpiresAt',least(ev.scheduled_start_at,stamp+interval '11 hours'))
 order by ev.fixture_event_key,team,sl.slot) into proposals
 from private.sports_events ev cross join lateral unnest(array[ev.away_team,ev.home_team])team
 cross join(values('QB_PASS','QB'),('RB_RUSH','RB'),('RECEIVER','WR'))sl(slot,position) where ev.week_id=(c->>'week')::uuid;
 perform api.record_player_catalog_nominations((claim->>'leaseId')::uuid,proposals);
 perform api.complete_player_catalog_job((claim->>'leaseId')::uuid,'PENDING',24,'CATALOG_IDENTITIES_OR_ROLES_UNRESOLVED');
 if p_activate then
 perform api.confirm_progressive_player_prop_menu(c->>'slug',(select jsonb_agg(jsonb_build_object('eventId',event_id,'team',team,'slot',slot,'subjectId',subject_id))
 from private.week_player_menu where week_id=(c->>'week')::uuid),'AUTOMATIC_BEFORE_EVENT_CUTOFF');
 c:=c||jsonb_build_object('initialMenuHash',private.week2_props_menu_hash((c->>'week')::uuid));
 c:=c||jsonb_build_object('cutover',private.cutover_open_week2_progressive_props((c->>'week')::uuid,c->>'initialMenuHash',repeat('d',64),repeat('c',40),p_label||'-progressive-cutover','Apply the reviewed progressive policy without a second reset.'));
 end if;
 select * into strict pending from private.week_player_menu where week_id=(c->>'week')::uuid and subject_id is null order by event_id,team,slot limit 1;
 select * into strict e from private.sports_events where id=pending.event_id;
 select n into late from jsonb_array_elements(proposals)n where n->>'externalEventId'=e.fixture_event_key and n->>'team'=pending.team and n->>'slot'=pending.slot;
 late:=late||jsonb_build_object('proposedCanonicalKey',e.fixture_event_key||':'||pending.team||':'||case pending.slot when 'QB_PASS' then 'QB' when 'RB_RUSH' then 'RB' else 'WR' end,
 'candidates',jsonb_build_array(jsonb_build_object('canonicalKey',e.fixture_event_key||':'||pending.team||':'||case pending.slot when 'QB_PASS' then 'QB' when 'RB_RUSH' then 'RB' else 'WR' end,
 'displayName','Verified Late Player','roleRank',0,'roleEvidence','Verified highest standard line fixture')),
 'availableQuotes',1,'nominationEvidenceHash',repeat('e',64),'nominationVerifiedAt',clock_timestamp());
 insert into private.shared_quote_requests(kind,event_ids,families,state,fetched_at)
 values('PROPS',array[e.fixture_event_key],array[case pending.slot when 'QB_PASS' then 'player_pass_yds' when 'RB_RUSH' then 'player_rush_yds' else 'player_reception_yds' end],
 'SUCCEEDED',stamp) returning id into request_id;
 insert into private.player_catalog_quote_evidence(week_id,event_id,family,request_id,expires_at)
 values((c->>'week')::uuid,e.id,case pending.slot when 'QB_PASS' then 'player_pass_yds' when 'RB_RUSH' then 'player_rush_yds' else 'player_reception_yds' end,request_id,stamp+interval '12 hours');
 -- Advance only the synthetic due checkpoint, never the production job timer.
 update private.player_catalog_jobs set next_attempt_at=clock_timestamp() where week_id=(c->>'week')::uuid;
 claim:=api.claim_player_catalog_job((c->>'week')::uuid);
 select * into strict frozen from private.week_player_menu where week_id=(c->>'week')::uuid and subject_id is not null order by event_id,team,slot limit 1;
 perform api.import_player_catalog(jsonb_build_array(jsonb_build_object('canonicalKey',p_label||':frozen-alternate','displayName','Verified Alternate',
 'position',case frozen.slot when 'QB_PASS' then 'QB' when 'RB_RUSH' then 'RB' else 'WR' end,'provider','THE_ODDS_API',
 'externalEventId',(select fixture_event_key from private.sports_events where id=frozen.event_id),'externalPlayerId',p_label||':frozen-alternate','team',frozen.team,
 'gameDate',((select scheduled_start_at from private.sports_events where id=frozen.event_id) at time zone 'America/New_York')::date,
 'verifiedAt',clock_timestamp(),'evidenceHash',repeat('f',64),'roleRank',1,'roleEvidence','Verified alternative identity fixture','resultPathVerified',true)));
 return c||jsonb_build_object('leaseId',claim->>'leaseId','proposals',jsonb_build_array(late),'pendingEvent',e.id,'pendingTeam',pending.team,'pendingSlot',pending.slot,
 'pendingSubject',(select id from private.player_subjects where canonical_key=late->>'proposedCanonicalKey'),
 'frozenEvent',frozen.event_id,'frozenTeam',frozen.team,'frozenSlot',frozen.slot,'frozenSubject',frozen.subject_id,
 'frozenReplacementSubject',(select id from private.player_subjects where canonical_key=p_label||':frozen-alternate'));
end; $$;
-- END PROGRESSIVE PLAYER PROPS HELPERS

-- BEGIN PROGRESSIVE QUOTE DISCOVERY TESTS
create temporary table quote_context as select pg_temp.progressive_fixture('progressive-quotes',interval '36 hours') c;
-- The shared activation fixture seeds one nomination-only proof without an HTTP
-- payload. Remove only that disposable cache row before exercising cold discovery.
delete from private.player_catalog_quote_evidence where week_id=(select (c->>'week')::uuid from quote_context);
create temporary table quote_baseline as select daily_credits,monthly_credits from private.odds_refresh_policy;
create temporary table quote_requests(sequence integer primary key,claim jsonb not null);
create function pg_temp.progressive_quote_payload(p_claim jsonb) returns jsonb language sql as $$
 select jsonb_build_object('source','THE_ODDS_API','fetchedAt',clock_timestamp(),'events',jsonb_build_array(jsonb_build_object(
 'source','THE_ODDS_API','externalEventId',e.fixture_event_key,'sportKey','americanfootball_nfl','awayTeam',e.away_team,'homeTeam',e.home_team,
 'scheduledStartAt',e.scheduled_start_at,'requestedFamilies',p_claim->'families','markets',coalesce((select jsonb_agg(jsonb_build_object(
 'sourceBook','draftkings','marketType',market_type,'statistic',statistic,'period','FULL_GAME',
 'externalPlayerId',e.fixture_event_key||':'||team||':'||position,'outcomeKey',side,'proposition',team||' '||position||' '||side,
 'lineMilli',line,'americanOdds',-110,'observedAt',clock_timestamp()-interval '1 minute'))
 from unnest(array[e.away_team,e.home_team])team cross join(values
 ('player_pass_yds','PLAYER_PASSING_YARDS','PASSING_YARDS','QB',250500),
 ('player_rush_yds','PLAYER_RUSHING_YARDS','RUSHING_YARDS','RB',70500),
 ('player_reception_yds','PLAYER_RECEIVING_YARDS','RECEIVING_YARDS','WR',80500))market(family,market_type,statistic,position,line)
 cross join(values('OVER'),('UNDER'))s(side) where p_claim->'families' ? family),'[]'::jsonb))))
 from private.sports_events e where e.fixture_event_key=p_claim->>'externalEventId' and e.week_id=(select (c->>'week')::uuid from quote_context);
$$;
create function pg_temp.collect_progressive_quotes() returns void language plpgsql as $$
declare n integer;claim jsonb;completed jsonb;wk uuid:=(select (c->>'week')::uuid from quote_context);
begin
 for n in 1..4 loop
  -- Only the synthetic no-HTTP fixture skips three seconds of provider pacing.
  update private.odds_refresh_policy set next_request_at='-infinity';
  claim:=api.claim_player_catalog_quote(wk);
  if claim->>'status'<>'CLAIMED' then raise exception 'Expected cold discovery claim: %',claim;end if;
  insert into quote_requests values(n,claim);
  completed:=api.complete_shared_quote_request((claim->>'requestId')::uuid,pg_temp.progressive_quote_payload(claim),'{"last":3}');
  if completed->>'status'<>'SUCCEEDED' then raise exception 'Expected successful discovery: %',completed;end if;
 end loop;
 perform api.get_player_catalog_quotes(wk);
end; $$;
select ok(private.is_progressive_player_props_week((c->>'week')::uuid),'fixture uses an actually activated reviewed 1.5 week') from quote_context;
select is((select count(*) from private.player_catalog_pending_slots((c->>'week')::uuid)),24::bigint,'four games retain their initially empty slots') from quote_context;
select is((select count(*) from private.player_catalog_discovery_families((c->>'week')::uuid)),12::bigint,'discovery asks only twelve missing event/family pairs') from quote_context;
select ok(not exists(select 1 from private.player_catalog_discovery_families((c->>'week')::uuid) f where f.event_id=(c->>'frozenEvent')::uuid),'the already populated game is outside paid discovery') from quote_context;
select lives_ok($$select pg_temp.collect_progressive_quotes()$$,'missing games use the normal leased quote reservation/completion authorities');
select is((select count(*) from quote_requests),4::bigint,'four distinct missing games are collected');
select is((select policy.daily_credits-b.daily_credits from private.odds_refresh_policy policy cross join quote_baseline b),12,'cold collection costs only three families for four missing games');
select is((api.get_player_catalog_quotes((c->>'week')::uuid)->>'pending')::boolean,false,'fresh discovery is cached even while slot publication remains pending') from quote_context;
select is(api.claim_player_catalog_quote((c->>'week')::uuid)->>'status','CACHED','rereading cached choices reserves no paid request') from quote_context;
update quote_context set c=c||jsonb_build_object('targetEvent',(select e.id from quote_requests r join private.sports_events e on e.fixture_event_key=r.claim->>'externalEventId' where r.sequence=1),
 'targetRequest',(select claim->>'requestId' from quote_requests where sequence=1));
select ok(private.event_entry_closes_at((c->>'targetEvent')::uuid)>clock_timestamp()+interval '24 hours','target cutoff is genuinely more than twenty-four hours away') from quote_context;
select is(private.player_catalog_discovery_retry_at((c->>'targetEvent')::uuid,timestamptz '2026-09-01 12:00Z'),timestamptz '2026-09-01 18:00Z','far-event cache age uses six hours') from quote_context;
select is(private.player_catalog_discovery_retry_at((c->>'targetEvent')::uuid,null),null::timestamptz,'missing source time cannot manufacture a retry time') from quote_context;
-- Publish only the four non-passing slots through the actual append-only
-- authority. The two QB slots remain authorized and empty in the same game.
create function pg_temp.publish_nonpassing_quote_slots() returns jsonb language plpgsql as $$
declare c jsonb;proposals jsonb;
begin
 select q.c into c from quote_context q;
 select jsonb_agg(jsonb_build_object('externalEventId',e.fixture_event_key,'team',m.team,'slot',m.slot,
 'proposedCanonicalKey',e.fixture_event_key||':'||m.team||':'||case m.slot when 'RB_RUSH' then 'RB' else 'WR' end,
 'candidates',jsonb_build_array(jsonb_build_object('canonicalKey',e.fixture_event_key||':'||m.team||':'||case m.slot when 'RB_RUSH' then 'RB' else 'WR' end,
 'displayName','Verified quote fixture player','roleRank',0,'roleEvidence','Verified highest standard line fixture')),
 'warnings','[]'::jsonb,'availableQuotes',1,'nominationEvidenceHash',repeat('a',64),
 'nominationVerifiedAt',clock_timestamp(),'nominationExpiresAt',clock_timestamp()+interval '2 hours')) into proposals
 from private.week_player_menu m join private.sports_events e on e.id=m.event_id
 where m.event_id=(c->>'targetEvent')::uuid and m.slot<>'QB_PASS' and m.subject_id is null;
 return api.record_player_catalog_nominations((c->>'leaseId')::uuid,proposals);
end; $$;
select is(pg_temp.publish_nonpassing_quote_slots()->>'publishedSlots','4','four verified non-passing slots publish through the real authority');
select is((select array_agg(family order by family) from private.player_catalog_discovery_families((c->>'week')::uuid) where event_id=(c->>'targetEvent')::uuid),array['player_pass_yds'],'only the still-empty passing family can trigger another request') from quote_context;
create temporary table published_quote_snapshot as select jsonb_agg(to_jsonb(m) order by event_id,team,slot) menu from private.week_player_menu m where subject_id is not null;
create function pg_temp.age_quote_request(p_request_id uuid,p_fetched_at timestamptz) returns void language sql as $$
 update private.shared_quote_requests r set fetched_at=p_fetched_at,
 payload=jsonb_set(jsonb_set(payload,'{fetchedAt}',to_jsonb(p_fetched_at)),'{events,0,markets}',
  coalesce((select jsonb_agg(m||jsonb_build_object('observedAt',p_fetched_at-interval '1 minute')) from jsonb_array_elements(r.payload#>'{events,0,markets}')m),'[]'::jsonb))
 where r.id=p_request_id;
$$;
-- Move only the disposable source observation time; cache reads must never
-- renew this original time, the source payload or its twelve-hour retention.
select pg_temp.age_quote_request((c->>'targetRequest')::uuid,clock_timestamp()-interval '5 hours') from quote_context;
update private.player_catalog_quote_evidence evidence set expires_at=r.fetched_at+interval '12 hours' from private.shared_quote_requests r where evidence.request_id=r.id;
create temporary table quote_source_snapshot as select r.id,r.fetched_at,r.payload,e.family,e.expires_at from private.shared_quote_requests r
 join private.player_catalog_quote_evidence e on e.request_id=r.id where r.id=(select (c->>'targetRequest')::uuid from quote_context);
select is((api.get_player_catalog_quotes((c->>'week')::uuid)->>'pending')::boolean,false,'five-hour-old far-event observation remains cached') from quote_context;
select is(api.claim_player_catalog_quote((c->>'week')::uuid)->>'status','CACHED','five-hour-old far-event missing slot does not spend again') from quote_context;
select is((select jsonb_agg(to_jsonb(snapshot) order by family) from (select r.id,r.fetched_at,r.payload,e.family,e.expires_at from private.shared_quote_requests r join private.player_catalog_quote_evidence e on e.request_id=r.id where r.id=(select (c->>'targetRequest')::uuid from quote_context))snapshot),
 (select jsonb_agg(to_jsonb(snapshot) order by family) from quote_source_snapshot snapshot),'repeated reads retain original source timestamps, payload and expiry');
select pg_temp.age_quote_request((c->>'targetRequest')::uuid,clock_timestamp()-interval '6 hours 1 minute') from quote_context;
update private.player_catalog_quote_evidence evidence set expires_at=r.fetched_at+interval '12 hours' from private.shared_quote_requests r where evidence.request_id=r.id;
select is((api.get_player_catalog_quotes((c->>'week')::uuid)->>'pending')::boolean,true,'six-hour-old still-empty family becomes due') from quote_context;
update private.odds_refresh_policy set next_request_at='-infinity';
-- Another consumer may have planned a broader request. This narrow discovery
-- must not turn that plan into paid requests for already populated families.
create temporary table planned_superset as
 with request as(insert into private.shared_quote_requests(kind,event_ids,families)
 select 'PROPS',array[e.fixture_event_key],array['player_pass_yds','player_rush_yds','player_reception_yds']
 from private.sports_events e where e.id=(select (c->>'targetEvent')::uuid from quote_context) returning id)
 select id from request;
update private.shared_quote_coverage set request_id=(select id from planned_superset)
 where external_event_id=(select fixture_event_key from private.sports_events where id=(select (c->>'targetEvent')::uuid from quote_context));
create temporary table passing_retry as select api.claim_player_catalog_quote((c->>'week')::uuid) claim from quote_context;
select is(claim->>'status','CLAIMED','due progressive family obtains an ordinary reserved request') from passing_retry;
select is(claim->'families','["player_pass_yds"]'::jsonb,'the retry buys only passing yards, excluding populated families') from passing_retry;
select is((select state from private.shared_quote_requests where id=(select id from planned_superset)),'PLANNED','narrow discovery does not charge an unrelated broader planned request');
select is((select policy.daily_credits-b.daily_credits from private.odds_refresh_policy policy cross join quote_baseline b),13,'one missing family adds one credit');
select is(api.complete_shared_quote_request((claim->>'requestId')::uuid,pg_temp.progressive_quote_payload(claim),'{"last":1}')->>'status','SUCCEEDED','single-family retry records its actual response') from passing_retry;
select api.get_player_catalog_quotes((c->>'week')::uuid) from quote_context;
select is((select count(*) from private.player_catalog_quote_evidence where event_id=(c->>'targetEvent')::uuid and family<>'player_pass_yds' and request_id=(c->>'targetRequest')::uuid),2::bigint,'positive evidence for published families remains retained without refetch') from quote_context;
select is((select jsonb_agg(to_jsonb(m) order by event_id,team,slot) from private.week_player_menu m where subject_id is not null),(select menu from published_quote_snapshot),'discovery does not replace any initially or automatically published player');
-- Moving a synthetic event earlier is allowed by the same monotonic cutoff
-- authority. It exposes the within-twenty-four-hour three-hour cadence.
update private.sports_events set scheduled_start_at=clock_timestamp()+interval '25 hours' where id=(select (c->>'targetEvent')::uuid from quote_context);
select is(private.player_catalog_discovery_retry_at((c->>'targetEvent')::uuid,private.event_entry_closes_at((c->>'targetEvent')::uuid)-interval '28 hours'),
 private.event_entry_closes_at((c->>'targetEvent')::uuid)-interval '24 hours','a six-hour timer advances when the twenty-four-hour boundary makes three-hour evidence due') from quote_context;
select is(private.player_catalog_discovery_retry_at((c->>'targetEvent')::uuid,private.event_entry_closes_at((c->>'targetEvent')::uuid)-interval '26 hours'),
 private.event_entry_closes_at((c->>'targetEvent')::uuid)-interval '23 hours','recent evidence retains its full three-hour age across the cadence boundary') from quote_context;
update private.sports_events set scheduled_start_at=clock_timestamp()+interval '20 hours' where id=(select (c->>'targetEvent')::uuid from quote_context);
select is(private.player_catalog_discovery_retry_at((c->>'targetEvent')::uuid,timestamptz '2026-09-01 12:00Z'),timestamptz '2026-09-01 15:00Z','within twenty-four hours uses three hours from the original observation') from quote_context;
select pg_temp.age_quote_request((claim->>'requestId')::uuid,clock_timestamp()-interval '3 hours 1 minute') from passing_retry;
select is(private.player_catalog_discovery_evidence_current((c->>'week')::uuid,(c->>'targetEvent')::uuid,'player_pass_yds'),false,'three-hour-old pending-family evidence becomes due inside twenty-four hours') from quote_context;
select ok(private.progressive_player_catalog_next_attempt((c->>'week')::uuid)<=clock_timestamp(),'the next-attempt helper reports currently due pending work') from quote_context;
update private.odds_refresh_policy set next_request_at=clock_timestamp()+interval '30 minutes';
select is(api.claim_player_catalog_quote((c->>'week')::uuid)->>'status','WAIT','progressive retries preserve shared provider backoff') from quote_context;
select is((select policy.daily_credits-b.daily_credits from private.odds_refresh_policy policy cross join quote_baseline b),13,'provider backoff reserves no extra credits');
update private.odds_refresh_policy set next_request_at='-infinity';
select lives_ok($$select pg_temp.accept_after_reset_fixture(c,(c->>'member')::uuid) from quote_context$$,'new game bets do not prohibit discovery for approved empty slots');
update private.sports_events set actual_started_at=clock_timestamp() where id=(select (c->>'frozenEvent')::uuid from quote_context);
select ok(exists(select 1 from private.player_catalog_discovery_families((c->>'week')::uuid) where event_id=(c->>'targetEvent')::uuid),'another game starting does not close the target event discovery') from quote_context;
update private.sports_events set scheduled_start_at=clock_timestamp()-interval '1 minute' where id=(select (c->>'targetEvent')::uuid from quote_context);
select ok(not exists(select 1 from private.player_catalog_discovery_families((c->>'week')::uuid) where event_id=(c->>'targetEvent')::uuid),'the target event cutoff removes its pending families') from quote_context;
select is(api.claim_player_catalog_quote((c->>'week')::uuid)->>'status','CACHED','closed target work cannot trigger a provider request while other families remain cached') from quote_context;
select is((select count(*) from private.card_reset_events where week_id=(c->>'week')::uuid),1::bigint,'discovery never repeats the prior reset') from quote_context;
select is((select count(*) from private.effective_position_receipts where week_id=(c->>'week')::uuid),1::bigint,'the new accepted bet remains untouched') from quote_context;
select ok(not has_function_privilege('authenticated','private.progressive_player_catalog_next_attempt(uuid)','EXECUTE'),'participants cannot invoke the private scheduling helper');
select ok(not has_function_privilege('authenticated','api.claim_player_catalog_quote(uuid)','EXECUTE'),'participants cannot spend discovery quota');
select * from finish();
rollback;
