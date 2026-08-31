begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_column(
  'private',
  'schedule_publications',
  'schedule_json',
  'schedule publications retain the exact immutable pairing payload'
);
select has_function(
  'private',
  'generate_regular_season_schedule',
  array['uuid[]', 'text'],
  'the database owns the deterministic schedule generator'
);
select has_function(
  'api',
  'lock_live_roster_and_open_week',
  array['uuid', 'text'],
  'the guarded Live roster-lock command is exposed'
);
select has_function(
  'api',
  'get_live_regular_season_schedule',
  array['text'],
  'the member schedule read model is exposed'
);
select function_privs_are(
  'api',
  'lock_live_roster_and_open_week',
  array['uuid', 'text'],
  'anon',
  array[]::text[],
  'anonymous callers cannot lock a roster'
);
select function_privs_are(
  'api',
  'lock_live_roster_and_open_week',
  array['uuid', 'text'],
  'authenticated',
  array['EXECUTE'],
  'authenticated callers can invoke the guarded roster-lock command'
);
select function_privs_are(
  'private',
  'generate_regular_season_schedule',
  array['uuid[]', 'text'],
  'authenticated',
  array[]::text[],
  'participants cannot call the internal schedule generator directly'
);

select is(
  private.generate_regular_season_schedule(
    array[
      '74000000-0000-4000-8000-000000000004'::uuid,
      '74000000-0000-4000-8000-000000000003'::uuid,
      '74000000-0000-4000-8000-000000000002'::uuid,
      '74000000-0000-4000-8000-000000000001'::uuid
    ],
    'stage3-live-roster-lock-seed-0001'
  ) ->> 'outputHash',
  '35b4236a237622597e8d0a78980dae7569cea88af4dca0823c8e3695306c798f',
  'the Postgres generator exactly matches the TypeScript circle-v1 hash'
);

create or replace function pg_temp.stage3_roster_lock_import()
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
        'externalEventId', 'provider-event-stage3-roster-lock',
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
  ('71000000-0000-4000-8000-000000000001', 'stage3-lock-commissioner@example.test'),
  ('71000000-0000-4000-8000-000000000002', 'stage3-lock-member-2@example.test'),
  ('71000000-0000-4000-8000-000000000003', 'stage3-lock-member-3@example.test'),
  ('71000000-0000-4000-8000-000000000004', 'stage3-lock-member-4@example.test'),
  ('71000000-0000-4000-8000-000000000005', 'stage3-lock-late-member@example.test');

insert into private.profiles (id, display_name)
values
  ('71000000-0000-4000-8000-000000000001', 'Lock Commissioner'),
  ('71000000-0000-4000-8000-000000000002', 'Lock Member Two'),
  ('71000000-0000-4000-8000-000000000003', 'Lock Member Three'),
  ('71000000-0000-4000-8000-000000000004', 'Lock Member Four'),
  ('71000000-0000-4000-8000-000000000005', 'Late Member');

insert into private.leagues (id, name, slug, created_by)
values (
  '72000000-0000-4000-8000-000000000001',
  'Stage 3 Roster Lock Test',
  'stage3-roster-lock-test',
  '71000000-0000-4000-8000-000000000001'
);

insert into private.league_memberships (league_id, user_id, role)
values
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'COMMISSIONER'),
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000002', 'MEMBER'),
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000003', 'MEMBER'),
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000004', 'MEMBER');

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
select
  '73000000-0000-4000-8000-000000000001',
  authoritative.ruleset_id,
  authoritative.ruleset_version,
  authoritative.product_bible_id,
  authoritative.product_bible_version,
  authoritative.mode,
  authoritative.canonical_json,
  authoritative.sha256_hash
from private.authoritative_season_rulesets as authoritative
where authoritative.mode = 'LIVE';

insert into private.seasons (
  id,
  league_id,
  ruleset_snapshot_id,
  mode,
  nfl_year,
  roster_seed,
  schedule_seed
)
values (
  '73500000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000001',
  'LIVE',
  2026,
  repeat('b', 64),
  'stage3-live-roster-lock-seed-0001'
);

insert into private.season_entries (
  id,
  season_id,
  league_id,
  user_id,
  standing_tiebreak
)
values
  ('74000000-0000-4000-8000-000000000001', '73500000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', repeat('1', 64)),
  ('74000000-0000-4000-8000-000000000002', '73500000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000002', repeat('2', 64)),
  ('74000000-0000-4000-8000-000000000003', '73500000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000003', repeat('3', 64)),
  ('74000000-0000-4000-8000-000000000004', '73500000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000004', repeat('4', 64));

