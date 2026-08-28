begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table(
  'private',
  'playoff_round_publications',
  'postseason round publications are stored outside the Data API schema'
);
select has_column(
  'private',
  'matchups',
  'playoff_round_publication_id',
  'matchups identify their immutable postseason publication'
);
select has_index(
  'private',
  'playoff_round_publications',
  'playoff_round_publications_week_fk_idx',
  'the composite week foreign key is indexed'
);
select has_function(
  'api',
  'publish_next_live_postseason_week',
  array['uuid', 'uuid', 'text[]', 'text'],
  'the guarded postseason publication command is exposed'
);
select function_privs_are(
  'api',
  'publish_next_live_postseason_week',
  array['uuid', 'uuid', 'text[]', 'text'],
  'anon',
  array[]::text[],
  'anonymous callers cannot publish a postseason round'
);
select function_privs_are(
  'api',
  'publish_next_live_postseason_week',
  array['uuid', 'uuid', 'text[]', 'text'],
  'authenticated',
  array['EXECUTE'],
  'authenticated callers can invoke the self-authorizing command'
);
select function_privs_are(
  'private',
  'build_next_live_postseason_round',
  array['uuid', 'integer'],
  'authenticated',
  array[]::text[],
  'participants cannot invoke the internal bracket builder'
);

create temporary table postseason_fixture as
select
  seed,
  ('b1000000-0000-4000-8000-' || lpad(seed::text, 12, '0'))::uuid as user_id,
  ('b4000000-0000-4000-8000-' || lpad(seed::text, 12, '0'))::uuid as entry_id,
  'Postseason Seed ' || seed::text as display_name
from generate_series(1, 10) as seed;

insert into auth.users (id, email)
select user_id, 'postseason-seed-' || seed::text || '@example.test'
from postseason_fixture;

insert into private.profiles (id, display_name)
select user_id, display_name from postseason_fixture;

insert into private.leagues (id, name, slug, created_by)
values (
  'b2000000-0000-4000-8000-000000000001',
  'Stage 3 Postseason Rounds Test',
  'stage3-postseason-rounds-test',
  'b1000000-0000-4000-8000-000000000001'
);

insert into private.league_memberships (league_id, user_id, role)
select
  'b2000000-0000-4000-8000-000000000001',
  user_id,
  case when seed = 1 then 'COMMISSIONER' else 'MEMBER' end
from postseason_fixture;

insert into private.season_ruleset_snapshots (
  id, ruleset_id, ruleset_version, product_bible_id, product_bible_version,
  mode, canonical_json, sha256_hash, frozen_at
) values (
  'b3000000-0000-4000-8000-000000000001',
  'live-season-1', '1.0', 'sunday-ledger-product-bible', '3.0',
  'LIVE', '{"mode":"LIVE"}', repeat('a', 64), now() - interval '16 weeks'
);

insert into private.seasons (
  id, league_id, ruleset_snapshot_id, mode, nfl_year, lifecycle,
  roster_seed, schedule_seed, roster_locked_at
) values (
  'b3500000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000001',
  'LIVE', 2026, 'REGULAR', repeat('b', 64), repeat('c', 64),
  now() - interval '16 weeks'
);

insert into private.season_entries (
  id, season_id, league_id, user_id, standing_tiebreak
)
select
  entry_id,
  'b3500000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001',
  user_id,
  repeat(to_hex(seed), 64)
from postseason_fixture;

insert into private.season_weeks (
  id, season_id, league_id, nfl_week, scope, state, opens_at,
  common_lock_at, locked_at, correction_window_closes_at
) values (
  'b5000000-0000-4000-8000-000000000001',
  'b3500000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001',
  14, 'REGULAR', 'FINAL', now() - interval '8 days',
  now() - interval '7 days', now() - interval '7 days',
  now() - interval '6 days'
);

insert into private.standings_snapshots (
  id, season_id, week_id, league_id, through_week, ordered_rows,
  input_hash, status
)
select
  'b6000000-0000-4000-8000-000000000001',
  'b3500000-0000-4000-8000-000000000001',
  'b5000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001',
  14,
  jsonb_agg(
    jsonb_build_object(
      'seed', seed,
      'entryId', entry_id,
      'displayName', display_name,
      'wins', 15 - seed,
      'losses', seed - 1,
      'ties', 0,
      'pointsForCenticredits', 1600000 - seed * 25000,
      'allPlayHalfWinUnits', 150 - seed * 5,
      'allPlayComparisonCount', 126,
      'attendanceMisses', 0,
      'highestWeekCenticredits', 170000 - seed * 2500,
      'deterministicTiebreak', repeat(to_hex(seed), 64)
    ) order by seed
  ),
  repeat('d', 64),
  'FINAL'
from postseason_fixture;

