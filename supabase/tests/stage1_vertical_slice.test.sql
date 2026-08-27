begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('private', 'season_weeks', 'season weeks are stored');
select has_table('private', 'position_receipts', 'immutable position receipts are stored');
select has_table('private', 'standings_snapshots', 'versioned standings are stored');
select has_function(
  'api',
  'initialize_stage1_week',
  array['uuid', 'jsonb', 'text'],
  'the initialization command is exposed'
);
select has_function(
  'api',
  'accept_stage1_position',
  array['text', 'uuid', 'integer', 'text', 'text'],
  'the acceptance command is exposed'
);
select has_function(
  'api',
  'get_stage1_state',
  array['text'],
  'the sealed Stage 1 read model is exposed'
);
select policies_are(
  'private',
  'weekly_cards',
  array['weekly_cards_select_owner'],
  'weekly cards have only the owner policy'
);
select policies_are(
  'private',
  'position_receipts',
  array['position_receipts_select_owner'],
  'receipts have only the owner policy'
);
select table_privs_are(
  'private',
  'position_receipts',
  'authenticated',
  array['SELECT'],
  'participants cannot mutate receipts directly'
);
select function_privs_are(
  'api',
  'initialize_stage1_week',
  array['uuid', 'jsonb', 'text'],
  'anon',
  array[]::text[],
  'anonymous callers cannot initialize a week'
);
select function_privs_are(
  'api',
  'initialize_stage1_week',
  array['uuid', 'jsonb', 'text'],
  'authenticated',
  array['EXECUTE'],
  'authenticated callers can invoke the guarded command'
);