select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$select api.store_live_odds_import(
    '72000000-0000-4000-8000-000000000001',
    pg_temp.stage3_roster_lock_import(),
    'store-live-roster-lock-import'
  )$$,
  'the commissioner can store the fresh lock fixture'
);
select lives_ok(
  $$select api.publish_live_week_slate(
    '72000000-0000-4000-8000-000000000001',
    (
      select id from private.live_odds_imports
      where season_id = '73500000-0000-4000-8000-000000000001'
      limit 1
    ),
    array['provider-event-stage3-roster-lock'],
    'publish-live-roster-lock-slate'
  )$$,
  'the commissioner can publish the eligible Week 1 slate'
);

savepoint solo_roster;
delete from private.league_memberships
where league_id = '72000000-0000-4000-8000-000000000001'
  and user_id <> '71000000-0000-4000-8000-000000000001';
select throws_ok(
  $$select api.lock_live_roster_and_open_week(
    '72000000-0000-4000-8000-000000000001',
    'lock-live-solo-roster'
  )$$,
  '22023',
  'Roster lock requires one season entry per member and an even roster from 4 through 16.',
  'a one-member Live test league remains safely blocked'
);
rollback to savepoint solo_roster;

savepoint stale_quotes;
with stale as (
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
  select
    gen_random_uuid(),
    snapshot.event_id,
    snapshot.week_id,
    snapshot.league_id,
    snapshot.book_key,
    snapshot.market_type,
    snapshot.outcome_key,
    snapshot.proposition,
    snapshot.line_milli,
    snapshot.american_odds,
    'HEALTHY',
    clock_timestamp() - interval '3 minutes',
    encode(extensions.digest(snapshot.id::text || ':stale', 'sha256'), 'hex')
  from private.live_quote_heads as head
  join private.market_snapshots as snapshot on snapshot.id = head.market_snapshot_id
  where head.league_id = '72000000-0000-4000-8000-000000000001'
  returning id, event_id, market_type, outcome_key
)
update private.live_quote_heads as head
set market_snapshot_id = stale.id
from stale
where head.event_id = stale.event_id
  and head.market_type = stale.market_type
  and head.outcome_key = stale.outcome_key;
select throws_ok(
  $$select api.lock_live_roster_and_open_week(
    '72000000-0000-4000-8000-000000000001',
    'lock-live-stale-quotes'
  )$$,
  '55000',
  'Every published event requires six fresh healthy current quotes before roster lock.',
  'stale current quotes fail closed before any competitive state changes'
);
rollback to savepoint stale_quotes;

select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  $$select api.lock_live_roster_and_open_week(
    '72000000-0000-4000-8000-000000000001',
    'member-lock-live-roster'
  )$$,
  '42501',
  'Commissioner membership required.',
  'a regular member cannot lock the roster'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$select api.lock_live_roster_and_open_week(
    '72000000-0000-4000-8000-000000000001',
    'lock-live-roster-and-open-week'
  )$$,
  'the commissioner can atomically lock a valid roster and open Week 1'
);