create or replace function pg_temp.postseason_odds_import(p_week integer)
returns jsonb
language sql
volatile
as $$
  select jsonb_build_object(
    'source', 'THE_ODDS_API',
    'fetchedAt', clock_timestamp(),
    'events', jsonb_build_array(
      jsonb_build_object(
        'source', 'THE_ODDS_API',
        'externalEventId', 'postseason-provider-week-' || p_week::text,
        'sportKey', 'americanfootball_nfl',
        'awayTeam', 'Buffalo Bills',
        'homeTeam', 'New York Jets',
        'scheduledStartAt', clock_timestamp() + interval '30 minutes',
        'markets', jsonb_build_array(
          jsonb_build_object(
            'sourceBook', 'draftkings', 'marketType', 'MONEYLINE',
            'outcomeKey', 'AWAY', 'proposition', 'Buffalo Bills to win',
            'lineMilli', null, 'americanOdds', -160,
            'observedAt', now()
          ),
          jsonb_build_object(
            'sourceBook', 'draftkings', 'marketType', 'MONEYLINE',
            'outcomeKey', 'HOME', 'proposition', 'New York Jets to win',
            'lineMilli', null, 'americanOdds', 140,
            'observedAt', now()
          ),
          jsonb_build_object(
            'sourceBook', 'draftkings', 'marketType', 'SPREAD',
            'outcomeKey', 'AWAY', 'proposition', 'Buffalo Bills -3.5',
            'lineMilli', -3500, 'americanOdds', -108,
            'observedAt', now()
          ),
          jsonb_build_object(
            'sourceBook', 'draftkings', 'marketType', 'SPREAD',
            'outcomeKey', 'HOME', 'proposition', 'New York Jets +3.5',
            'lineMilli', 3500, 'americanOdds', -112,
            'observedAt', now()
          ),
          jsonb_build_object(
            'sourceBook', 'draftkings', 'marketType', 'TOTAL',
            'outcomeKey', 'OVER', 'proposition', 'Over 44.5',
            'lineMilli', 44500, 'americanOdds', -105,
            'observedAt', now()
          ),
          jsonb_build_object(
            'sourceBook', 'draftkings', 'marketType', 'TOTAL',
            'outcomeKey', 'UNDER', 'proposition', 'Under 44.5',
            'lineMilli', 44500, 'americanOdds', -115,
            'observedAt', now()
          )
        )
      )
    )
  );
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$select api.publish_live_playoff_qualification(
    'b2000000-0000-4000-8000-000000000001',
    'postseason-qualification-2026'
  )$$,
  'the commissioner freezes the six-entry field'
);
select is(
  (
    select bracket_json ->> 'format'
    from private.playoff_publications
    where season_id = 'b3500000-0000-4000-8000-000000000001'
  ),
  'LARGE_SIX',
  'a ten-entry league uses the reseeded six-entry bracket'
);

create temporary table postseason_imports (nfl_week integer primary key, import_id uuid not null);
insert into postseason_imports
select
  15,
  (api.store_live_odds_import(
    'b2000000-0000-4000-8000-000000000001',
    pg_temp.postseason_odds_import(15),
    'postseason-odds-week-15'
  ) ->> 'importId')::uuid;

select set_config(
  'request.jwt.claims',
  '{"sub":"b1000000-0000-4000-8000-000000000010","role":"authenticated"}',
  true
);
select throws_ok(
  $$select api.publish_next_live_postseason_week(
    'b2000000-0000-4000-8000-000000000001',
    (select import_id from postseason_imports where nfl_week = 15),
    array['postseason-provider-week-15'],
    'member-cannot-publish-postseason'
  )$$,
  '42501',
  'Commissioner membership required.',
  'a regular member cannot publish Week 15'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$select api.publish_next_live_postseason_week(
    'b2000000-0000-4000-8000-000000000001',
    (select import_id from postseason_imports where nfl_week = 15),
    array['postseason-provider-week-15'],
    'publish-postseason-week-15'
  )$$,
  'the commissioner publishes the frozen Week 15 opening round'
);

