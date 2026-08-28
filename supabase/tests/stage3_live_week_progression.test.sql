begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function(
  'api',
  'publish_next_live_week_slate',
  array['uuid', 'uuid', 'text[]', 'text'],
  'the guarded next-week publication command is exposed'
);
select has_function(
  'private',
  'build_regular_standings',
  array['uuid'],
  'the database owns cumulative regular-season standings'
);
select function_privs_are(
  'api',
  'publish_next_live_week_slate',
  array['uuid', 'uuid', 'text[]', 'text'],
  'anon',
  array[]::text[],
  'anonymous callers cannot advance the season'
);
select function_privs_are(
  'api',
  'publish_next_live_week_slate',
  array['uuid', 'uuid', 'text[]', 'text'],
  'authenticated',
  array['EXECUTE'],
  'authenticated callers can invoke the self-authorizing command'
);
select function_privs_are(
  'private',
  'build_regular_standings',
  array['uuid'],
  'authenticated',
  array[]::text[],
  'participants cannot invoke the internal standings builder'
);

create or replace function pg_temp.progression_odds_import()
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
        'externalEventId', 'progression-provider-week-2',
        'sportKey', 'americanfootball_nfl',
        'awayTeam', 'Buffalo Bills',
        'homeTeam', 'New York Jets',
        'scheduledStartAt', now() + interval '7 days',
        'markets', jsonb_build_array(
          jsonb_build_object(
            'sourceBook', 'draftkings', 'marketType', 'MONEYLINE',
            'outcomeKey', 'AWAY', 'proposition', 'Buffalo Bills to win',
            'lineMilli', null, 'americanOdds', -160, 'observedAt', now()
          ),
          jsonb_build_object(
            'sourceBook', 'draftkings', 'marketType', 'MONEYLINE',
            'outcomeKey', 'HOME', 'proposition', 'New York Jets to win',
            'lineMilli', null, 'americanOdds', 140, 'observedAt', now()
          ),
          jsonb_build_object(
            'sourceBook', 'draftkings', 'marketType', 'SPREAD',
            'outcomeKey', 'AWAY', 'proposition', 'Buffalo Bills -3.5',
            'lineMilli', -3500, 'americanOdds', -108, 'observedAt', now()
          ),
          jsonb_build_object(
            'sourceBook', 'draftkings', 'marketType', 'SPREAD',
            'outcomeKey', 'HOME', 'proposition', 'New York Jets +3.5',
            'lineMilli', 3500, 'americanOdds', -112, 'observedAt', now()
          ),
          jsonb_build_object(
            'sourceBook', 'draftkings', 'marketType', 'TOTAL',
            'outcomeKey', 'OVER', 'proposition', 'Over 44.5',
            'lineMilli', 44500, 'americanOdds', -105, 'observedAt', now()
          ),
          jsonb_build_object(
            'sourceBook', 'draftkings', 'marketType', 'TOTAL',
            'outcomeKey', 'UNDER', 'proposition', 'Under 44.5',
            'lineMilli', 44500, 'americanOdds', -115, 'observedAt', now()
          )
        )
      )
    )
  );
$$;

insert into auth.users (id, email)
values
  ('91000000-0000-4000-8000-000000000001', 'progression-commissioner@example.test'),
  ('91000000-0000-4000-8000-000000000002', 'progression-member-2@example.test'),
  ('91000000-0000-4000-8000-000000000003', 'progression-member-3@example.test'),
  ('91000000-0000-4000-8000-000000000004', 'progression-member-4@example.test');

insert into private.profiles (id, display_name)
values
  ('91000000-0000-4000-8000-000000000001', 'Progression Commissioner'),
  ('91000000-0000-4000-8000-000000000002', 'Progression Member Two'),
  ('91000000-0000-4000-8000-000000000003', 'Progression Member Three'),
  ('91000000-0000-4000-8000-000000000004', 'Progression Member Four');

