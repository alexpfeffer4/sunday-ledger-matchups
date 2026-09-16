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
create function pg_temp.progressive_fixture(p_label text,p_shift interval default interval '0 hours',p_owner_id uuid default null,p_activate boolean default true,p_initial_available boolean default true) returns jsonb
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
 'proposedCanonicalKey',case when ev.id=(c->>'event')::uuid and p_initial_available then ev.fixture_event_key||':'||team||':'||sl.position else null end,
 'candidates',case when ev.id=(c->>'event')::uuid and p_initial_available then jsonb_build_array(jsonb_build_object('canonicalKey',ev.fixture_event_key||':'||team||':'||sl.position,
 'displayName',team||' Verified '||sl.position,'roleRank',0,'roleEvidence','Verified highest standard line fixture')) else '[]'::jsonb end,
 'warnings','[]'::jsonb,'availableQuotes',case when ev.id=(c->>'event')::uuid and p_initial_available then 1 else 0 end,
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
 select * into strict frozen from private.week_player_menu where week_id=(c->>'week')::uuid order by (subject_id is null),event_id,team,slot limit 1;
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
create function pg_temp.progressive_future_fixture(c jsonb,p_week integer) returns uuid language plpgsql as $$
declare wk uuid:=gen_random_uuid();slate uuid:=gen_random_uuid();ev uuid:=gen_random_uuid();quote uuid:=gen_random_uuid();t timestamptz:=clock_timestamp()+interval '48 hours';
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',c->>'owner','role','authenticated')::text,true);
 insert into private.season_weeks(id,season_id,league_id,nfl_week,state,opens_at,common_lock_at)
 values(wk,(c->>'season')::uuid,(c->>'league')::uuid,p_week,'PLANNED',clock_timestamp(),t-interval '5 minutes');
 insert into private.sports_events(id,week_id,season_id,league_id,fixture_event_key,away_team,home_team,scheduled_start_at)
 values(ev,wk,(c->>'season')::uuid,(c->>'league')::uuid,c->>'slug'||'-future-'||p_week,'Future Away','Future Home',t);
 insert into private.slates(id,week_id,season_id,league_id,version,fixture_id,common_lock_at)
 values(slate,wk,(c->>'season')::uuid,(c->>'league')::uuid,1,c->>'slug'||'-future-'||p_week,t-interval '5 minutes');
 insert into private.market_snapshots(id,event_id,week_id,league_id,book_key,market_type,outcome_key,proposition,american_odds,quality_status,observed_at,payload_hash)
 values(quote,ev,wk,(c->>'league')::uuid,'draftkings','MONEYLINE','HOME','Future home win',100,'HEALTHY',clock_timestamp(),encode(extensions.digest(quote::text,'sha256'),'hex'));
 insert into private.slate_items(slate_id,event_id,market_snapshot_id,week_id,league_id) values(slate,ev,quote,wk,(c->>'league')::uuid);
 perform api.prepare_player_prop_menu(c->>'slug');
 return wk;
end; $$;
-- END PROGRESSIVE PLAYER PROPS HELPERS