select is(
  (
    select count(*)::integer
    from private.matchups as matchup
    join private.season_weeks as week on week.id = matchup.week_id
    where week.season_id = 'b3500000-0000-4000-8000-000000000001'
      and week.nfl_week = 15
      and matchup.scope = 'PLAYOFF'
  ),
  2,
  'Week 15 contains the 3-vs-6 and 4-vs-5 opening-round matchups'
);
select is(
  (
    select count(*)::integer
    from private.weekly_cards as card
    join private.season_weeks as week on week.id = card.week_id
    where week.season_id = 'b3500000-0000-4000-8000-000000000001'
      and week.nfl_week = 15
  ),
  4,
  'only the four opening-round participants receive Week 15 cards'
);
select is(
  (
    select count(*)::integer
    from private.weekly_cards as card
    join private.season_weeks as week on week.id = card.week_id
    where week.season_id = 'b3500000-0000-4000-8000-000000000001'
      and week.nfl_week = 15
      and card.entry_id in (
        'b4000000-0000-4000-8000-000000000001',
        'b4000000-0000-4000-8000-000000000002'
      )
  ),
  0,
  'the top two seeds have byes and receive no Week 15 card'
);
select is(
  (
    select count(*)::integer
    from private.matchups as matchup
    join private.season_weeks as week on week.id = matchup.week_id
    where week.season_id = 'b3500000-0000-4000-8000-000000000001'
      and week.nfl_week = 15
      and matchup.schedule_publication_id is null
      and matchup.playoff_round_publication_id is not null
  ),
  2,
  'postseason matchups cite the round publication and not the regular schedule'
);

-- This suite runs in one transaction, while publication intentionally records
-- opens_at with clock_timestamp(). Move only the fixture open time behind the
-- transaction-stable now() before participant card submissions.
update private.season_weeks
set opens_at = now() - interval '1 minute'
where season_id = 'b3500000-0000-4000-8000-000000000001'
  and nfl_week = 15;
select set_config(
  'request.jwt.claims',
  '{"sub":"b1000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
select lives_ok(
  $$select api.accept_stage1_card(
    'stage3-postseason-rounds-test',
    jsonb_build_array(jsonb_build_object(
      'marketSnapshotId', (
        select snapshot.id
        from private.market_snapshots as snapshot
        join private.season_weeks as week on week.id = snapshot.week_id
        where week.nfl_week = 15 and snapshot.market_type = 'MONEYLINE'
          and snapshot.outcome_key = 'AWAY'
        limit 1
      ),
      'stakeCredits', 1000,
      'payloadHash', (
        select snapshot.payload_hash
        from private.market_snapshots as snapshot
        join private.season_weeks as week on week.id = snapshot.week_id
        where week.nfl_week = 15 and snapshot.market_type = 'MONEYLINE'
          and snapshot.outcome_key = 'AWAY'
        limit 1
      )
    )),
    'postseason-seed-3-card'
  )$$,
  'seed 3 can seal a real postseason card'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated"}',
  true
);
select lives_ok(
  $$select api.accept_stage1_card(
    'stage3-postseason-rounds-test',
    jsonb_build_array(jsonb_build_object(
      'marketSnapshotId', (
        select snapshot.id
        from private.market_snapshots as snapshot
        join private.season_weeks as week on week.id = snapshot.week_id
        where week.nfl_week = 15 and snapshot.market_type = 'MONEYLINE'
          and snapshot.outcome_key = 'AWAY'
        limit 1
      ),
      'stakeCredits', 1000,
      'payloadHash', (
        select snapshot.payload_hash
        from private.market_snapshots as snapshot
        join private.season_weeks as week on week.id = snapshot.week_id
        where week.nfl_week = 15 and snapshot.market_type = 'MONEYLINE'
          and snapshot.outcome_key = 'AWAY'
        limit 1
      )
    )),
    'postseason-seed-6-card'
  )$$,
  'seed 6 can seal the same terms for an exact-score tie test'
);

update private.season_weeks
set opens_at = now() - interval '2 minutes',
    common_lock_at = now() - interval '1 minute'
where season_id = 'b3500000-0000-4000-8000-000000000001'
  and nfl_week = 15;
update private.slates
set common_lock_at = now() - interval '1 minute'
where season_id = 'b3500000-0000-4000-8000-000000000001'
  and week_id = (
    select id from private.season_weeks
    where season_id = 'b3500000-0000-4000-8000-000000000001' and nfl_week = 15
  );
update private.sports_events
set scheduled_start_at = now() - interval '1 hour'
where season_id = 'b3500000-0000-4000-8000-000000000001'
  and week_id = (
    select id from private.season_weeks
    where season_id = 'b3500000-0000-4000-8000-000000000001' and nfl_week = 15
  );

select set_config(
  'request.jwt.claims',
  '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$select api.lock_stage1_week(
    'b2000000-0000-4000-8000-000000000001',
    'lock-postseason-week-15'
  )$$,
  'the shared lock command freezes postseason cards'
);
select is(
  (
    select count(*)::integer
    from private.weekly_cards as card
    join private.season_weeks as week on week.id = card.week_id
    where week.nfl_week = 15 and card.compliance = 'INCOMPLETE'
  ),
  2,
  'the unsealed 4-vs-5 cards become incomplete at common lock'
);