insert into private.leagues (id, name, slug, created_by)
values (
  '92000000-0000-4000-8000-000000000001',
  'Stage 3 Week Progression Test',
  'stage3-week-progression-test',
  '91000000-0000-4000-8000-000000000001'
);

insert into private.league_memberships (league_id, user_id, role)
values
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'COMMISSIONER'),
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002', 'MEMBER'),
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000003', 'MEMBER'),
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000004', 'MEMBER');

insert into private.season_ruleset_snapshots (
  id, ruleset_id, ruleset_version, product_bible_id, product_bible_version,
  mode, canonical_json, sha256_hash, frozen_at
) values (
  '93000000-0000-4000-8000-000000000001',
  'live-season-1', '1.0', 'sunday-ledger-product-bible', '3.0',
  'LIVE', '{"mode":"LIVE"}', repeat('a', 64), now() - interval '8 days'
);

insert into private.seasons (
  id, league_id, ruleset_snapshot_id, mode, nfl_year, lifecycle,
  roster_seed, schedule_seed, roster_locked_at
) values (
  '93500000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001',
  'LIVE', 2026, 'REGULAR', repeat('b', 64),
  'stage3-live-progression-seed-0001', now() - interval '8 days'
);

insert into private.season_entries (
  id, season_id, league_id, user_id, standing_tiebreak
) values
  ('94000000-0000-4000-8000-000000000001', '93500000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', repeat('1', 64)),
  ('94000000-0000-4000-8000-000000000002', '93500000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002', repeat('2', 64)),
  ('94000000-0000-4000-8000-000000000003', '93500000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000003', repeat('3', 64)),
  ('94000000-0000-4000-8000-000000000004', '93500000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000004', repeat('4', 64));

with generated as (
  select private.generate_regular_season_schedule(
    array[
      '94000000-0000-4000-8000-000000000001'::uuid,
      '94000000-0000-4000-8000-000000000002'::uuid,
      '94000000-0000-4000-8000-000000000003'::uuid,
      '94000000-0000-4000-8000-000000000004'::uuid
    ],
    'stage3-live-progression-seed-0001'
  ) as schedule
)
insert into private.schedule_publications (
  id, season_id, league_id, version, algorithm_version, seed,
  ordered_entry_ids, output_hash, schedule_json, created_by, published_at
)
select
  '94500000-0000-4000-8000-000000000001',
  '93500000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  1, 'circle-v1', 'stage3-live-progression-seed-0001',
  array[
    '94000000-0000-4000-8000-000000000001'::uuid,
    '94000000-0000-4000-8000-000000000002'::uuid,
    '94000000-0000-4000-8000-000000000003'::uuid,
    '94000000-0000-4000-8000-000000000004'::uuid
  ],
  schedule ->> 'outputHash', schedule,
  '91000000-0000-4000-8000-000000000001', now() - interval '8 days'
from generated;

insert into private.season_weeks (
  id, season_id, league_id, nfl_week, state, opens_at, common_lock_at,
  locked_at, correction_window_closes_at
) values (
  '95000000-0000-4000-8000-000000000001',
  '93500000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  1, 'LOCKED', now() - interval '8 days', now() - interval '7 days',
  now() - interval '7 days', now() - interval '6 days'
);

insert into private.matchups (
  week_id, season_id, league_id, schedule_publication_id,
  side_a_entry_id, side_b_entry_id, display_order
)
select
  '95000000-0000-4000-8000-000000000001',
  '93500000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  '94500000-0000-4000-8000-000000000001',
  (scheduled.value ->> 'sideAEntryId')::uuid,
  (scheduled.value ->> 'sideBEntryId')::uuid,
  row_number() over (order by scheduled.ordinality)::integer
from private.schedule_publications as publication,
  jsonb_array_elements(publication.schedule_json -> 'matchups')
    with ordinality as scheduled(value, ordinality)
