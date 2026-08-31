begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table(
  'private',
  'live_score_imports',
  'provider score imports have an append-only private ledger'
);
select has_function(
  'api',
  'import_live_scores',
  array['uuid', 'jsonb', 'text'],
  'the guarded Live score batch command is exposed'
);
select has_function(
  'api',
  'correct_live_event_result',
  array['uuid', 'text', 'integer', 'integer', 'text', 'text'],
  'the objective correction command is exposed'
);
select has_function(
  'api',
  'void_live_event_after_postponement_window',
  array['uuid', 'text', 'text'],
  'the ruleset postponement command is exposed'
);
select has_function(
  'api',
  'get_live_week_operations',
  array['text'],
  'the member-auditable Live result read model is exposed'
);
select function_privs_are(
  'api',
  'import_live_scores',
  array['uuid', 'jsonb', 'text'],
  'anon',
  array[]::text[],
  'anonymous callers cannot import scores'
);
select function_privs_are(
  'api',
  'import_live_scores',
  array['uuid', 'jsonb', 'text'],
  'authenticated',
  array['EXECUTE'],
  'authenticated callers can invoke the guarded score command'
);
select table_privs_are(
  'private',
  'live_score_imports',
  'authenticated',
  array[]::text[],
  'participants cannot query raw provider payloads'
);
select policies_are(
  'private',
  'live_score_imports',
  array['live_score_imports_no_direct_access'],
  'the raw provider ledger has one explicit fail-closed policy'
);

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
    'fetchedAt', now(),
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
        'lastUpdate', case when p_event_one_away is null then null else now() - interval '1 minute' end
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
          'lastUpdate', case when p_event_two_away is null then null else now() - interval '1 minute' end
        )
        from private.sports_events as event_two
        where event_two.id = '88000000-0000-4000-8000-000000000002'
      )
    )
  )
  from private.sports_events as event
  where event.id = '88000000-0000-4000-8000-000000000001';
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  $$select api.import_live_scores(
    '82000000-0000-4000-8000-000000000001',
    pg_temp.live_score_import(true, 27, 20, false, null, null),
    'member-live-score-import'
  )$$,
  '42501',
  'Commissioner membership required.',
  'a regular member cannot import competitive results'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

savepoint open_week;
update private.season_weeks
set state = 'OPEN'
where id = '85000000-0000-4000-8000-000000000001';
select throws_ok(
  $$select api.import_live_scores(
    '82000000-0000-4000-8000-000000000001',
    pg_temp.live_score_import(true, 27, 20, false, null, null),
    'open-week-live-score-import'
  )$$,
  '55000',
  'Live score imports require locked cards and an unfinalized week.',
  'provider results cannot bypass the explicit card lock'
);
rollback to savepoint open_week;

select throws_ok(
  $$select api.void_live_event_after_postponement_window(
    '88000000-0000-4000-8000-000000000002',
    'Objective 48-hour postponement void.',
    'too-early-event-void'
  )$$,
  '55000',
  'The 48-hour postponement window remains open.',
  'an event cannot void before the frozen 48-hour window closes'
);

savepoint expired_postponement;
update private.sports_events
set scheduled_start_at = now() - interval '49 hours'
where id = '88000000-0000-4000-8000-000000000002';
select lives_ok(
  $$select api.void_live_event_after_postponement_window(
    '88000000-0000-4000-8000-000000000002',
    'No official result inside the frozen postponement window.',
    'expired-event-void'
  )$$,
  'a commissioner can visibly void an unresolved event after 48 hours'
);
select is(
  (
    select status from private.event_result_versions
    where event_id = '88000000-0000-4000-8000-000000000002'
    order by version desc limit 1
  ),
  'VOID',
  'the postponement command records an objective void'
);
rollback to savepoint expired_postponement;

select lives_ok(
  $$select api.import_live_scores(
    '82000000-0000-4000-8000-000000000001',
    pg_temp.live_score_import(true, 27, 20, false, null, null),
    'initial-live-score-import'
  )$$,
  'a complete provider batch settles only completed games'
);
select is(
  (select count(*) from private.live_score_imports where season_id = '83500000-0000-4000-8000-000000000001'),
  1::bigint,
  'the normalized provider batch is stored once'
);
select is(
  (
    select source from private.event_result_versions
    where event_id = '88000000-0000-4000-8000-000000000001'
    order by version desc limit 1
  ),
  'THE_ODDS_API',
  'provider provenance is attached to the result version'
);
select is(
  (
    select away_score from private.event_result_versions
    where event_id = '88000000-0000-4000-8000-000000000001'
    order by version desc limit 1
  ),
  27,
  'the official away score is preserved'
);
select is(
  (
    select returned_centicredits from private.settlement_versions
    where receipt_id = '8b000000-0000-4000-8000-000000000001'
    order by created_at desc, id desc limit 1
  ),
  200000::bigint,
  'the accepted plus-money receipt returns stake plus profit'
);
select is(
  (select state from private.season_weeks where id = '85000000-0000-4000-8000-000000000001'),
  'LOCKED',
  'the week remains locked while another published event is pending'
);