create or replace function pg_temp.stage1_fixture()
returns jsonb
language sql
stable
as $$
  with event_inputs (
    ordinal,
    event_key,
    away_team,
    home_team,
    scheduled_start_at,
    away_moneyline,
    home_moneyline,
    away_spread_milli,
    away_spread_label,
    home_spread_label,
    total_milli,
    total_label,
    provider_health,
    degraded_market,
    degraded_quality
  ) as (
    values
      (1, 'buf-nyj', 'Buffalo', 'New York', '2026-09-13T17:00:00.000Z', -160, 140, -3000, '-3', '+3', 44000, '44', 'HEALTHY', null, null),
      (2, 'bal-cle', 'Baltimore', 'Cleveland', '2026-09-13T17:00:00.000Z', -225, 190, -4500, '-4.5', '+4.5', 41500, '41.5', 'HEALTHY', 'TOTAL', 'STALE'),
      (3, 'mia-ne', 'Miami', 'New England', '2026-09-13T17:00:00.000Z', -200, 170, -3500, '-3.5', '+3.5', 45500, '45.5', 'HEALTHY', 'MONEYLINE', 'OUTLIER'),
      (4, 'pit-cin', 'Pittsburgh', 'Cincinnati', '2026-09-13T17:00:00.000Z', 115, -135, 1500, '+1.5', '-1.5', 42500, '42.5', 'HEALTHY', 'SPREAD', 'SUSPENDED'),
      (5, 'kc-den', 'Kansas City', 'Denver', '2026-09-13T20:25:00.000Z', -205, 175, -3500, '-3.5', '+3.5', 47500, '47.5', 'DEGRADED', 'MONEYLINE', 'PROVIDER_DEGRADED'),
      (6, 'sf-sea', 'San Francisco', 'Seattle', '2026-09-13T20:25:00.000Z', -115, -105, -1000, '-1', '+1', 46500, '46.5', 'HEALTHY', null, null),
      (7, 'dal-phi', 'Dallas', 'Philadelphia', '2026-09-14T00:20:00.000Z', 150, -175, 3000, '+3', '-3', 48500, '48.5', 'HEALTHY', null, null),
      (8, 'gb-chi', 'Green Bay', 'Chicago', '2026-09-15T00:15:00.000Z', -125, 105, -1500, '-1.5', '+1.5', 43000, '43', 'HEALTHY', null, null)
  ), fixture_events as (
    select
      ordinal,
      jsonb_build_object(
        'key', event_key,
        'awayTeam', away_team,
        'homeTeam', home_team,
        'scheduledStartAt', scheduled_start_at,
        'providerHealth', provider_health,
        'markets', jsonb_build_array(
          jsonb_build_object(
            'bookKey', 'draftkings', 'marketType', 'MONEYLINE', 'outcomeKey', 'AWAY',
            'proposition', away_team || ' to win', 'lineMilli', null,
            'americanOdds', away_moneyline,
            'qualityStatus', case when degraded_market = 'MONEYLINE' then degraded_quality else 'HEALTHY' end,
            'observedAt', '2026-09-08T10:00:00.000Z', 'eligible', true
          ),
          jsonb_build_object(
            'bookKey', 'draftkings', 'marketType', 'MONEYLINE', 'outcomeKey', 'HOME',
            'proposition', home_team || ' to win', 'lineMilli', null,
            'americanOdds', home_moneyline,
            'qualityStatus', case when degraded_market = 'MONEYLINE' then degraded_quality else 'HEALTHY' end,
            'observedAt', '2026-09-08T10:00:00.000Z', 'eligible', true
          ),
          jsonb_build_object(
            'bookKey', 'draftkings', 'marketType', 'SPREAD', 'outcomeKey', 'AWAY',
            'proposition', away_team || ' ' || away_spread_label,
            'lineMilli', away_spread_milli, 'americanOdds', -110,
            'qualityStatus', case when degraded_market = 'SPREAD' then degraded_quality else 'HEALTHY' end,
            'observedAt', '2026-09-08T10:00:00.000Z', 'eligible', true
          ),
          jsonb_build_object(
            'bookKey', 'draftkings', 'marketType', 'SPREAD', 'outcomeKey', 'HOME',
            'proposition', home_team || ' ' || home_spread_label,
            'lineMilli', -away_spread_milli, 'americanOdds', -110,
            'qualityStatus', case when degraded_market = 'SPREAD' then degraded_quality else 'HEALTHY' end,
            'observedAt', '2026-09-08T10:00:00.000Z', 'eligible', true
          ),
          jsonb_build_object(
            'bookKey', 'draftkings', 'marketType', 'TOTAL', 'outcomeKey', 'OVER',
            'proposition', 'Over ' || total_label, 'lineMilli', total_milli,
            'americanOdds', -110,
            'qualityStatus', case when degraded_market = 'TOTAL' then degraded_quality else 'HEALTHY' end,
            'observedAt', '2026-09-08T10:00:00.000Z', 'eligible', true
          ),
          jsonb_build_object(
            'bookKey', 'draftkings', 'marketType', 'TOTAL', 'outcomeKey', 'UNDER',
            'proposition', 'Under ' || total_label, 'lineMilli', total_milli,
            'americanOdds', -110,
            'qualityStatus', case when degraded_market = 'TOTAL' then degraded_quality else 'HEALTHY' end,
            'observedAt', '2026-09-08T10:00:00.000Z', 'eligible', true
          ),
          jsonb_build_object(
            'bookKey', 'fanduel', 'marketType', 'MONEYLINE', 'outcomeKey', 'HOME',
            'proposition', home_team || ' comparison quote', 'lineMilli', null,
            'americanOdds', home_moneyline - 5, 'qualityStatus', 'OUTLIER',
            'observedAt', '2026-09-08T10:00:00.000Z', 'eligible', false
          )
        )
      ) as event_json
    from event_inputs
  )
  select jsonb_build_object(
    'id', 'stage1-week-1-v1',
    'opensAt', '2026-09-08T10:00:00.000Z',
    'commonLockAt', '2026-09-13T16:55:00.000Z',
    'events', jsonb_agg(event_json order by ordinal)
  )
  from fixture_events;
$$;

insert into auth.users (id, email)
select
  ('00000000-0000-4000-8000-' || lpad(member_number::text, 12, '0'))::uuid,
  format('stage1-member-%s@example.test', member_number)
from generate_series(1, 8) as member_number;

insert into private.profiles (id, display_name)
select
  ('00000000-0000-4000-8000-' || lpad(member_number::text, 12, '0'))::uuid,
  format('Stage 1 Member %s', member_number)
from generate_series(1, 8) as member_number;

