-- Reuse the established four-member Live result fixture, with isolated IDs and rollback.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users (id, email)
values
  ('81000000-0000-4000-8000-000000000001', 'live-result-commissioner@example.test'),
  ('81000000-0000-4000-8000-000000000002', 'live-result-member-2@example.test'),
  ('81000000-0000-4000-8000-000000000003', 'live-result-member-3@example.test'),
  ('81000000-0000-4000-8000-000000000004', 'live-result-member-4@example.test');

insert into private.profiles (id, display_name)
values
  ('81000000-0000-4000-8000-000000000001', 'Result Commissioner'),
  ('81000000-0000-4000-8000-000000000002', 'Result Member Two'),
  ('81000000-0000-4000-8000-000000000003', 'Result Member Three'),
  ('81000000-0000-4000-8000-000000000004', 'Result Member Four');

insert into private.leagues (id, name, slug, created_by)
values (
  '82000000-0000-4000-8000-000000000001',
  'Stage 3 Live Result Test',
  'stage3-live-result-test',
  '81000000-0000-4000-8000-000000000001'
);

insert into private.league_memberships (league_id, user_id, role)
values
  ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'COMMISSIONER'),
  ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000002', 'MEMBER'),
  ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000003', 'MEMBER'),
  ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000004', 'MEMBER');

insert into private.season_ruleset_snapshots (
  id,
  ruleset_id,
  ruleset_version,
  product_bible_id,
  product_bible_version,
  mode,
  canonical_json,
  sha256_hash,
  frozen_at
)
values (
  '83000000-0000-4000-8000-000000000001',
  'live-season-1',
  '1.0',
  'sunday-ledger-product-bible',
  '3.0',
  'LIVE',
  '{"mode":"LIVE","correctionHours":24,"postponementHours":48}',
  repeat('a', 64),
  now() - interval '1 day'
);

insert into private.seasons (
  id,
  league_id,
  ruleset_snapshot_id,
  mode,
  nfl_year,
  lifecycle,
  roster_seed,
  schedule_seed,
  roster_locked_at
)
values (
  '83500000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  '83000000-0000-4000-8000-000000000001',
  'LIVE',
  2026,
  'REGULAR',
  repeat('b', 64),
  repeat('c', 64),
  now() - interval '1 day'
);

insert into private.season_entries (
  id,
  season_id,
  league_id,
  user_id,
  standing_tiebreak
)
values
  ('84000000-0000-4000-8000-000000000001', '83500000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', repeat('1', 64)),
  ('84000000-0000-4000-8000-000000000002', '83500000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000002', repeat('2', 64)),
  ('84000000-0000-4000-8000-000000000003', '83500000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000003', repeat('3', 64)),
  ('84000000-0000-4000-8000-000000000004', '83500000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000004', repeat('4', 64));

insert into private.season_weeks (
  id,
  season_id,
  league_id,
  nfl_week,
  state,
  opens_at,
  common_lock_at,
  locked_at
)
values (
  '85000000-0000-4000-8000-000000000001',
  '83500000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  1,
  'LOCKED',
  now() - interval '2 days',
  now() - interval '5 hours',
  now() - interval '5 hours'
);

insert into private.schedule_publications (
  id,
  season_id,
  league_id,
  version,
  algorithm_version,
  seed,
  ordered_entry_ids,
  output_hash,
  created_by
)
values (
  '86000000-0000-4000-8000-000000000001',
  '83500000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  1,
  'test-v1',
  'stage3-live-results',
  array[
    '84000000-0000-4000-8000-000000000001'::uuid,
    '84000000-0000-4000-8000-000000000002'::uuid,
    '84000000-0000-4000-8000-000000000003'::uuid,
    '84000000-0000-4000-8000-000000000004'::uuid
  ],
  repeat('d', 64),
  '81000000-0000-4000-8000-000000000001'
);