where publication.id = '94500000-0000-4000-8000-000000000001'
  and (scheduled.value ->> 'week')::integer = 1;

insert into private.weekly_cards (
  id, week_id, season_id, league_id, entry_id, owner_user_id,
  granted_at, compliance, locked_at
) values
  ('95100000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000001', '93500000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', now() - interval '8 days', 'COMPLIANT', now() - interval '7 days'),
  ('95100000-0000-4000-8000-000000000002', '95000000-0000-4000-8000-000000000001', '93500000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002', now() - interval '8 days', 'COMPLIANT', now() - interval '7 days'),
  ('95100000-0000-4000-8000-000000000003', '95000000-0000-4000-8000-000000000001', '93500000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000003', now() - interval '8 days', 'COMPLIANT', now() - interval '7 days'),
  ('95100000-0000-4000-8000-000000000004', '95000000-0000-4000-8000-000000000001', '93500000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000004', '91000000-0000-4000-8000-000000000004', now() - interval '8 days', 'COMPLIANT', now() - interval '7 days');

insert into private.weekly_score_versions (
  id, card_id, week_id, league_id, entry_id, input_hash, compliance,
  score_centicredits, is_complete, status
) values
  ('95200000-0000-4000-8000-000000000001', '95100000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', repeat('1', 64), 'COMPLIANT', 120000, true, 'FINAL'),
  ('95200000-0000-4000-8000-000000000002', '95100000-0000-4000-8000-000000000002', '95000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000002', repeat('2', 64), 'COMPLIANT', 90000, true, 'FINAL'),
  ('95200000-0000-4000-8000-000000000003', '95100000-0000-4000-8000-000000000003', '95000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000003', repeat('3', 64), 'COMPLIANT', 80000, true, 'FINAL'),
  ('95200000-0000-4000-8000-000000000004', '95100000-0000-4000-8000-000000000004', '95000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000004', repeat('4', 64), 'COMPLIANT', 70000, true, 'FINAL');

insert into private.matchup_result_versions (
  matchup_id, week_id, league_id, side_a_score_version_id,
  side_b_score_version_id, side_a_decision, side_b_decision,
  side_a_points_for_centicredits, side_b_points_for_centicredits,
  input_hash, status
)
select
  matchup.id, matchup.week_id, matchup.league_id,
  side_a.id, side_b.id, 'WIN', 'LOSS',
  side_a.score_centicredits, side_b.score_centicredits,
  encode(extensions.digest(matchup.id::text || ':week1-final', 'sha256'), 'hex'),
  'FINAL'
from private.matchups as matchup
join private.weekly_score_versions as side_a
  on side_a.week_id = matchup.week_id and side_a.entry_id = matchup.side_a_entry_id
join private.weekly_score_versions as side_b
  on side_b.week_id = matchup.week_id and side_b.entry_id = matchup.side_b_entry_id
where matchup.week_id = '95000000-0000-4000-8000-000000000001';

select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$select api.store_live_odds_import(
    '92000000-0000-4000-8000-000000000001',
    pg_temp.progression_odds_import(),
    'store-progression-week-2-import'
  )$$,
  'the commissioner can store a fresh next-week import'
);

select throws_ok(
  $$select api.publish_next_live_week_slate(
    '92000000-0000-4000-8000-000000000001',
    (select id from private.live_odds_imports where season_id = '93500000-0000-4000-8000-000000000001'),
    array['progression-provider-week-2'],
    'publish-week-2-too-early'
  )$$,
  '55000',
  'The current week must be final before the next week can publish.',
  'the next week cannot publish before the current week is final'
);

update private.season_weeks
set state = 'FINAL'
where id = '95000000-0000-4000-8000-000000000001';