select is(
  (
    select lifecycle from private.seasons
    where id = '73500000-0000-4000-8000-000000000001'
  ),
  'REGULAR',
  'the season enters regular-season play'
);
select ok(
  (
    select roster_locked_at is not null from private.seasons
    where id = '73500000-0000-4000-8000-000000000001'
  ),
  'the roster receives an immutable lock time'
);
select is(
  (
    select state from private.season_weeks
    where season_id = '73500000-0000-4000-8000-000000000001' and nfl_week = 1
  ),
  'OPEN',
  'Week 1 cards open only after roster lock'
);
select ok(
  (
    select week.opens_at = season.roster_locked_at
      and ruleset.frozen_at = season.roster_locked_at
    from private.seasons as season
    join private.season_weeks as week on week.season_id = season.id and week.nfl_week = 1
    join private.season_ruleset_snapshots as ruleset on ruleset.id = season.ruleset_snapshot_id
    where season.id = '73500000-0000-4000-8000-000000000001'
  ),
  'rules, roster, and weekly opportunity freeze at the same instant'
);
select is(
  (
    select count(*) from private.schedule_publications
    where season_id = '73500000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'one append-only schedule publication is stored'
);
select is(
  (
    select output_hash from private.schedule_publications
    where season_id = '73500000-0000-4000-8000-000000000001'
  ),
  '35b4236a237622597e8d0a78980dae7569cea88af4dca0823c8e3695306c798f',
  'the stored publication preserves the cross-runtime output hash'
);
select is(
  (
    select jsonb_array_length(schedule_json -> 'matchups')
    from private.schedule_publications
    where season_id = '73500000-0000-4000-8000-000000000001'
  ),
  28,
  'all 14 weeks of four-member pairings are frozen in the publication'
);
select is(
  (
    select count(distinct (matchup.value ->> 'week')::integer)
    from private.schedule_publications as publication,
      jsonb_array_elements(publication.schedule_json -> 'matchups') as matchup(value)
    where publication.season_id = '73500000-0000-4000-8000-000000000001'
  ),
  14::bigint,
  'the immutable schedule covers every regular-season week'
);
select ok(
  not exists (
    select 1
    from private.schedule_publications as publication,
      generate_series(1, 14) as week_number,
      lateral (
        select count(distinct participant.entry_id) as participant_count
        from jsonb_array_elements(publication.schedule_json -> 'matchups') as matchup(value)
        cross join lateral unnest(array[
          matchup.value ->> 'sideAEntryId',
          matchup.value ->> 'sideBEntryId'
        ]) as participant(entry_id)
        where (matchup.value ->> 'week')::integer = week_number
      ) as coverage
    where publication.season_id = '73500000-0000-4000-8000-000000000001'
      and coverage.participant_count <> 4
  ),
  'every active entry appears exactly once in every week'
);
select ok(
  not exists (
    with games as (
      select
        (matchup.value ->> 'week')::integer as week_number,
        least(matchup.value ->> 'sideAEntryId', matchup.value ->> 'sideBEntryId') as low_entry,
        greatest(matchup.value ->> 'sideAEntryId', matchup.value ->> 'sideBEntryId') as high_entry
      from private.schedule_publications as publication,
        jsonb_array_elements(publication.schedule_json -> 'matchups') as matchup(value)
      where publication.season_id = '73500000-0000-4000-8000-000000000001'
    )
    select 1
    from games as prior
    join games as next
      on next.week_number = prior.week_number + 1
      and next.low_entry = prior.low_entry
      and next.high_entry = prior.high_entry
  ),
  'the frozen publication contains no consecutive rematches'
);
select is(
  (
    select count(*) from private.matchups
    where season_id = '73500000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'only the two operational Week 1 matchup rows are materialized'
);
select is(
  (
    select count(*) from private.season_weeks
    where season_id = '73500000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'future weeks remain unmaterialized until their NFL slates publish'
);
select is(
  (
    select count(*) from private.weekly_cards
    where season_id = '73500000-0000-4000-8000-000000000001'
      and granted_credits = 1000
  ),
  4::bigint,
  'every entry receives the same fresh 1,000-credit Week 1 card'
);
select is(
  jsonb_array_length(
    api.get_live_regular_season_schedule('stage3-roster-lock-test') -> 'matchups'
  ),
  28,
  'members can read the complete frozen schedule'
);
select is(
  api.get_live_regular_season_schedule('stage3-roster-lock-test') -> 'matchups' -> 0 ->> 'sideAName',
  'Lock Member Four',
  'the schedule read model resolves public member identity'
);
select is(
  api.get_stage1_state('stage3-roster-lock-test') -> 'ownerCard' ->> 'grantedCredits',
  '1000',
  'the participant read model exposes the opened equal grant'
);

select lives_ok(
  $$select api.lock_live_roster_and_open_week(
    '72000000-0000-4000-8000-000000000001',
    'lock-live-roster-and-open-week'
  )$$,
  'the exact roster-lock command replays idempotently'
);
select is(
  (
    select count(*) from private.schedule_publications
    where season_id = '73500000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'idempotent replay cannot duplicate the publication'
);

select throws_ok(
  $$insert into private.league_memberships (league_id, user_id, role)
    values (
      '72000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000005',
      'MEMBER'
    )$$,
  '55000',
  'The season roster is locked.',
  'late membership cannot change the frozen competitive roster'
);
select throws_ok(
  $$update private.schedule_publications
    set schedule_json = jsonb_set(schedule_json, '{tampered}', 'true'::jsonb)
    where season_id = '73500000-0000-4000-8000-000000000001'$$,
  '55000',
  'schedule_publications is append-only.',
  'the full 14-week schedule cannot be rewritten'
);

select * from finish();
rollback;