select lives_ok(
  $$select api.import_live_scores(
    '82000000-0000-4000-8000-000000000001',
    pg_temp.live_score_import(true, 14, 20, false, null, null),
    'provider-correction-before-week-complete'
  )$$,
  'a provider correction can append before the weekly window starts'
);
select is(
  (
    select version from private.event_result_versions
    where event_id = '88000000-0000-4000-8000-000000000001'
    order by version desc limit 1
  ),
  2,
  'the changed provider final creates result version two'
);
select is(
  (
    select returned_centicredits from private.settlement_versions
    where receipt_id = '8b000000-0000-4000-8000-000000000001'
    order by created_at desc, id desc limit 1
  ),
  0::bigint,
  'the corrected loss supersedes the original winning settlement'
);
select is(
  (select count(*) from private.corrections where event_id = '88000000-0000-4000-8000-000000000001'),
  1::bigint,
  'the provider correction is visible in the correction ledger'
);

select lives_ok(
  $$select api.import_live_scores(
    '82000000-0000-4000-8000-000000000001',
    pg_temp.live_score_import(true, 14, 20, true, 10, 7),
    'complete-live-score-import'
  )$$,
  'the final published event completes provisional weekly settlement'
);
select is(
  (select state from private.season_weeks where id = '85000000-0000-4000-8000-000000000001'),
  'PROVISIONAL',
  'all completed events open the 24-hour correction window'
);
select ok(
  (
    select correction_window_closes_at between now() + interval '23 hours 59 minutes'
      and now() + interval '24 hours 1 minute'
    from private.season_weeks
    where id = '85000000-0000-4000-8000-000000000001'
  ),
  'the correction window is exactly 24 hours'
);
select is(
  jsonb_array_length(api.get_live_week_operations('stage3-live-result-test') -> 'events'),
  2,
  'members receive every published event in the auditable result read model'
);
select is(
  api.get_live_week_operations('stage3-live-result-test') -> 'events' -> 0 -> 'result' ->> 'source',
  'THE_ODDS_API',
  'the result read model exposes provider provenance'
);

select throws_ok(
  $$select api.correct_live_event_result(
    '88000000-0000-4000-8000-000000000001',
    'FINAL',
    14,
    20,
    'This does not change the objective result.',
    'identical-objective-correction'
  )$$,
  '22023',
  'A correction must change the recorded result.',
  'a no-op correction cannot create competitive history noise'
);
select lives_ok(
  $$select api.correct_live_event_result(
    '88000000-0000-4000-8000-000000000001',
    'FINAL',
    35,
    7,
    'Official league scoring correction confirmed against the final gamebook.',
    'objective-manual-correction'
  )$$,
  'the commissioner can append a documented objective correction'
);
select is(
  (
    select source from private.event_result_versions
    where event_id = '88000000-0000-4000-8000-000000000001'
    order by version desc limit 1
  ),
  'MANUAL_OBJECTIVE',
  'manual correction provenance is visible'
);
select is(
  (select count(*) from private.corrections where event_id = '88000000-0000-4000-8000-000000000001'),
  2::bigint,
  'both provider and manual corrections remain in history'
);

select throws_ok(
  $$update private.live_score_imports
    set payload = '{}'::jsonb
    where season_id = '83500000-0000-4000-8000-000000000001'$$,
  '55000',
  'live_score_imports is append-only.',
  'raw provider evidence cannot be rewritten'
);
select throws_ok(
  $$update private.event_result_versions
    set reason = 'tampered'
    where event_id = '88000000-0000-4000-8000-000000000001'$$,
  '55000',
  'event_result_versions is append-only.',
  'result versions remain immutable'
);

select throws_ok(
  $$select api.finalize_stage1_week(
    '82000000-0000-4000-8000-000000000001',
    'early-live-week-finalization'
  )$$,
  '55000',
  'The current week cannot finalize before its correction window closes.',
  'the week cannot finalize during its 24-hour correction window'
);

update private.season_weeks
set correction_window_closes_at = clock_timestamp() - interval '1 minute'
where id = '85000000-0000-4000-8000-000000000001';

select lives_ok(
  $$select api.finalize_stage1_week(
    '82000000-0000-4000-8000-000000000001',
    'final-live-week-after-window'
  )$$,
  'the commissioner can finalize after the correction window'
);
select is(
  (select state from private.season_weeks where id = '85000000-0000-4000-8000-000000000001'),
  'FINAL',
  'the weekly lifecycle becomes final'
);
select is(
  (
    select count(*) from private.weekly_score_versions
    where week_id = '85000000-0000-4000-8000-000000000001' and status = 'FINAL'
  ),
  4::bigint,
  'every card receives an append-only final score version'
);
select is(
  (
    select count(*) from private.matchup_result_versions
    where week_id = '85000000-0000-4000-8000-000000000001' and status = 'FINAL'
  ),
  2::bigint,
  'both matchups receive append-only final result versions'
);
select is(
  (
    select count(*) from private.standings_snapshots
    where week_id = '85000000-0000-4000-8000-000000000001' and status = 'FINAL'
  ),
  1::bigint,
  'the week receives one final standings snapshot'
);
select throws_ok(
  $$select api.import_live_scores(
    '82000000-0000-4000-8000-000000000001',
    pg_temp.live_score_import(true, 35, 7, true, 10, 7),
    'post-final-live-score-import'
  )$$,
  '55000',
  'Live score imports require locked cards and an unfinalized week.',
  'provider imports cannot reopen a finalized week'
);

select * from finish();
rollback;