select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  $$select api.publish_next_live_week_slate(
    '92000000-0000-4000-8000-000000000001',
    (select id from private.live_odds_imports where season_id = '93500000-0000-4000-8000-000000000001'),
    array['progression-provider-week-2'],
    'member-publish-week-2'
  )$$,
  '42501',
  'Commissioner membership required.',
  'a member cannot advance the operational season'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$select api.publish_next_live_week_slate(
    '92000000-0000-4000-8000-000000000001',
    (select id from private.live_odds_imports where season_id = '93500000-0000-4000-8000-000000000001'),
    array['progression-provider-week-2'],
    'publish-progression-week-2'
  )$$,
  'a commissioner atomically opens Week 2 from the frozen schedule'
);

select is(
  (select count(*) from private.season_weeks where season_id = '93500000-0000-4000-8000-000000000001'),
  2::bigint,
  'exactly one additional operational week is materialized'
);
select is(
  (select state from private.season_weeks where season_id = '93500000-0000-4000-8000-000000000001' and nfl_week = 2),
  'OPEN',
  'the next week opens immediately after publication'
);
select is(
  (select count(*) from private.weekly_cards where season_id = '93500000-0000-4000-8000-000000000001' and week_id <> '95000000-0000-4000-8000-000000000001' and granted_credits = 1000),
  4::bigint,
  'every frozen entry receives one fresh 1,000-credit card'
);
select is(
  (select count(*) from private.matchups where season_id = '93500000-0000-4000-8000-000000000001' and week_id <> '95000000-0000-4000-8000-000000000001'),
  2::bigint,
  'the correct number of next-week matchups is materialized'
);
select ok(
  not exists (
    select 1
    from private.matchups as matchup
    join private.season_weeks as week on week.id = matchup.week_id
    join private.schedule_publications as publication on publication.id = matchup.schedule_publication_id
    where week.season_id = '93500000-0000-4000-8000-000000000001'
      and week.nfl_week = 2
      and not exists (
        select 1
        from jsonb_array_elements(publication.schedule_json -> 'matchups') as scheduled(value)
        where (scheduled.value ->> 'week')::integer = 2
          and (scheduled.value ->> 'sideAEntryId')::uuid = matchup.side_a_entry_id
          and (scheduled.value ->> 'sideBEntryId')::uuid = matchup.side_b_entry_id
      )
  ),
  'every materialized pairing exactly matches the frozen Week 2 schedule'
);
select is(
  api.get_stage1_state('stage3-week-progression-test') -> 'week' ->> 'nflWeek',
  '2',
  'the participant read model follows the latest materialized week'
);

update private.season_weeks
set opens_at = now() - interval '1 minute'
where season_id = '93500000-0000-4000-8000-000000000001' and nfl_week = 2;

select lives_ok(
  $$select api.accept_stage1_card(
    'stage3-week-progression-test',
    jsonb_build_array(jsonb_build_object(
      'marketSnapshotId', snapshot.id,
      'stakeCredits', 1000,
      'payloadHash', snapshot.payload_hash
    )),
    'accept-progression-week-2-card'
  )
  from private.market_snapshots as snapshot
  join private.season_weeks as week on week.id = snapshot.week_id
  where week.season_id = '93500000-0000-4000-8000-000000000001'
    and week.nfl_week = 2
    and snapshot.market_type = 'MONEYLINE'
    and snapshot.outcome_key = 'AWAY'
  limit 1$$,
  'the existing atomic card command accepts against Week 2'
);

update private.season_weeks
set
  opens_at = now() - interval '3 hours',
  common_lock_at = now() - interval '2 hours'
where season_id = '93500000-0000-4000-8000-000000000001' and nfl_week = 2;
update private.sports_events as event
set scheduled_start_at = now() - interval '1 hour'
from private.season_weeks as week
where week.id = event.week_id
  and week.season_id = '93500000-0000-4000-8000-000000000001'
  and week.nfl_week = 2;
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$select api.lock_stage1_week(
    '92000000-0000-4000-8000-000000000001',
    'lock-progression-week-2'
  )$$,
  'the existing lock command targets Week 2'
);
select is(
  (select count(*) from private.weekly_cards as card join private.season_weeks as week on week.id = card.week_id where week.season_id = '93500000-0000-4000-8000-000000000001' and week.nfl_week = 2 and card.compliance = 'INCOMPLETE'),
  3::bigint,
  'unsealed Week 2 cards become attendance misses'
);