create temporary table progressive_context as select pg_temp.progressive_fixture('progressive-props-test') c;
select is(c#>>'{cutover,rulesetVersion}','1.5','partial reviewed cutover binds the prepared 1.5 package') from progressive_context;
select is((select count(*) from private.week_player_menu where week_id=(c->>'week')::uuid and frozen_at is not null),6::bigint,'only the initial six published players freeze') from progressive_context;
select is((select count(*) from private.player_catalog_pending_slots((c->>'week')::uuid)),24::bigint,'the other structural slots remain eligible') from progressive_context;
select is((select count(*) from private.card_reset_events where week_id=(c->>'week')::uuid),1::bigint,'progressive cutover reuses the completed reset') from progressive_context;
select is((select count(*) from private.player_prop_slot_publications),0::bigint,'initial human choices are not represented as automatic publications');
select lives_ok($$select api.record_player_catalog_nominations((c->>'leaseId')::uuid,c->'proposals') from progressive_context$$,'normal leased publication fills an approved empty slot');
select is((select count(*) from private.player_prop_slot_publications),1::bigint,'one automatic publication audit exists');
select is((select subject_id from private.week_player_menu where event_id=(c->>'pendingEvent')::uuid and team=c->>'pendingTeam' and slot=c->>'pendingSlot'),(c->>'pendingSubject')::uuid,'the verified late player fills the slot') from progressive_context;
select is(api.record_player_catalog_nominations((c->>'leaseId')::uuid,c->'proposals')->>'replayed','true','same lease and evidence replay without another publication') from progressive_context;
select is((api.get_player_prop_menu(c->>'slug')->>'progressiveAvailability')::boolean,true,'member read model exposes progressive availability') from progressive_context;
select is((select item->>'publicationMode' from jsonb_array_elements(api.get_player_prop_menu(c->>'slug')->'slots') item where item->>'eventId'=c->>'pendingEvent' and item->>'team'=c->>'pendingTeam' and item->>'slot'=c->>'pendingSlot'),'AUTOMATIC','automatic provenance is explicit') from progressive_context;
select throws_ok($$update private.week_player_menu set subject_id=(c->>'frozenReplacementSubject')::uuid from progressive_context where event_id=(c->>'frozenEvent')::uuid and team=c->>'frozenTeam' and slot=c->>'frozenSlot'$$,'55000',null,'initial published identity cannot be replaced');
select lives_ok($$select pg_temp.accept_after_reset_fixture(c,(c->>'member')::uuid) from progressive_context$$,'ordinary main betting remains available after progressive publication');
select is((select count(*) from private.week_player_menu where week_id=(c->>'week')::uuid and subject_id is null and frozen_at is not null),0::bigint,'accepted game bets do not freeze pending empty slots') from progressive_context;
select is((select count(*) from private.effective_position_receipts where week_id=(c->>'week')::uuid),1::bigint,'the accepted new bet remains effective') from progressive_context;
select is((select count(*) from private.card_reset_events where week_id=(c->>'week')::uuid),1::bigint,'there is still exactly one historical reset') from progressive_context;

-- Private authority stays unavailable to application participants and tokens.
select function_privs_are('private','publish_progressive_player_slots',array['uuid','jsonb'],role_name,array[]::text[],role_name||' cannot directly publish slots') from unnest(array['anon','authenticated','service_role'])role_name;
select function_privs_are('api','record_player_catalog_nominations',array['uuid','jsonb'],'authenticated',array[]::text[],'members cannot submit catalog nominations');
select table_privs_are('private','player_prop_slot_publications',role_name,array[]::text[],role_name||' cannot mutate publication audit') from unnest(array['anon','authenticated','service_role'])role_name;
select is((select count(*) from pg_policy where polrelid='private.player_prop_slot_publications'::regclass),0::bigint,'publication audit has no participant RLS policies');
select throws_ok($$update private.player_prop_slot_publications set evidence_hash=repeat('f',64)$$,'55000',null,'publication evidence is append-only');
select throws_ok($$delete from private.player_prop_empty_slots$$,'55000',null,'initial empty-slot authorization cannot be deleted');
select is((select count(*) from private.player_catalog_nomination_generations where week_id=(c->>'week')::uuid),1::bigint,'late publication preserves the original whole-week nomination head/history') from progressive_context;
create function pg_temp.progressive_review_trial(p_fault text) returns text language plpgsql as $$
declare c jsonb;choices jsonb;outcome text;generation jsonb;
begin
 begin
 c:=pg_temp.progressive_fixture('review-trial-'||p_fault,p_activate=>false);
 select jsonb_agg(jsonb_build_object('eventId',event_id,'team',team,'slot',slot,'subjectId',subject_id)) into choices from private.week_player_menu where week_id=(c->>'week')::uuid;
 begin
 case p_fault
 when 'legacy' then perform api.confirm_player_prop_menu(c->>'slug',choices);
 when 'bad-ack' then perform api.confirm_progressive_player_prop_menu(c->>'slug',choices,'FIRST_ACCEPTED_SUBMISSION');
 when 'member' then
 perform set_config('request.jwt.claims',jsonb_build_object('sub',c->>'member','role','authenticated')::text,true);
 perform api.confirm_progressive_player_prop_menu(c->>'slug',choices,'AUTOMATIC_BEFORE_EVENT_CUTOFF');
 when 'unreviewed' then perform private.cutover_open_week2_progressive_props((c->>'week')::uuid,private.week2_props_menu_hash((c->>'week')::uuid),repeat('d',64),repeat('c',40),'unreviewed-cutover','The actual review is deliberately absent.');
 when 'tie' then
 select g.nominations into generation from private.player_catalog_nomination_heads h join private.player_catalog_nomination_generations g on g.id=h.generation_id where h.week_id=(c->>'week')::uuid;
 generation:=(select jsonb_agg(case when n->>'externalEventId'=(select fixture_event_key from private.sports_events where id=(c->>'frozenEvent')::uuid) and n->>'team'=c->>'frozenTeam' and n->>'slot'=c->>'frozenSlot' then n||jsonb_build_object('warnings','["Equally ranked candidates; confirm the proposed choice."]'::jsonb,'nominationEvidenceHash',repeat('f',64),'nominationVerifiedAt',clock_timestamp()) else n end) from jsonb_array_elements(generation)n);
 perform api.record_player_catalog_nominations((c->>'leaseId')::uuid,generation);
 perform api.confirm_progressive_player_prop_menu(c->>'slug',choices,'AUTOMATIC_BEFORE_EVENT_CUTOFF');
 when 'lower-player' then
 select g.nominations into generation from private.player_catalog_nomination_heads h join private.player_catalog_nomination_generations g on g.id=h.generation_id where h.week_id=(c->>'week')::uuid;
 generation:=(select jsonb_agg(case when n->>'externalEventId'=(select fixture_event_key from private.sports_events where id=(c->>'frozenEvent')::uuid) and n->>'team'=c->>'frozenTeam' and n->>'slot'=c->>'frozenSlot' then n||jsonb_build_object('candidates',(n->'candidates')||jsonb_build_array(jsonb_build_object('canonicalKey',(select canonical_key from private.player_subjects where id=(c->>'frozenReplacementSubject')::uuid),'displayName','Verified Alternative','roleRank',1,'roleEvidence','Verified lower standard line fixture')),'nominationEvidenceHash',repeat('f',64),'nominationVerifiedAt',clock_timestamp()) else n end) from jsonb_array_elements(generation)n);
 perform api.record_player_catalog_nominations((c->>'leaseId')::uuid,generation);
 choices:=(select jsonb_agg(case when choice->>'eventId'=c->>'frozenEvent' and choice->>'team'=c->>'frozenTeam' and choice->>'slot'=c->>'frozenSlot' then choice||jsonb_build_object('subjectId',c->>'frozenReplacementSubject') else choice end) from jsonb_array_elements(choices)choice);
 perform api.confirm_progressive_player_prop_menu(c->>'slug',choices,'AUTOMATIC_BEFORE_EVENT_CUTOFF');
 end case;outcome:='ACCEPTED';
 exception when others then outcome:=sqlstate;end;
 raise exception using errcode='ZX001',message=outcome;
 exception when sqlstate 'ZX001' then return sqlerrm;end;
end; $$;
select is(pg_temp.progressive_review_trial('legacy'),'55000','stale legacy form cannot imply approval of progressive policy');
select is(pg_temp.progressive_review_trial('bad-ack'),'22023','wrong policy acknowledgment is rejected');
select is(pg_temp.progressive_review_trial('member'),'42501','only actual commissioner can approve initial policy/menu');
select is(pg_temp.progressive_review_trial('unreviewed'),'55000','owner standing approval does not impersonate initial commissioner review');
select is(pg_temp.progressive_review_trial('lower-player'),'22023','a verified rank-1 candidate cannot replace the highest nominee in initial review');
select is(pg_temp.progressive_review_trial('tie'),'22023','a tied nominee must remain unavailable in the initial progressive review');

create function pg_temp.progressive_empty_week2_trial() returns jsonb language plpgsql as $$
declare c jsonb;answer jsonb;
begin
 begin
 c:=pg_temp.progressive_fixture('all-empty-week-two',p_initial_available=>false);
 answer:=jsonb_build_object('version',c#>>'{cutover,rulesetVersion}',
 'pending',(select count(*) from private.player_catalog_pending_slots((c->>'week')::uuid)),
 'selected',(select count(*) from private.week_player_menu where week_id=(c->>'week')::uuid and subject_id is not null),
 'resets',(select count(*) from private.card_reset_events where week_id=(c->>'week')::uuid),
 'activated',(api.get_player_prop_menu(c->>'slug')->>'progressiveActivated')::boolean,
 'readOnly',(api.get_player_prop_menu(c->>'slug')->>'frozen')::boolean);
 raise exception using errcode='ZX001',message=answer::text;
 exception when sqlstate 'ZX001' then return sqlerrm::jsonb;end;
end; $$;
select is(pg_temp.progressive_empty_week2_trial(),'{"version":"1.5","pending":30,"selected":0,"resets":1,"activated":true,"readOnly":true}'::jsonb,'all-empty reviewed Week 2 activates with pending slots and the unchanged single reset');
create function pg_temp.progressive_publication_trial(p_fault text) returns jsonb language plpgsql as $$
declare c jsonb;proposals jsonb;answer jsonb;
begin
 begin
 c:=pg_temp.progressive_fixture('publish-trial-'||p_fault);proposals:=c->'proposals';
 case p_fault
 when 'warning' then proposals:=jsonb_set(proposals,'{0,warnings}','["Identity ambiguity remains"]'::jsonb);
 when 'expired' then proposals:=jsonb_set(proposals,'{0,nominationExpiresAt}',to_jsonb(clock_timestamp()-interval '1 second'));
 when 'cutoff' then update private.sports_events set scheduled_start_at=clock_timestamp()-interval '1 second' where id=(c->>'pendingEvent')::uuid;
 when 'started' then update private.sports_events set actual_started_at=clock_timestamp(),state='LIVE' where id=(c->>'pendingEvent')::uuid;
 when 'other-started' then update private.sports_events set actual_started_at=clock_timestamp(),state='LIVE' where id=(c->>'event')::uuid;
 when 'offers-off' then update private.player_prop_controls set offers_enabled=false;
 end case;
 begin answer:=api.record_player_catalog_nominations((c->>'leaseId')::uuid,proposals);
 exception when others then answer:=jsonb_build_object('sqlstate',sqlstate);end;
 answer:=answer||jsonb_build_object('auditCount',(select count(*) from private.player_prop_slot_publications where week_id=(c->>'week')::uuid));
 raise exception using errcode='ZX001',message=answer::text;
 exception when sqlstate 'ZX001' then return sqlerrm::jsonb;end;
end; $$;
select is(pg_temp.progressive_publication_trial('warning')->>'auditCount','0','ambiguous late evidence remains unavailable');
select is(pg_temp.progressive_publication_trial('expired')->>'sqlstate','22023','expired nomination cannot publish');
select is(pg_temp.progressive_publication_trial('cutoff')->>'auditCount','0','late slot cannot publish after its scheduled cutoff');
select is(pg_temp.progressive_publication_trial('started')->>'auditCount','0','confirmed actual start closes its own pending slots');
select is(pg_temp.progressive_publication_trial('other-started')->>'auditCount','1','another started game does not close this future game');
select is(pg_temp.progressive_publication_trial('offers-off')->>'sqlstate','55000','disabled offers suspend new automatic publication');

-- Future weeks in this exact season inherit 1.5 prospectively, with a new
-- actual review. An all-empty reviewed menu is valid and remains read-only.
create temporary table future_progressive_week as select pg_temp.progressive_future_fixture(c,3) week_id from progressive_context;
select ok(exists(select 1 from private.player_prop_progressive_authorizations where week_id=(select week_id from future_progressive_week)),'standing season policy enrolls a future unopened week');
select throws_ok($$select api.open_reviewed_player_prop_week(c->>'slug','future-unreviewed-open') from progressive_context$$,'55000',null,'future week cannot bypass its own actual review');
select lives_ok($$select api.confirm_progressive_player_prop_menu(c->>'slug',(select jsonb_agg(jsonb_build_object('eventId',event_id,'team',team,'slot',slot,'subjectId',subject_id)) from private.week_player_menu where week_id=(select week_id from future_progressive_week)),'AUTOMATIC_BEFORE_EVENT_CUTOFF') from progressive_context$$,'commissioner can explicitly review a fully unavailable future menu');
select ok(private.progressive_initial_menu_ready((select week_id from future_progressive_week)),'all-empty future slate meets explicit review readiness');
select is(api.open_reviewed_player_prop_week(c->>'slug','future-progressive-week-three')->>'rulesetVersion','1.5','future week opens with scoped 1.5 instead of downgrading to 1.4') from progressive_context;
select is((api.get_player_prop_menu(c->>'slug')->>'frozen')::boolean,true,'activated all-empty menu is read-only even without any published player') from progressive_context;
select is((api.get_player_prop_menu(c->>'slug')->>'progressiveActivated')::boolean,true,'activation state is explicit for all-empty week') from progressive_context;
select is((select count(*) from private.player_catalog_pending_slots((select week_id from future_progressive_week))),6::bigint,'all six future empty slots remain eligible for automatic publication');
select throws_ok($$select api.confirm_progressive_player_prop_menu(c->>'slug',(select jsonb_agg(jsonb_build_object('eventId',event_id,'team',team,'slot',slot,'subjectId',subject_id)) from private.week_player_menu where week_id=(select week_id from future_progressive_week)),'AUTOMATIC_BEFORE_EVENT_CUTOFF') from progressive_context$$,'55000',null,'activated all-empty policy cannot be re-reviewed or replaced');
create temporary table next_progressive_week as select pg_temp.progressive_future_fixture(c,4) week_id from progressive_context;
select api.confirm_progressive_player_prop_menu(c->>'slug',(select jsonb_agg(jsonb_build_object('eventId',event_id,'team',team,'slot',slot,'subjectId',subject_id)) from private.week_player_menu where week_id=(select week_id from next_progressive_week)),'AUTOMATIC_BEFORE_EVENT_CUTOFF') from progressive_context;
select is(api.open_reviewed_player_prop_week(c->>'slug','future-progressive-week-four')->>'rulesetVersion','1.5','following week retains the exact supported 1.5 snapshot') from progressive_context;
select is((select count(*) from private.authoritative_season_rulesets where ruleset_version='1.5'),0::bigint,'global catalogs remain unchanged');
select is((select canonical_json->>'version' from private.prepared_player_props_rulesets where mode='LIVE'),'1.4','prepared legacy 1.4 package remains unchanged');
-- V2.2 automation extends the existing progressive fixture authority.
\ir fixtures/season_automation.sql.inc
create temporary table automation_context as select pg_temp.automation_context('auto-two-weeks') c;
create temporary table auto_weeks as select 3 n,pg_temp.automation_stage(c,3,true) wk from automation_context;
select is((select count(*) from private.weekly_cards where week_id=(select wk from auto_weeks where n=3)),0::bigint,'automatic staging grants no credits or cards');
select is((select state from private.season_weeks where id=(select wk from auto_weeks where n=3)),'PLANNED','automatic preparation remains PLANNED');
select is(api.complete_season_automation(pg_temp.automation_run(c,'VALIDATE',3))->>'status','VALIDATED','first automatic week validates under season approval') from automation_context;
select is((select count(*) from private.player_prop_progressive_reviews where week_id=(select wk from auto_weeks where n=3)),0::bigint,'SYSTEM validation creates no human review');
select ok(not exists(select 1 from private.week_player_menu where week_id=(select wk from auto_weeks where n=3) and confirmed_by is not null),'SYSTEM validation never attributes review to commissioner');
select is(api.complete_season_automation(pg_temp.automation_run(c,'OPEN',3))->>'status','OPENED','first week opens automatically with a partial menu') from automation_context;
select is((select count(*) from private.weekly_cards where week_id=(select wk from auto_weeks where n=3)),4::bigint,'opening grants exactly one card per member');
select is((select sum(granted_credits) from private.weekly_cards where week_id=(select wk from auto_weeks where n=3)),4000::bigint,'opening grants exactly 1000 credits each');
select is((select count(*) from private.player_prop_empty_slots where week_id=(select wk from auto_weeks where n=3)),5::bigint,'only exact unavailable slots are authorized for later publication');
select is((api.get_player_prop_menu(c->>'slug')->>'automaticValidation')::boolean,true,'UI identifies automatic validation truthfully') from automation_context;
select is((api.get_player_prop_menu(c->>'slug')->>'canOpen')::boolean,false,'automatic scope has no routine commissioner opening confirmation') from automation_context;
select api.configure_season_automation(c->>'slug','PAUSE') from automation_context;
select is((select count(*) from private.player_catalog_pending_slots((select wk from auto_weeks where n=3))),5::bigint,'lifecycle pause preserves approved pending-slot continuation');
update private.season_automation set suspended=true,attempts=4 where season_id=(select (c->>'season')::uuid from automation_context);
select is(pg_temp.automation_late_fill((select wk from auto_weeks where n=3))->>'publishedSlots','1','actual pending-slot publication continues under SYSTEM activation despite lifecycle pause and retry suspension');
select is((select sum(granted_credits) from private.weekly_cards where week_id=(select wk from auto_weeks where n=3)),4000::bigint,'late fill grants no extra credits');
select api.configure_season_automation(c->>'slug','RESUME') from automation_context;
update private.season_weeks set state='FINAL' where id=(select wk from auto_weeks where n=3);
insert into auto_weeks select 4,pg_temp.automation_stage(c,4,false) from automation_context;
select is(api.complete_season_automation(pg_temp.automation_run(c,'VALIDATE',4))->>'status','VALIDATED','successive all-unavailable week validates with the same approval') from automation_context;
select is(api.complete_season_automation(pg_temp.automation_run(c,'OPEN',4))->>'status','OPENED','successive all-unavailable week opens without human confirmation') from automation_context;
select lives_ok(format('select private.prepare_player_menu(%L::uuid)',wk),'all-unavailable activated menu survives ordinary card preparation without structural inserts') from auto_weeks where n=4;
select is((select count(*) from private.week_player_menu where week_id=(select wk from auto_weeks where n=4)),6::bigint,'ordinary card preparation preserves all six unavailable authorized slots');
select is((select count(*) from private.season_automation_consents where season_id=(select (c->>'season')::uuid from automation_context)),1::bigint,'two successive weeks use exactly one season approval');
select is((select count(*) from private.player_prop_progressive_reviews where week_id in(select wk from auto_weeks)),0::bigint,'neither future week contains a fictitious human review');
select is((select count(*) from private.player_prop_progressive_activations where week_id in(select wk from auto_weeks) and system_validation_id is not null),2::bigint,'each week has its own content-bound SYSTEM activation');
select ok(not has_function_privilege('authenticated','api.complete_season_automation(uuid,jsonb,jsonb,text)','execute'),'members cannot execute scheduled commands');
select ok(not has_function_privilege('anon','api.configure_season_automation(text,text,integer,text,text)','execute'),'anonymous cannot enroll');
select ok(not has_function_privilege('service_role','private.lifecycle_publish_next_live_week_slate(uuid,uuid,text[],text,uuid)','execute'),'service cannot bypass claimed-run wrapper');
-- Seed the expensive, already-covered manual Week 2 baseline once. Each
-- fault still stages and exercises its own automatic week inside a rolled-back
-- subtransaction, so mutations, receipts and policy changes cannot leak.
create temporary table automation_trial_context as select pg_temp.automation_context('auto-trial-baseline') c;
create temporary table automation_other_context as select pg_temp.automation_context('auto-other-baseline') c;
create function pg_temp.automation_trial(fault text) returns jsonb language plpgsql as $$
declare c jsonb;other_context jsonb;wk uuid;r uuid;j jsonb;answer jsonb;g uuid;nominees jsonb;
begin
 begin
 select t.c into strict c from automation_trial_context t;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',c->>'owner','role','authenticated')::text,true);
 wk:=pg_temp.automation_stage(c,3,true,case when fault='early' then clock_timestamp()+interval '1 hour' else null end);
 if fault in('wrong-role','wrong-team','wrong-event','tie','stale','warning') then
 select nominations into nominees from private.player_catalog_nomination_generations where id=(select generation_id from private.player_catalog_nomination_heads where week_id=wk);
 select jsonb_agg(case when n->>'proposedCanonicalKey' is null then n else
 case fault when 'wrong-role' then jsonb_set(n,'{slot}','"RB_RUSH"')
 when 'wrong-team' then jsonb_set(n,'{team}','"Unrelated team"')
 when 'wrong-event' then jsonb_set(n,'{externalEventId}','"Unrelated event"')
 when 'tie' then jsonb_set(n,'{candidates}',(n->'candidates')||(n->'candidates'))
 when 'stale' then jsonb_set(n,'{nominationExpiresAt}',to_jsonb(clock_timestamp()-interval '1 second'))
 when 'warning' then jsonb_set(n,'{warnings}','["Ambiguous evidence"]') end end) into nominees from jsonb_array_elements(nominees)n;
 -- New immutable source generation simulates evidence changing under the worker.
 insert into private.player_catalog_nomination_generations(week_id,source_validation_id,nominations,content_hash)
 values(wk,(select source_validation_id from private.player_result_policy where singleton),nominees,encode(extensions.digest(nominees::text,'sha256'),'hex')) returning id into g;
 update private.player_catalog_nomination_heads set generation_id=g where week_id=wk;
 end if;
 if fault='absent-consent' then update private.season_automation set revoked=true where season_id=(c->>'season')::uuid;end if;
 if fault='wrong-season' then
 select t.c into strict other_context from automation_other_context t;
 update private.season_automation set consent_id=(select consent_id from private.season_automation where season_id=(other_context->>'season')::uuid) where season_id=(c->>'season')::uuid;
 end if;
 r:=pg_temp.automation_run(c,'VALIDATE',3);
 begin j:=api.complete_season_automation(r);exception when others then j:=jsonb_build_object('status',sqlstate);end;
 if fault in('wrong-role','wrong-team','wrong-event','tie','stale','warning','absent-consent','wrong-season') then
 answer:=j||jsonb_build_object('available',(select count(*) from private.week_player_menu where week_id=wk and subject_id is not null));
 else
 r:=pg_temp.automation_run(c,'OPEN',3);
 case fault
 when 'pause' then perform api.configure_season_automation(c->>'slug','PAUSE');
 when 'revoke' then perform api.configure_season_automation(c->>'slug','REVOKE');
 when 'expired-lease' then update private.season_automation_runs set lease_until=clock_timestamp()-interval '1 second' where id=r;
 when 'stale-generation' then update private.season_automation set generation=generation+1 where season_id=(c->>'season')::uuid;
 when 'missing-game' then update private.sports_events set away_team='Changed fixture team' where week_id=wk;
 when 'cutoff' then update private.sports_events set actual_started_at=clock_timestamp(),state='LIVE' where week_id=wk;
 when 'previous-pending' then update private.season_weeks set state='PROVISIONAL' where id=(c->>'week')::uuid;
 when 'content-race' then update private.week_player_menu set unavailable_reason='Changed evidence' where week_id=wk and subject_id is null;
 when 'policy-change' then execute 'create or replace function private.season_automation_policy_hash() returns text language sql immutable as $fn$ select repeat(''f'',64) $fn$';
 when 'offers-off' then update private.player_prop_controls set offers_enabled=false;
 when 'source-off' then update private.player_result_policy set processing_enabled=false;
 when 'renew' then
 perform api.configure_season_automation(c->>'slug','REVOKE');
 perform api.configure_season_automation(c->>'slug','ENABLE',3,'ALL_NFL_GAMES',private.season_automation_policy_hash());
 j:=api.complete_season_automation(pg_temp.automation_run(c,'VALIDATE',3));r:=pg_temp.automation_run(c,'OPEN',3);
 else null;
 end case;
 begin j:=api.complete_season_automation(r);exception when others then j:=jsonb_build_object('status',sqlstate);end;
 if fault='replay' then j:=api.complete_season_automation(r);end if;
 if fault in('content-race','previous-pending') then
 if fault='previous-pending' then update private.season_weeks set state='FINAL' where id=(c->>'week')::uuid;end if;
 perform api.complete_season_automation(pg_temp.automation_run(c,'VALIDATE',3));
 j:=api.complete_season_automation(pg_temp.automation_run(c,'OPEN',3));
 end if;
 answer:=j||jsonb_build_object('cards',(select count(*) from private.weekly_cards where week_id=wk),
 'activations',(select count(*) from private.player_prop_progressive_activations where week_id=wk),
 'systemReceipts',(select count(*) from private.command_receipts where league_id=(c->>'league')::uuid and execution_kind='SYSTEM' and actor_user_id is null),
 'consents',(select count(*) from private.season_automation_consents where season_id=(c->>'season')::uuid));
 end if;
 raise exception using errcode='ZX001',message=answer::text;
 exception when sqlstate 'ZX001' then return sqlerrm::jsonb;end;
end $$;
-- Evaluate each fault once; multiple assertions inspect that same execution.
create temporary table automation_trial_results as
 select fault,pg_temp.automation_trial(fault) result from unnest(array[
 'wrong-role','wrong-team','wrong-event','tie','stale','warning',
 'absent-consent','wrong-season','pause','revoke','expired-lease','stale-generation','policy-change',
 'early','missing-game','cutoff','source-off','offers-off','content-race','previous-pending','replay','renew'])fault;
select is(result->>'available','0',fault||' initial candidate stays unavailable without blocking structural validation') from automation_trial_results where fault in('wrong-role','wrong-team','wrong-event','tie','stale','warning');
select is(result->>'status','40001',fault||' fences stale SYSTEM authority') from automation_trial_results where fault in('absent-consent','wrong-season','pause','revoke','expired-lease','stale-generation','policy-change');
select is(result->>'cards','0',fault||' leaves no cards or credit grant') from automation_trial_results where fault in('early','missing-game','cutoff','source-off','offers-off');
select is(result->>'status','OPENED','changed unoffered menu is revalidated and opens automatically') from automation_trial_results where fault='content-race';
select is(result->>'status','OPENED','previous week pending blocks opening until its stored FINAL state') from automation_trial_results where fault='previous-pending';
select is(result->>'replayed','true','completion replay returns its durable result') from automation_trial_results where fault='replay';
select is(result->>'activations','1','completion replay never duplicates activation') from automation_trial_results where fault='replay';
select is(result->>'consents','2','revoked preparation requires a genuine renewed policy approval') from automation_trial_results where fault='renew';
select is(result->>'status','OPENED','identical explicitly renewed scope can recover its prepared week') from automation_trial_results where fault='renew';

create function pg_temp.automation_retry_trial() returns jsonb language plpgsql as $$
declare c jsonb;r uuid;j jsonb;delays jsonb:='[]';answer jsonb;n integer;
begin begin
 select t.c into strict c from automation_trial_context t;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',c->>'owner','role','authenticated')::text,true);
 for n in 1..4 loop
 r:=pg_temp.automation_run(c,'SYNC_SCHEDULE',3);
 update private.season_automation set operation_key='SYNC_SCHEDULE:3' where season_id=(c->>'season')::uuid;
 j:=api.complete_season_automation(r,p_failure=>'SCHEDULE_UNAVAILABLE');
 delays:=delays||to_jsonb((select round(extract(epoch from next_attempt_at-clock_timestamp())/60)::integer from private.season_automation where season_id=(c->>'season')::uuid));
 end loop;
 answer:=jsonb_build_object('delays',delays,'suspended',private.next_season_automation_action((c->>'season')::uuid)->>'status');
 update private.player_result_policy set processing_enabled=false;
 answer:=answer||jsonb_build_object('changed',private.next_season_automation_action((c->>'season')::uuid)->>'status');
 perform api.configure_season_automation(c->>'slug','RETRY');
 answer:=answer||jsonb_build_object('attempts',(select attempts from private.season_automation where season_id=(c->>'season')::uuid));
 raise exception using errcode='ZX001',message=answer::text;
 exception when sqlstate 'ZX001' then return sqlerrm::jsonb;end;end $$;
create temporary table automation_retry_result as select pg_temp.automation_retry_trial() result;
select is(result->'delays','[5,15,60,60]'::jsonb,'failure retries are bounded at five, fifteen and sixty minutes') from automation_retry_result;
select is(result->>'suspended','SUSPENDED','fourth failed attempt suspends unchanged work') from automation_retry_result;
select is(result->>'changed','DUE','a relevant dependency change releases suspension') from automation_retry_result;
select is(result->>'attempts','0','authorized explicit retry resets the bounded attempt count') from automation_retry_result;
-- Reuse the canonical roster-matrix close-week fixture for the changed
-- automatic publication path at representative bracket sizes.
\ir fixtures/postseason_close_matrix_week.sql.inc
\ir fixtures/automation_postseason.sql.inc
create temporary table automation_postseason_results as select size,pg_temp.automation_postseason_trial(size) result from unnest(array[4,10])size;
select is(result->>'status','ARCHIVED',size||'-member automatic postseason reaches complete archive') from automation_postseason_results;
select is(result->>'gate','FAILED',size||'-member qualification obeys the existing review window') from automation_postseason_results;
select is((result->>'cards')::integer,size*4,size||'-member postseason grants each member exactly one card each week') from automation_postseason_results;
select is(result->>'rounds','4',size||'-member postseason preserves SYSTEM provenance for every round') from automation_postseason_results;
select is(result->>'validations','4',size||'-member postseason never needs another human menu approval') from automation_postseason_results;
select * from finish();
rollback;
