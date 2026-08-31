begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table(
  'private',
  'simulation_season_archives',
  'full-season Simulation archives are stored'
);
select has_function(
  'api',
  'publish_simulation_season_archive',
  array['uuid', 'jsonb', 'text'],
  'the retired publication definition remains for frozen-history compatibility'
);
select has_function(
  'api',
  'get_simulation_season_archive',
  array['text'],
  'the retired legacy read definition remains for frozen-history compatibility'
);
select policies_are(
  'private',
  'simulation_season_archives',
  array['simulation_season_archives_select_member'],
  'the archive has only the league-member read policy'
);
select table_privs_are(
  'private',
  'simulation_season_archives',
  'authenticated',
  array[]::text[],
  'legacy archives have no participant table access'
);
select function_privs_are(
  'api',
  'publish_simulation_season_archive',
  array['uuid', 'jsonb', 'text'],
  'anon',
  array[]::text[],
  'anonymous callers cannot publish an archive'
);
select function_privs_are(
  'api',
  'publish_simulation_season_archive',
  array['uuid', 'jsonb', 'text'],
  'authenticated',
  array[]::text[],
  'authenticated callers cannot invoke the retired publication command'
);
select function_privs_are(
  'api',
  'get_simulation_season_archive',
  array['text'],
  'authenticated',
  array[]::text[],
  'authenticated callers cannot invoke the retired legacy read model'
);

insert into auth.users (id, email)
select
  ('51000000-0000-4000-8000-' || lpad(member_number::text, 12, '0'))::uuid,
  format('stage2-member-%s@example.test', member_number)
from generate_series(1, 5) as member_number;

insert into private.profiles (id, display_name)
select
  ('51000000-0000-4000-8000-' || lpad(member_number::text, 12, '0'))::uuid,
  format('Stage 2 Member %s', member_number)
from generate_series(1, 5) as member_number;

insert into private.leagues (id, name, slug, created_by)
values (
  '52000000-0000-4000-8000-000000000001',
  'Stage 2 Database Test',
  'stage2-database-test',
  '51000000-0000-4000-8000-000000000001'
);

insert into private.league_memberships (league_id, user_id, role)
select
  '52000000-0000-4000-8000-000000000001',
  ('51000000-0000-4000-8000-' || lpad(member_number::text, 12, '0'))::uuid,
  case when member_number = 1 then 'COMMISSIONER' else 'MEMBER' end
from generate_series(1, 4) as member_number;

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
  '53000000-0000-4000-8000-000000000001',
  authoritative.ruleset_id,
  authoritative.ruleset_version,
  authoritative.product_bible_id,
  authoritative.product_bible_version,
  authoritative.mode,
  authoritative.canonical_json,
  authoritative.sha256_hash
from private.authoritative_season_rulesets as authoritative
where authoritative.mode = 'SIMULATION';

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
  '54000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000001',
  '53000000-0000-4000-8000-000000000001',
  'SIMULATION',
  2026,
  repeat('b', 64),
  repeat('c', 64),
  '2026-09-01T10:00:00Z'
);

insert into private.season_entries (
  id,
  season_id,
  league_id,
  user_id,
  standing_tiebreak
)
select
  ('55000000-0000-4000-8000-' || lpad(member_number::text, 12, '0'))::uuid,
  '54000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000001',
  ('51000000-0000-4000-8000-' || lpad(member_number::text, 12, '0'))::uuid,
  lpad(member_number::text, 64, '0')
from generate_series(1, 4) as member_number;