create or replace function pg_temp.progression_score_import()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'source', 'THE_ODDS_API',
    'fetchedAt', now(),
    'events', jsonb_build_array(jsonb_build_object(
      'source', 'THE_ODDS_API',
      'externalEventId', event.fixture_event_key,
      'sportKey', 'americanfootball_nfl',
      'awayTeam', event.away_team,
      'homeTeam', event.home_team,
      'scheduledStartAt', event.scheduled_start_at,
      'completed', true,
      'awayScore', 27,
      'homeScore', 20,
      'lastUpdate', now() - interval '1 minute'
    ))
  )
  from private.sports_events as event
  join private.season_weeks as week on week.id = event.week_id
  where week.season_id = '93500000-0000-4000-8000-000000000001'
    and week.nfl_week = 2;
$$;

select lives_ok(
  $$select api.import_live_scores(
    '92000000-0000-4000-8000-000000000001',
    pg_temp.progression_score_import(),
    'settle-progression-week-2'
  )$$,
  'the existing score import settles Week 2 and recomputes cumulative standings'
);
select is(
  (select state from private.season_weeks where season_id = '93500000-0000-4000-8000-000000000001' and nfl_week = 2),
  'PROVISIONAL',
  'all designated results open the Week 2 correction window'
);
select is(
  (
    select sum((row.value ->> 'wins')::integer + (row.value ->> 'losses')::integer + (row.value ->> 'ties')::integer)
    from (
      select standings.ordered_rows
      from private.standings_snapshots as standings
      where standings.season_id = '93500000-0000-4000-8000-000000000001'
        and standings.through_week = 2
      order by standings.created_at desc
      limit 1
    ) as latest,
      jsonb_array_elements(latest.ordered_rows) as row(value)
  ),
  8::bigint,
  'the Week 2 snapshot contains two decisions for every entry'
);
select is(
  (
    select sum((row.value ->> 'attendanceMisses')::integer)
    from (
      select standings.ordered_rows
      from private.standings_snapshots as standings
      where standings.season_id = '93500000-0000-4000-8000-000000000001'
        and standings.through_week = 2
      order by standings.created_at desc
      limit 1
    ) as latest,
      jsonb_array_elements(latest.ordered_rows) as row(value)
  ),
  3::bigint,
  'cumulative standings carry the Week 2 attendance misses'
);
select ok(
  (
    select sum((row.value ->> 'pointsForCenticredits')::bigint) >= 360000
    from (
      select standings.ordered_rows
      from private.standings_snapshots as standings
      where standings.season_id = '93500000-0000-4000-8000-000000000001'
        and standings.through_week = 2
      order by standings.created_at desc
      limit 1
    ) as latest,
      jsonb_array_elements(latest.ordered_rows) as row(value)
  ),
  'Week 1 points remain in the cumulative Week 2 snapshot'
);
select is(
  jsonb_array_length(api.get_stage1_state('stage3-week-progression-test') -> 'standings'),
  4,
  'the participant read model exposes all cumulative rows'
);

select lives_ok(
  $$select api.publish_next_live_week_slate(
    '92000000-0000-4000-8000-000000000001',
    (select id from private.live_odds_imports where season_id = '93500000-0000-4000-8000-000000000001'),
    array['progression-provider-week-2'],
    'publish-progression-week-2'
  )$$,
  'the exact next-week command replays idempotently'
);
select is(
  (select count(*) from private.season_weeks where season_id = '93500000-0000-4000-8000-000000000001'),
  2::bigint,
  'idempotent replay cannot create another week'
);

select * from finish();
rollback;