insert into private.leagues (id, name, slug, created_by)
values (
  '10000000-0000-4000-8000-000000000001',
  'Stage 1 Database Test',
  'stage1-database-test',
  '00000000-0000-4000-8000-000000000001'
);

insert into private.league_memberships (league_id, user_id, role)
select
  '10000000-0000-4000-8000-000000000001',
  ('00000000-0000-4000-8000-' || lpad(member_number::text, 12, '0'))::uuid,
  case when member_number = 1 then 'COMMISSIONER' else 'MEMBER' end
from generate_series(1, 8) as member_number;

insert into private.season_ruleset_snapshots (
  id,
  ruleset_id,
  ruleset_version,
  product_bible_id,
  product_bible_version,
  mode,
  canonical_json,
  sha256_hash
)
values (
  '20000000-0000-4000-8000-000000000001',
  'simulation-season-1',
  '1.0.0',
  'sunday-ledger-product-bible',
  '3.0.0',
  'SIMULATION',
  '{"mode":"SIMULATION"}',
  repeat('a', 64)
);

insert into private.seasons (
  id,
  league_id,
  ruleset_snapshot_id,
  mode,
  nfl_year,
  roster_seed,
  schedule_seed,
  simulated_now
)
values (
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'SIMULATION',
  2026,
  repeat('b', 64),
  repeat('c', 64),
  '2026-09-08T10:00:00Z'
);

insert into private.season_entries (
  id,
  season_id,
  league_id,
  user_id,
  standing_tiebreak
)
select
  ('40000000-0000-4000-8000-' || lpad(member_number::text, 12, '0'))::uuid,
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  ('00000000-0000-4000-8000-' || lpad(member_number::text, 12, '0'))::uuid,
  lpad(member_number::text, 64, '0')
from generate_series(1, 8) as member_number;

insert into auth.users (id, email)
values (
  '00000000-0000-4000-8000-000000000009',
  'stage1-member-9@example.test'
);
insert into private.profiles (id, display_name)
values (
  '00000000-0000-4000-8000-000000000009',
  'Stage 1 Member 9'
);
select lives_ok(
  $$insert into private.league_memberships (league_id, user_id, role)
    values (
      '10000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000009',
      'MEMBER'
    )$$,
  'Stage 2 permits a ninth member before roster lock'
);

delete from private.league_memberships
where league_id = '10000000-0000-4000-8000-000000000001'
  and user_id = '00000000-0000-4000-8000-000000000009';

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","email":"stage1-member-1@example.test"}',
  true
);

select lives_ok(
  $$select api.initialize_stage1_week(
    '10000000-0000-4000-8000-000000000001',
    pg_temp.stage1_fixture(),
    'initialize-stage1'
  )$$,
  'the commissioner can publish deterministic Week 1'
);

select is(
  (select count(*) from private.matchups),
  4::bigint,
  'four Week 1 matchups are stored'
);
select is(
  (select count(*) from private.weekly_cards),
  8::bigint,
  'all eight entries receive a card'
);
select is(
  (select count(*) from private.slate_items),
  48::bigint,
  'only the 48 primary DraftKings-shaped outcomes are eligible'
);
select is(
  (select count(*) from private.market_snapshots),
  56::bigint,
  'all primary and comparison observations are retained'
);
select is(
  (
    select count(*)
    from private.market_snapshots
    where book_key = 'fanduel' and quality_status = 'OUTLIER'
  ),
  8::bigint,
  'eight comparison-provider observations are stored but ineligible'
);
select is(
  (
    select common_lock_at
    from private.season_weeks
    where nfl_week = 1
  ),
  '2026-09-13T16:55:00Z'::timestamptz,
  'common lock is five minutes before the earliest kickoff'
);
select is(
  (
    select seed
    from private.schedule_publications
    where season_id = '30000000-0000-4000-8000-000000000001'
  ),
  repeat('c', 64),
  'the public schedule seed is persisted'
);