insert into private.matchups (
  id,
  week_id,
  season_id,
  league_id,
  schedule_publication_id,
  side_a_entry_id,
  side_b_entry_id,
  display_order
)
values
  ('87000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001', '83500000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '86000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000002', 1),
  ('87000000-0000-4000-8000-000000000002', '85000000-0000-4000-8000-000000000001', '83500000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '86000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000003', '84000000-0000-4000-8000-000000000004', 2);

insert into private.sports_events (
  id,
  week_id,
  season_id,
  league_id,
  fixture_event_key,
  away_team,
  home_team,
  scheduled_start_at
)
values
  ('88000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001', '83500000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', 'provider-live-result-one', 'Buffalo Bills', 'New York Jets', now() - interval '3 hours'),
  ('88000000-0000-4000-8000-000000000002', '85000000-0000-4000-8000-000000000001', '83500000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', 'provider-live-result-two', 'Chicago Bears', 'Green Bay Packers', now() - interval '2 hours');

insert into private.market_snapshots (
  id,
  event_id,
  week_id,
  league_id,
  book_key,
  market_type,
  outcome_key,
  proposition,
  line_milli,
  american_odds,
  quality_status,
  observed_at,
  payload_hash
)
values (
  '89000000-0000-4000-8000-000000000001',
  '88000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  'draftkings',
  'MONEYLINE',
  'AWAY',
  'Buffalo Bills to win',
  null,
  100,
  'HEALTHY',
  now() - interval '6 hours',
  repeat('e', 64)
);

insert into private.live_quote_heads (
  event_id,
  week_id,
  league_id,
  market_type,
  outcome_key,
  market_snapshot_id
)
values (
  '88000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  'MONEYLINE',
  'AWAY',
  '89000000-0000-4000-8000-000000000001'
);

insert into private.weekly_cards (
  id,
  week_id,
  season_id,
  league_id,
  entry_id,
  owner_user_id,
  granted_at,
  compliance,
  locked_at
)
values
  ('8a000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001', '83500000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', now() - interval '1 day', 'COMPLIANT', now() - interval '5 hours'),
  ('8a000000-0000-4000-8000-000000000002', '85000000-0000-4000-8000-000000000001', '83500000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000002', now() - interval '1 day', 'INCOMPLETE', now() - interval '5 hours'),
  ('8a000000-0000-4000-8000-000000000003', '85000000-0000-4000-8000-000000000001', '83500000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000003', '81000000-0000-4000-8000-000000000003', now() - interval '1 day', 'INCOMPLETE', now() - interval '5 hours'),
  ('8a000000-0000-4000-8000-000000000004', '85000000-0000-4000-8000-000000000001', '83500000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000004', '81000000-0000-4000-8000-000000000004', now() - interval '1 day', 'INCOMPLETE', now() - interval '5 hours');

insert into private.position_receipts (
  id,
  card_id,
  week_id,
  league_id,
  entry_id,
  owner_user_id,
  event_id,
  market_snapshot_id,
  market_type,
  outcome_key,
  proposition,
  line_milli,
  american_odds,
  stake_credits,
  quote_observed_at,
  accepted_at,
  ruleset_snapshot_id,
  idempotency_key,
  request_hash,
  receipt_hash
)
values (
  '8b000000-0000-4000-8000-000000000001',
  '8a000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  '84000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  '88000000-0000-4000-8000-000000000001',
  '89000000-0000-4000-8000-000000000001',
  'MONEYLINE',
  'AWAY',
  'Buffalo Bills to win',
  null,
  100,
  1000,
  now() - interval '6 hours',
  now() - interval '5 hours',
  '83000000-0000-4000-8000-000000000001',
  'stage3-live-result-card',
  repeat('f', 64),
  repeat('9', 64)
);

create or replace function pg_temp.live_score_import(
  p_event_one_completed boolean,
  p_event_one_away integer,
  p_event_one_home integer,
  p_event_two_completed boolean,
  p_event_two_away integer,
  p_event_two_home integer
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'source', 'THE_ODDS_API',
    'fetchedAt', clock_timestamp(),
    'events', jsonb_build_array(
      jsonb_build_object(
        'source', 'THE_ODDS_API',
        'externalEventId', event.fixture_event_key,
        'sportKey', 'americanfootball_nfl',
        'awayTeam', event.away_team,
        'homeTeam', event.home_team,
        'scheduledStartAt', event.scheduled_start_at,
        'completed', p_event_one_completed,
        'awayScore', p_event_one_away,
        'homeScore', p_event_one_home,
        'lastUpdate', case when p_event_one_away is null then null else clock_timestamp() - interval '1 second' end
      ),
      (
        select jsonb_build_object(
          'source', 'THE_ODDS_API',
          'externalEventId', event_two.fixture_event_key,
          'sportKey', 'americanfootball_nfl',
          'awayTeam', event_two.away_team,
          'homeTeam', event_two.home_team,
          'scheduledStartAt', event_two.scheduled_start_at,
          'completed', p_event_two_completed,
          'awayScore', p_event_two_away,
          'homeScore', p_event_two_home,
          'lastUpdate', case when p_event_two_away is null then null else clock_timestamp() - interval '1 second' end
        )
        from private.sports_events as event_two
        where event_two.id = '88000000-0000-4000-8000-000000000002'
      )
    )
  )
  from private.sports_events as event
  where event.id = '88000000-0000-4000-8000-000000000001';
$$;

select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((api.claim_scheduled_score_refresh()->>'status'),'DISABLED','migration cannot activate a scheduler');
select ok(not has_function_privilege('authenticated','api.claim_scheduled_score_refresh()','execute'),'members cannot invoke the scheduler RPC');
select ok(not has_function_privilege('anon','api.complete_provider_request(uuid,jsonb,integer)','execute'),'anonymous cannot complete a fetch');
select ok(not has_function_privilege('authenticated','private.record_stage1_result_as(uuid,uuid,text,integer,integer,text,text,text)','execute'),'actor helper is private');
select ok(not has_function_privilege('authenticated','api.complete_provider_request(uuid,jsonb,integer)','execute'),'members cannot attest to provider evidence');
select ok(has_function_privilege('service_role','api.complete_provider_request(uuid,jsonb,integer)','execute'),'server can complete only its database-issued scope');
select is(private.next_score_checkpoint('2026-09-13 17:00Z','2026-09-13 17:03Z',true,null),'2026-09-13 21:00Z'::timestamptz,'confirmed start sleeps until four-hour result check');
select is(private.next_score_checkpoint('2026-09-13 17:00Z','2026-09-13 21:03Z',true,null),'2026-09-13 21:30Z'::timestamptz,'overtime uses bounded next checkpoint');
select is(private.next_score_checkpoint('2026-09-13 17:00Z','2026-09-16 06:00Z',false,null),null::timestamptz,'retention cutoff stops automatic attempts');
update private.score_refresh_policy set enabled=true;
update private.odds_refresh_policy set next_request_at='-infinity',daily_credit_limit=90,monthly_credit_limit=300,requests_remaining=467;
-- An unstarted future event is not fetched even though it belongs to the slate.
update private.sports_events set scheduled_start_at=clock_timestamp()+interval '2 hours' where fixture_event_key='provider-live-result-two';
create temp table checkpoint_claim(value jsonb);
insert into checkpoint_claim select api.claim_scheduled_score_refresh();
select is((select value->>'status' from checkpoint_claim),'CLAIMED','a due start gets one lease');
select is((select jsonb_array_length(value->'eventIds') from checkpoint_claim),1,'only due selected event is requested');
select is((api.claim_scheduled_score_refresh()->>'status'),'BUSY','overlapping invocation makes no second reservation');
select is((select daily_credits from private.odds_refresh_policy),2,'scores reserve two shared credits once');
select is((select requests_remaining from private.odds_refresh_policy),465,'reservation debits known balance before HTTP');
select is((select jsonb_array_length(api.get_stage1_state('stage3-live-result-test')->'matchup'->'opponentRevealedPositions')),0,'scheduled kickoff alone reveals no opponent positions');
select throws_ok($$select api.import_live_scores('82000000-0000-4000-8000-000000000001',
  jsonb_set(jsonb_set(pg_temp.live_score_import(false,0,0,false,null,null),'{events}',jsonb_build_array(pg_temp.live_score_import(false,0,0,false,null,null)->'events'->0)),
    '{events,0,lastUpdate}',to_jsonb(clock_timestamp()+interval '1 minute')),'reject-future-score-source')$$,
  '22023','A live score event is internally inconsistent.','provider evidence after fetch cannot reveal a pick');
select throws_ok($$select api.import_live_scores('82000000-0000-4000-8000-000000000001',
  jsonb_set(jsonb_set(pg_temp.live_score_import(false,0,0,false,null,null),'{events}',jsonb_build_array(pg_temp.live_score_import(false,0,0,false,null,null)->'events'->0)),
    '{events,0,lastUpdate}',to_jsonb((select scheduled_start_at-interval '1 minute' from private.sports_events where fixture_event_key='provider-live-result-one'))),'reject-pregame-score-source')$$,
  '22023','A live score event is internally inconsistent.','pre-kickoff evidence cannot reveal a pick');
select is(api.complete_provider_request((select (value->>'leaseId')::uuid from checkpoint_claim),
  jsonb_set(pg_temp.live_score_import(false,0,0,false,null,null),'{events}',jsonb_build_array(pg_temp.live_score_import(false,0,0,false,null,null)->'events'->0)),465)->>'status','SUCCEEDED','provider scores confirm a start without settling');
select is((select state from private.sports_events where fixture_event_key='provider-live-result-one'),'LIVE','confirmed start recorded');
select is((select count(*) from private.event_result_versions),0::bigint,'live scores never settle positions');
select is((select state from private.sports_events where fixture_event_key='provider-live-result-two'),'SCHEDULED','future event remains unstarted');
select ok((select next_check_at>clock_timestamp()+interval '50 minutes' from private.live_score_checks where event_id='88000000-0000-4000-8000-000000000001'),'no continuous refresh between start and final');
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(jsonb_array_length(api.get_stage1_state('stage3-live-result-test')->'matchup'->'opponentRevealedPositions'),1,'opponent sees only the reliably started pick');
select throws_ok($$select api.claim_live_score_refresh('82000000-0000-4000-8000-000000000001')$$,'42501','A Live-league commissioner is required.','backup member has no operating rights before transfer');
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
-- The real existing transfer is the backup procedure; it changes no receipt grant.
select lives_ok($$select api.transfer_league_commissioner('stage3-live-result-test','81000000-0000-4000-8000-000000000002')$$,'commissioner can transfer to a backup');
select throws_ok($$select api.claim_live_score_refresh('82000000-0000-4000-8000-000000000001')$$,'42501','A Live-league commissioner is required.','old commissioner immediately loses operations');
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
update private.provider_requests set attempted_at=clock_timestamp()-interval '2 minutes';
update private.odds_refresh_policy set next_request_at='-infinity';
truncate checkpoint_claim;
insert into checkpoint_claim select api.claim_live_score_refresh('82000000-0000-4000-8000-000000000001');
select is((select value->>'status' from checkpoint_claim),'CLAIMED','transferred commissioner can use same fallback');
select is(api.complete_provider_request((select (value->>'leaseId')::uuid from checkpoint_claim),null,463)->>'status','FAILED','outage is recorded with no competitive mutation');
select is((select count(*) from private.event_result_versions),0::bigint,'outage does not settle');
select is((select daily_credits from private.odds_refresh_policy),4,'failed HTTP keeps its reservation');
update private.provider_requests set attempted_at=clock_timestamp()-interval '2 minutes';
update private.odds_refresh_policy set next_request_at='-infinity';
truncate checkpoint_claim;
insert into checkpoint_claim select api.claim_live_score_refresh('82000000-0000-4000-8000-000000000001');
select is(api.complete_provider_request((select (value->>'leaseId')::uuid from checkpoint_claim),
  jsonb_set(pg_temp.live_score_import(true,27,20,false,null,null),'{events}',jsonb_build_array(pg_temp.live_score_import(true,27,20,false,null,null)->'events'->0)),461)->>'status','SUCCEEDED','recovery captures a final through the authoritative settlement engine');
select is((select count(*) from private.event_result_versions),1::bigint,'one result version');
select is((select returned_centicredits from private.settlement_versions limit 1),200000::bigint,'immutable terms produce expected return');
select is(api.complete_provider_request((select (value->>'leaseId')::uuid from checkpoint_claim),null,900)->>'status','SUCCEEDED','completion replay returns stored receipt');
select is((select count(*) from private.event_result_versions),1::bigint,'replay does not duplicate settlement');
select is((select requests_remaining from private.odds_refresh_policy),461,'replayed response cannot increase provider balance');
select is((select state from private.season_weeks where id='85000000-0000-4000-8000-000000000001'),'LOCKED','future unresolved game prevents provisional week');
-- An equal provider timestamp is not a new result, even under a new actor.
savepoint transferred_objective_correction;
select lives_ok($$select api.transfer_league_commissioner('stage3-live-result-test','81000000-0000-4000-8000-000000000003')$$,'transfer after provider final succeeds');
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select lives_ok($$select api.correct_live_event_result('88000000-0000-4000-8000-000000000001','FINAL',14,20,'Official gamebook corrects the away score after operator transfer.','transfer-objective-correction')$$,'new commissioner records an objective correction');
create temp table unchanged_provider_payload as
select jsonb_set(jsonb_set(pg_temp.live_score_import(true,27,20,false,null,null),'{events}',
  jsonb_build_array(pg_temp.live_score_import(true,27,20,false,null,null)->'events'->0)),
  '{events,0,lastUpdate}',to_jsonb((select source_updated_at from private.live_score_checks where event_id='88000000-0000-4000-8000-000000000001'))) as value;
update private.provider_requests set attempted_at=clock_timestamp()-interval '2 minutes';
update private.odds_refresh_policy set next_request_at='-infinity';
truncate checkpoint_claim;
insert into checkpoint_claim select api.claim_live_score_refresh('82000000-0000-4000-8000-000000000001');
select is(api.complete_provider_request((select (value->>'leaseId')::uuid from checkpoint_claim),
  jsonb_set((select value from unchanged_provider_payload),'{fetchedAt}',to_jsonb(clock_timestamp())),459)->>'status','SUCCEEDED','unchanged provider evidence is a successful check, not an outage');
select is((select count(*) from private.event_result_versions),2::bigint,'repeated source evidence creates no correction under the new commissioner');
select is((select source from private.event_result_versions where event_id='88000000-0000-4000-8000-000000000001' order by version desc limit 1),'MANUAL_OBJECTIVE','objective correction provenance survives stale provider replay');
select is((select returned_centicredits from private.settlement_versions where receipt_id='8b000000-0000-4000-8000-000000000001' order by created_at desc,id desc limit 1),0::bigint,'corrected losing settlement is not reverted by old provider evidence');
select is((select failure_count from private.live_score_checks where event_id='88000000-0000-4000-8000-000000000001'),0,'equal source timestamp does not trigger outage retries');
rollback to savepoint transferred_objective_correction;
-- Different dates: an old unreturned event cannot prevent the newer final.
update private.sports_events set scheduled_start_at=clock_timestamp()-interval '80 hours' where fixture_event_key='provider-live-result-one';
update private.sports_events set scheduled_start_at=clock_timestamp()-interval '4 hours' where fixture_event_key='provider-live-result-two';
update private.provider_requests set attempted_at=clock_timestamp()-interval '2 minutes';
update private.odds_refresh_policy set next_request_at='-infinity';
truncate checkpoint_claim;
insert into checkpoint_claim select api.claim_live_score_refresh('82000000-0000-4000-8000-000000000001');
select is((select jsonb_array_length(value->'eventIds') from checkpoint_claim),1,'expired old game is excluded individually');
select is(api.complete_provider_request((select (value->>'leaseId')::uuid from checkpoint_claim),
  jsonb_set(pg_temp.live_score_import(true,27,20,true,14,21),'{events}',jsonb_build_array(pg_temp.live_score_import(true,27,20,true,14,21)->'events'->1)),459)->>'status','SUCCEEDED','newer final captures after older game leaves retention');
select is((select state from private.season_weeks where id='85000000-0000-4000-8000-000000000001'),'PROVISIONAL','all finals enter existing correction window');
select is((select count(*) from private.event_result_versions),2::bigint,'old captured final persists');
select is((select count(*) from private.weekly_score_versions where status='FINAL'),0::bigint,'automation never finalizes the week');
update private.provider_requests set attempted_at=clock_timestamp()-interval '2 minutes';
update private.odds_refresh_policy set next_request_at='-infinity',requests_remaining=31;
select throws_ok($$select api.claim_live_score_refresh('82000000-0000-4000-8000-000000000001')$$,'P0001','QUOTE_REFRESH_BUDGET','manual fallback cannot spend reserve');
select ok(not exists(select 1 from private.position_receipts where receipt_hash<>repeat('9',64)),'accepted receipt unchanged');
select * from finish();
rollback;