create or replace function pg_temp.stage2_archive()
returns jsonb
language sql
stable
as $$
  with members as (
    select jsonb_agg(
      jsonb_build_object(
        'entryId', ('55000000-0000-4000-8000-' || lpad(member_number::text, 12, '0'))::uuid,
        'displayName', format('Stage 2 Member %s', member_number),
        'initials', format('M%s', member_number),
        'deterministicTiebreak', lpad(member_number::text, 64, '0')
      ) order by member_number
    ) as value
    from generate_series(1, 4) as member_number
  ), week_matchups as (
    select
      week_number,
      jsonb_build_array(
        jsonb_build_object(
          'id', format('week-%s-game-1', week_number),
          'week', week_number,
          'scope', 'REGULAR',
          'label', format('Week %s', week_number),
          'sideAEntryId', '55000000-0000-4000-8000-000000000001',
          'sideBEntryId', '55000000-0000-4000-8000-000000000002'
        ),
        jsonb_build_object(
          'id', format('week-%s-game-2', week_number),
          'week', week_number,
          'scope', 'REGULAR',
          'label', format('Week %s', week_number),
          'sideAEntryId', '55000000-0000-4000-8000-000000000003',
          'sideBEntryId', '55000000-0000-4000-8000-000000000004'
        )
      ) as matchups
    from generate_series(1, 14) as week_number
  ), weeks as (
    select jsonb_agg(
      jsonb_build_object(
        'week', week_number,
        'matchups', matchups,
        'standings', '[]'::jsonb
      ) order by week_number
    ) as value
    from week_matchups
  ), schedule_matchups as (
    select jsonb_agg(matchup order by week_number, matchup ->> 'id') as value
    from week_matchups
    cross join lateral jsonb_array_elements(matchups) as matchup
  ), final_standings as (
    select jsonb_agg(
      jsonb_build_object(
        'seed', member_number,
        'entryId', ('55000000-0000-4000-8000-' || lpad(member_number::text, 12, '0'))::uuid
      ) order by member_number
    ) as value
    from generate_series(1, 4) as member_number
  )
  select jsonb_build_object(
    'schemaVersion', 1,
    'mode', 'SIMULATION',
    'seasonLabel', '2026 Full-Season Simulation',
    'nflYear', 2026,
    'members', members.value,
    'ruleset', jsonb_build_object(
      'id', 'SUNDAY-LEDGER-SIMULATION-SEASON-RULESET-V1',
      'version', '1.1'
    ),
    'schedule', jsonb_build_object(
      'algorithmVersion', 'circle-v1',
      'outputHash', repeat('d', 64),
      'matchups', schedule_matchups.value
    ),
    'regularSeason', jsonb_build_object(
      'weeks', weeks.value,
      'finalStandings', final_standings.value
    ),
    'playoffs', jsonb_build_object(
      'championEntryId', '55000000-0000-4000-8000-000000000001'
    )
  )
  from members, weeks, schedule_matchups, final_standings;
$$;

update private.season_ruleset_snapshots
set frozen_at = '2026-08-27T20:36:04Z'
where id = '53000000-0000-4000-8000-000000000001';

update private.seasons
set
  lifecycle = 'FINAL',
  roster_locked_at = '2026-08-27T20:36:04Z'
where id = '54000000-0000-4000-8000-000000000001';

insert into private.simulation_season_archives (
  id,
  season_id,
  league_id,
  ruleset_snapshot_id,
  roster_size,
  schedule_output_hash,
  archive_hash,
  archive_json,
  champion_entry_id,
  published_by,
  published_at
) values (
  '56000000-0000-4000-8000-000000000001',
  '54000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000001',
  '53000000-0000-4000-8000-000000000001',
  4,
  repeat('d', 64),
  repeat('e', 64),
  pg_temp.stage2_archive(),
  '55000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  '2026-08-27T20:36:04Z'
);

select is(
  (select count(*) from private.simulation_season_archives),
  1::bigint,
  'exactly one immutable archive is stored'
);
select is(
  (
    select roster_size
    from private.simulation_season_archives
    where season_id = '54000000-0000-4000-8000-000000000001'
  ),
  4,
  'the frozen archive records the supported roster size'
);
select is(
  (
    select lifecycle
    from private.seasons
    where id = '54000000-0000-4000-8000-000000000001'
  ),
  'FINAL',
  'the existing frozen season remains final'
);
select ok(
  (
    select frozen_at is not null
    from private.season_ruleset_snapshots
    where id = '53000000-0000-4000-8000-000000000001'
  ),
  'the existing frozen ruleset remains frozen'
);

select throws_ok(
  $$update private.simulation_season_archives
    set archive_json = archive_json || '{"tampered":true}'::jsonb$$,
  '55000',
  'simulation_season_archives is append-only.',
  'the archive cannot be rewritten'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"51000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  $$select api.publish_simulation_season_archive(
    '52000000-0000-4000-8000-000000000001',
    '{}'::jsonb,
    'arbitrary-authenticated-publication'
  )$$,
  '42501',
  'permission denied for function publish_simulation_season_archive',
  'direct authenticated arbitrary publication fails'
);
select throws_ok(
  $$select api.get_simulation_season_archive('stage2-database-test')$$,
  '42501',
  'permission denied for function get_simulation_season_archive',
  'direct authenticated legacy archive reads fail'
);
select is(
  api.get_season_archive('stage2-database-test'),
  null::jsonb,
  'the unified trusted archive read model hides legacy Simulation output'
);
reset role;

select is(
  (
    select archive_hash
    from private.simulation_season_archives
    where id = '56000000-0000-4000-8000-000000000001'
  ),
  repeat('e', 64),
  'containment leaves the existing frozen archive unchanged'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"51000000-0000-4000-8000-000000000005","role":"authenticated"}',
  true
);
select throws_ok(
  $$select api.get_season_archive('stage2-database-test')$$,
  '42501',
  'League membership required.',
  'a nonmember still cannot query another league archive'
);

select * from finish();
rollback;