create or replace function pg_temp.accept_market(
  p_user_number integer,
  p_event_key text,
  p_market_type text,
  p_outcome_key text,
  p_stake integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
as $$
declare
  v_user_id uuid := (
    '00000000-0000-4000-8000-' || lpad(p_user_number::text, 12, '0')
  )::uuid;
  v_snapshot private.market_snapshots%rowtype;
  v_response jsonb;
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_id, 'role', 'authenticated')::text,
    true
  );

  select snapshot.* into strict v_snapshot
  from private.market_snapshots as snapshot
  join private.sports_events as event on event.id = snapshot.event_id
  join private.slate_items as item on item.market_snapshot_id = snapshot.id
  where event.fixture_event_key = p_event_key
    and snapshot.market_type = p_market_type
    and snapshot.outcome_key = p_outcome_key
    and snapshot.book_key = 'draftkings';

  select api.accept_stage1_position(
    'stage1-database-test',
    v_snapshot.id,
    p_stake,
    v_snapshot.payload_hash,
    p_idempotency_key
  ) into v_response;
  return v_response;
end;
$$;

select lives_ok(
  $$select pg_temp.accept_market(1, 'buf-nyj', 'MONEYLINE', 'AWAY', 51, 'accept-user1-buf')$$,
  'a 51-credit position is accepted for half-up evidence'
);
select lives_ok(
  $$select pg_temp.accept_market(1, 'bal-cle', 'SPREAD', 'AWAY', 949, 'accept-user1-bal')$$,
  'the first completed card reaches exactly 1,000 credits'
);
select lives_ok(
  $$select pg_temp.accept_market(8, 'buf-nyj', 'TOTAL', 'OVER', 1000, 'accept-user8-push')$$,
  'the completed opponent card stores a push proposition'
);
select lives_ok(
  $$select pg_temp.accept_market(2, 'pit-cin', 'TOTAL', 'OVER', 1000, 'accept-user2-void')$$,
  'a completed card stores the future void proposition'
);
select lives_ok(
  $$select pg_temp.accept_market(4, 'sf-sea', 'MONEYLINE', 'AWAY', 1000, 'accept-user4-tie')$$,
  'the first exact-tie card is complete'
);
select lives_ok(
  $$select pg_temp.accept_market(5, 'sf-sea', 'MONEYLINE', 'AWAY', 1000, 'accept-user5-tie')$$,
  'the second exact-tie card is complete'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","email":"stage1-member-1@example.test"}',
  true
);