select lives_ok(
  $$select api.import_live_scores(
    'b2000000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'source', 'THE_ODDS_API',
      'fetchedAt', clock_timestamp(),
      'events', (
        select jsonb_agg(jsonb_build_object(
          'source', 'THE_ODDS_API',
          'externalEventId', event.fixture_event_key,
          'sportKey', 'americanfootball_nfl',
          'awayTeam', event.away_team,
          'homeTeam', event.home_team,
          'scheduledStartAt', event.scheduled_start_at,
          'completed', true,
          'awayScore', 21,
          'homeScore', 14,
          'lastUpdate', clock_timestamp()
        ))
        from private.sports_events as event
        join private.season_weeks as week on week.id = event.week_id
        where week.nfl_week = 15
          and week.season_id = 'b3500000-0000-4000-8000-000000000001'
      )
    ),
    'score-postseason-week-15'
  )$$,
  'official scores settle both postseason matchups'
);
select is(
  (
    select count(*)::integer
    from private.matchup_result_versions as result
    join private.season_weeks as week on week.id = result.week_id
    where week.nfl_week = 15 and result.status = 'PROVISIONAL'
  ),
  2,
  'both opening-round matchup results are provisionally materialized'
);

update private.season_weeks
set correction_window_closes_at = now() - interval '1 minute'
where season_id = 'b3500000-0000-4000-8000-000000000001'
  and nfl_week = 15;
select lives_ok(
  $$select api.finalize_stage1_week(
    'b2000000-0000-4000-8000-000000000001',
    'finalize-postseason-week-15'
  )$$,
  'the shared finalization command freezes postseason result versions'
);
select is(
  (
    select count(*)::integer
    from private.standings_snapshots
    where season_id = 'b3500000-0000-4000-8000-000000000001'
      and through_week = 15
  ),
  0,
  'postseason settlement never creates a standings snapshot'
);

insert into postseason_imports
select
  16,
  (api.store_live_odds_import(
    'b2000000-0000-4000-8000-000000000001',
    pg_temp.postseason_odds_import(16),
    'postseason-odds-week-16'
  ) ->> 'importId')::uuid;
select lives_ok(
  $$select api.publish_next_live_postseason_week(
    'b2000000-0000-4000-8000-000000000001',
    (select import_id from postseason_imports where nfl_week = 16),
    array['postseason-provider-week-16'],
    'publish-postseason-week-16'
  )$$,
  'final Week 15 results deterministically publish the reseeded semifinals'
);

select is(
  (
    select side_a_entry_id::text || ':' || side_b_entry_id::text
    from private.matchups as matchup
    join private.season_weeks as week on week.id = matchup.week_id
    where week.nfl_week = 16 and matchup.display_order = 1
  ),
  'b4000000-0000-4000-8000-000000000001:b4000000-0000-4000-8000-000000000004',
  'No. 1 faces the lowest remaining seed after dual-incomplete 4-vs-5'
);
select is(
  (
    select side_a_entry_id::text || ':' || side_b_entry_id::text
    from private.matchups as matchup
    join private.season_weeks as week on week.id = matchup.week_id
    where week.nfl_week = 16 and matchup.display_order = 2
  ),
  'b4000000-0000-4000-8000-000000000002:b4000000-0000-4000-8000-000000000003',
  'No. 2 faces seed 3 after an exact-score 3-vs-6 tie'
);
select is(
  (
    select cardinality(source_result_version_ids)
    from private.playoff_round_publications
    where season_id = 'b3500000-0000-4000-8000-000000000001'
      and nfl_week = 16
  ),
  2,
  'the semifinal publication cites both final opening-round result versions'
);
select is(
  (
    api.publish_next_live_postseason_week(
      'b2000000-0000-4000-8000-000000000001',
      (select import_id from postseason_imports where nfl_week = 16),
      array['postseason-provider-week-16'],
      'publish-postseason-week-16'
    ) ->> 'roundPublicationId'
  ),
  (
    select id::text from private.playoff_round_publications
    where season_id = 'b3500000-0000-4000-8000-000000000001'
      and nfl_week = 16
  ),
  'postseason publication replays idempotently'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"b1000000-0000-4000-8000-000000000010","role":"authenticated"}',
  true
);
select is(
  jsonb_array_length(
    api.get_live_playoff_state('stage3-postseason-rounds-test') -> 'rounds'
  ),
  2,
  'a league member sees both published rounds in the playoff read model'
);
select is(
  api.get_live_playoff_state('stage3-postseason-rounds-test')
    #>> '{rounds,1,matchups,0,sideB,qualificationSeed}',
  '4',
  'the member read model exposes the derived reseeding evidence'
);

select throws_ok(
  $$update private.playoff_round_publications
    set published_at = published_at + interval '1 second'
    where season_id = 'b3500000-0000-4000-8000-000000000001'
      and nfl_week = 15$$,
  '55000',
  'playoff_round_publications is append-only.',
  'published postseason rounds reject mutation'
);

select * from finish();
rollback;