select is(
  (
    select sum(stake_credits)
    from private.position_receipts
    where owner_user_id = '00000000-0000-4000-8000-000000000001'
  ),
  1000::bigint,
  'the viewer has exactly 1,000 accepted credits'
);
select ok(
  (select frozen_at is not null from private.slates limit 1),
  'the slate freezes on the first immutable receipt'
);
select ok(
  api.get_stage1_state('stage1-database-test') #> '{matchup,opponentRevealedPositions}' = '[]'::jsonb
  and (api.get_stage1_state('stage1-database-test') #>> '{matchup,futureSealed}')::boolean,
  'opponent position terms remain structurally absent before reveal'
);

select api.advance_stage1_clock(
  '10000000-0000-4000-8000-000000000001',
  '2026-09-13T16:56:00Z',
  'advance-common-lock'
);
select lives_ok(
  $$select api.lock_stage1_week(
    '10000000-0000-4000-8000-000000000001',
    'lock-stage1-week'
  )$$,
  'database time locks every card at the common boundary'
);
select is(
  (select count(*) from private.weekly_cards where compliance = 'COMPLIANT'),
  5::bigint,
  'five deliberately completed cards are compliant'
);
select is(
  api.get_stage1_state('stage1-database-test') #>> '{matchup,opponentReadiness}',
  'COMPLIANT',
  'opponent readiness appears only after common lock'
);

select api.advance_stage1_clock(
  '10000000-0000-4000-8000-000000000001',
  '2026-09-15T00:16:00Z',
  'advance-after-events'
);

create or replace function pg_temp.mark_event_live(
  p_event_key text,
  p_idempotency_key text
)
returns void
language plpgsql
as $$
declare
  v_event private.sports_events%rowtype;
begin
  select * into strict v_event
  from private.sports_events
  where fixture_event_key = p_event_key;

  perform api.set_stage1_event_live(
    v_event.id,
    v_event.scheduled_start_at,
    p_idempotency_key
  );
end;
$$;

select lives_ok(
  $$select pg_temp.mark_event_live('buf-nyj', 'live-buf-nyj')$$,
  'reliable actual kickoff reveals the Buffalo event'
);
select is(
  jsonb_array_length(
    api.get_stage1_state('stage1-database-test') #> '{matchup,opponentRevealedPositions}'
  ),
  1,
  'exactly the opponent receipt attached to the live event is revealed'
);

select pg_temp.mark_event_live('bal-cle', 'live-bal-cle');
select pg_temp.mark_event_live('mia-ne', 'live-mia-ne');
select pg_temp.mark_event_live('kc-den', 'live-kc-den');
select pg_temp.mark_event_live('sf-sea', 'live-sf-sea');
select pg_temp.mark_event_live('dal-phi', 'live-dal-phi');
select pg_temp.mark_event_live('gb-chi', 'live-gb-chi');

create or replace function pg_temp.record_initial_results()
returns void
language plpgsql
as $$
declare
  v_result record;
  v_event_id uuid;
begin
  for v_result in
    select *
    from (
      values
        ('buf-nyj', 'FINAL', 24, 20),
        ('bal-cle', 'FINAL', 27, 17),
        ('mia-ne', 'FINAL', 21, 24),
        ('pit-cin', 'VOID', null::integer, null::integer),
        ('kc-den', 'FINAL', 30, 21),
        ('sf-sea', 'FINAL', 23, 20),
        ('dal-phi', 'FINAL', 17, 31),
        ('gb-chi', 'FINAL', 20, 23)
    ) as fixture(event_key, status, away_score, home_score)
  loop
    select id into strict v_event_id
    from private.sports_events
    where fixture_event_key = v_result.event_key;

    perform api.record_stage1_result(
      v_event_id,
      v_result.status,
      v_result.away_score,
      v_result.home_score,
      'Deterministic Stage 1 final',
      'SIMULATION_FIXTURE',
      'result-' || v_result.event_key
    );
  end loop;
end;
$$;

select lives_ok(
  $$select pg_temp.record_initial_results()$$,
  'all eight deterministic event results settle and replay the week'
);
select is(
  (select count(*) from private.matchup_result_versions),
  4::bigint,
  'all four matchup cases produce a result'
);
select is(
  (
    select result.side_a_decision || '/' || result.side_b_decision
    from private.matchup_result_versions as result
    join private.matchups as matchup on matchup.id = result.matchup_id
    where matchup.side_a_entry_id = '40000000-0000-4000-8000-000000000001'
  ),
  'WIN/LOSS',
  'completed versus completed uses the derived scores'
);
select is(
  (
    select result.side_a_decision || '/' || result.side_b_decision
    from private.matchup_result_versions as result
    join private.matchups as matchup on matchup.id = result.matchup_id
    where matchup.side_a_entry_id = '40000000-0000-4000-8000-000000000002'
  ),
  'WIN/LOSS',
  'completed versus incomplete is an automatic completed-card win'
);
select is(
  (
    select result.side_a_decision || '/' || result.side_b_decision
    from private.matchup_result_versions as result
    join private.matchups as matchup on matchup.id = result.matchup_id
    where matchup.side_a_entry_id = '40000000-0000-4000-8000-000000000003'
  ),
  'LOSS/LOSS',
  'both incomplete cards receive losses'
);
select is(
  (
    select result.side_a_decision || '/' || result.side_b_decision
    from private.matchup_result_versions as result
    join private.matchups as matchup on matchup.id = result.matchup_id
    where matchup.side_a_entry_id = '40000000-0000-4000-8000-000000000004'
  ),
  'TIE/TIE',
  'equal completed-card scores produce an exact tie'
);
select is(
  (
    select settlement.returned_centicredits
    from private.settlement_versions as settlement
    join private.position_receipts as receipt on receipt.id = settlement.receipt_id
    join private.sports_events as event on event.id = receipt.event_id
    where receipt.owner_user_id = '00000000-0000-4000-8000-000000000001'
      and event.fixture_event_key = 'buf-nyj'
  ),
  8288::bigint,
  'a half-cent profit rounds half up to the next centicredit'
);
select is(
  (select state from private.season_weeks where nfl_week = 1),
  'PROVISIONAL',
  'the fully settled week enters its 24-hour provisional window'
);
select is(
  (
    select jsonb_array_length(ordered_rows)
    from private.standings_snapshots
    order by created_at desc
    limit 1
  ),
  8,
  'the derived standings snapshot contains all eight entries'
);

create temporary table receipt_evidence_before_correction as
select id, receipt_hash
from private.position_receipts;

create temporary table correction_window_before as
select correction_window_closes_at
from private.season_weeks
where nfl_week = 1;

select lives_ok(
  $$select api.record_stage1_result(
    (select id from private.sports_events where fixture_event_key = 'buf-nyj'),
    'FINAL',
    20,
    24,
    'Visible Stage 1 correction replay',
    'SIMULATION_FIXTURE',
    'correct-buf-nyj'
  )$$,
  'an objective correction appends and replays competitive truth'
);
select is(
  (
    select count(*)
    from private.event_result_versions as result
    join private.sports_events as event on event.id = result.event_id
    where event.fixture_event_key = 'buf-nyj'
  ),
  2::bigint,
  'the original and corrected result versions both remain'
);
select is(
  (select count(*) from private.corrections),
  1::bigint,
  'the correction ledger records before and after evidence'
);
select is(
  (
    select count(*)
    from private.position_receipts as receipt
    join receipt_evidence_before_correction as before using (id, receipt_hash)
  ),
  6::bigint,
  'all immutable receipt identities and hashes survive replay unchanged'
);
select is(
  (
    select count(*)
    from private.settlement_versions as settlement
    join private.position_receipts as receipt on receipt.id = settlement.receipt_id
    join private.sports_events as event on event.id = receipt.event_id
    where event.fixture_event_key = 'buf-nyj'
      and settlement.supersedes_id is not null
  ),
  2::bigint,
  'both affected settlements append superseding versions'
);
select set_eq(
  $$
    select distinct settlement.outcome
    from private.settlement_versions as settlement
    where not exists (
      select 1
      from private.settlement_versions as newer
      where newer.supersedes_id = settlement.id
    )
  $$,
  $$values ('WIN'), ('LOSS'), ('PUSH'), ('VOID')$$,
  'the final receipt set demonstrates win, loss, push, and void'
);
select is(
  (select correction_window_closes_at from private.season_weeks where nfl_week = 1),
  (select correction_window_closes_at from correction_window_before),
  'a correction does not extend its own 24-hour window'
);
select ok(
  (select count(*) > 0 from private.standings_snapshots where supersedes_id is not null),
  'standings replay appends a superseding snapshot'
);

select api.advance_stage1_clock(
  '10000000-0000-4000-8000-000000000001',
  (
    select correction_window_closes_at + interval '1 minute'
    from private.season_weeks
    where nfl_week = 1
  ),
  'advance-after-correction-window'
);
select lives_ok(
  $$select api.finalize_stage1_week(
    '10000000-0000-4000-8000-000000000001',
    'finalize-stage1-week'
  )$$,
  'the commissioner can finalize only after the correction window'
);
select is(
  (select state from private.season_weeks where nfl_week = 1),
  'FINAL',
  'Week 1 becomes final'
);
select is(
  (select count(*) from private.weekly_score_versions where status = 'FINAL'),
  8::bigint,
  'all eight weekly scores receive final versions'
);
select is(
  (select count(*) from private.matchup_result_versions where status = 'FINAL'),
  4::bigint,
  'all four matchup results receive final versions'
);
select is(
  (select count(*) from private.standings_snapshots where status = 'FINAL'),
  1::bigint,
  'the standings receive a final snapshot'
);

select throws_ok(
  $$update private.position_receipts set stake_credits = stake_credits where true$$,
  '55000',
  'position_receipts is append-only.',
  'accepted receipts cannot be updated even by an elevated database actor'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  (select count(*) from private.position_receipts),
  2::bigint,
  'RLS exposes only the signed-in owner receipts, including to the commissioner'
);
reset role;

select * from finish();
rollback;
