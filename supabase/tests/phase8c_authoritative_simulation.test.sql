begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table(
  'private', 'simulation_fixture_manifests',
  'the reviewed Simulation adapter manifest is stored privately'
);
select has_trigger(
  'private', 'simulation_fixture_manifests',
  'simulation_fixture_manifests_append_only',
  'the fixture manifest is immutable'
);
select table_privs_are(
  'private', 'simulation_fixture_manifests', 'authenticated', array[]::text[],
  'participants cannot read or mutate the private fixture manifest'
);
select table_privs_are(
  'private', 'simulation_fixture_manifests', 'anon', array[]::text[],
  'anonymous callers cannot read the private fixture manifest'
);
select is(
  (select week_count from private.simulation_fixture_manifests
   where pack_id = 'sunday-ledger-authoritative-2026-v1'),
  18,
  'the canonical fixture pack contains 18 weeks'
);
select is(
  (select jsonb_array_length(manifest_json -> 'weeks')
   from private.simulation_fixture_manifests
   where pack_id = 'sunday-ledger-authoritative-2026-v1'),
  18,
  'all canonical fixture weeks are persisted under the reviewed hash'
);
select matches(
  (select manifest_hash from private.simulation_fixture_manifests
   where pack_id = 'sunday-ledger-authoritative-2026-v1'),
  '^[0-9a-f]{64}$',
  'the canonical manifest has a deterministic SHA-256 hash'
);

select has_function(
  'api', 'publish_simulation_fixture_week',
  array['uuid', 'integer', 'text', 'text'],
  'the narrow fixture publication command is exposed'
);
select has_function(
  'api', 'apply_simulation_fixture_results',
  array['uuid', 'integer', 'text', 'text', 'text'],
  'the narrow scripted result command is exposed'
);
select has_function(
  'api', 'advance_simulated_time',
  array['uuid', 'timestamp with time zone', 'text'],
  'the monotonic Simulation clock command is exposed'
);
select function_privs_are(
  'api', 'publish_simulation_fixture_week',
  array['uuid', 'integer', 'text', 'text'],
  'anon', array[]::text[], 'anonymous fixture publication is denied'
);
select function_privs_are(
  'api', 'publish_simulation_fixture_week',
  array['uuid', 'integer', 'text', 'text'],
  'authenticated', array['EXECUTE'],
  'authenticated callers reach only the self-authorizing fixture command'
);
select function_privs_are(
  'api', 'apply_simulation_fixture_results',
  array['uuid', 'integer', 'text', 'text', 'text'],
  'anon', array[]::text[], 'anonymous scripted result import is denied'
);
select function_privs_are(
  'api', 'advance_simulated_time',
  array['uuid', 'timestamp with time zone', 'text'],
  'anon', array[]::text[], 'anonymous time advancement is denied'
);

select function_privs_are(
  'api', 'publish_simulation_season_archive', array['uuid', 'jsonb', 'text'],
  'authenticated', array[]::text[],
  'retired caller-authored Simulation archive publication remains denied'
);
select function_privs_are(
  'api', 'get_simulation_season_archive', array['text'],
  'authenticated', array[]::text[],
  'retired Simulation archive reads remain denied'
);
select table_privs_are(
  'private', 'simulation_season_archives', 'authenticated', array[]::text[],
  'frozen legacy archive storage remains hidden and immutable'
);

insert into auth.users (id, email)
values
  ('8c000000-0000-4000-8000-000000000001', 'phase8c-commissioner@example.test'),
  ('8c000000-0000-4000-8000-000000000002', 'phase8c-member-2@example.test'),
  ('8c000000-0000-4000-8000-000000000003', 'phase8c-member-3@example.test'),
  ('8c000000-0000-4000-8000-000000000004', 'phase8c-member-4@example.test');

select set_config(
  'request.jwt.claims',
  '{"sub":"8c000000-0000-4000-8000-000000000001","role":"authenticated","email":"phase8c-commissioner@example.test"}',
  true
);
select lives_ok(
  $$select api.create_league(
    'Phase 8C Simulation', 'phase-8c-simulation', 'SIMULATION', 2026
  )$$,
  'a commissioner can explicitly create an authoritative Simulation league'
);
select lives_ok(
  $$select api.create_league(
    'Phase 8C Live Isolation', 'phase-8c-live-isolation', 'LIVE', 2026
  )$$,
  'the same commissioner can retain an isolated Live league'
);

insert into private.profiles (id, display_name)
values
  ('8c000000-0000-4000-8000-000000000002', 'Phase 8C Member 2'),
  ('8c000000-0000-4000-8000-000000000003', 'Phase 8C Member 3'),
  ('8c000000-0000-4000-8000-000000000004', 'Phase 8C Member 4');

insert into private.league_memberships (league_id, user_id, role)
select league.id, member.user_id, 'MEMBER'
from private.leagues as league
cross join (values
  ('8c000000-0000-4000-8000-000000000002'::uuid),
  ('8c000000-0000-4000-8000-000000000003'::uuid),
  ('8c000000-0000-4000-8000-000000000004'::uuid)
) as member(user_id)
where league.slug = 'phase-8c-simulation';

insert into private.season_entries (
  season_id, league_id, user_id, standing_tiebreak
)
select season.id, season.league_id, membership.user_id,
  encode(extensions.digest(season.id::text || membership.user_id::text, 'sha256'), 'hex')
from private.seasons as season
join private.leagues as league on league.id = season.league_id
join private.league_memberships as membership
  on membership.league_id = season.league_id
where league.slug = 'phase-8c-simulation'
  and membership.role = 'MEMBER';

update private.seasons
set simulated_now = '2026-09-01 00:00:00+00'
where league_id = (select id from private.leagues where slug = 'phase-8c-simulation');

select is(
  (select count(*) from private.event_result_versions as result
   join private.sports_events as event on event.id = result.event_id
   join private.leagues as league on league.id = event.league_id
   where league.slug = 'phase-8c-simulation'),
  0::bigint,
  'the new Simulation starts without caller-authored results'
);
select lives_ok(
  $$select api.advance_simulated_time(
    (select id from private.leagues where slug = 'phase-8c-simulation'),
    '2026-09-13 16:00:00+00', 'phase8c-advance-week1'
  )$$,
  'the commissioner can advance the monotonic Simulation clock'
);
select is(
  (select count(*) from private.sports_events as event
   join private.leagues as league on league.id = event.league_id
   where league.slug = 'phase-8c-simulation'),
  0::bigint,
  'clock advancement alone creates no event or slate fact'
);
select is(
  (select count(*) from private.standings_snapshots as standing
   join private.leagues as league on league.id = standing.league_id
   where league.slug = 'phase-8c-simulation'),
  0::bigint,
  'clock advancement alone creates no standing, bracket, or archive fact'
);
select throws_ok(
  $$select api.advance_simulated_time(
    (select id from private.leagues where slug = 'phase-8c-simulation'),
    '2026-09-13 15:59:00+00', 'phase8c-backward-clock'
  )$$,
  'Simulation time is monotonic.',
  'backward Simulation time is rejected'
);

select lives_ok(
  $$select api.publish_simulation_fixture_week(
    (select id from private.leagues where slug = 'phase-8c-simulation'),
    1, 'sunday-ledger-authoritative-2026-v1', 'phase8c-publish-week1'
  )$$,
  'the reviewed Week 1 fixture publishes through the shared slate authority'
);
select is(
  (select count(*) from private.sports_events as event
   join private.leagues as league on league.id = event.league_id
   where league.slug = 'phase-8c-simulation'),
  8::bigint,
  'the ordinary sports_events relation stores all eight Simulation events'
);
select is(
  (select count(*) from private.market_snapshots as snapshot
   join private.leagues as league on league.id = snapshot.league_id
   where league.slug = 'phase-8c-simulation'),
  48::bigint,
  'the ordinary market_snapshots relation stores six DraftKings-shaped observations per event'
);
select is(
  (select count(*) from private.live_odds_imports as odds_import
   join private.leagues as league on league.id = odds_import.league_id
   where league.slug = 'phase-8c-simulation'
     and odds_import.source = 'SIMULATION_FIXTURE'),
  1::bigint,
  'the generalized provider import relation retains Simulation provenance'
);

select throws_ok(
  $$insert into private.live_odds_imports (
    season_id, league_id, source, sport_key, fetched_at, normalized_json,
    payload_hash, event_count, imported_by
  ) select season.id, season.league_id, 'THE_ODDS_API',
    'americanfootball_nfl', now(), '{"events":[]}'::jsonb, repeat('a', 64),
    1, '8c000000-0000-4000-8000-000000000001'::uuid
    from private.seasons as season
    join private.leagues as league on league.id = season.league_id
    where league.slug = 'phase-8c-simulation'$$,
  'Provider source does not match the frozen season mode.',
  'a Simulation season cannot consume a Live import'
);
select throws_ok(
  $$insert into private.live_odds_imports (
    season_id, league_id, source, sport_key, fetched_at, normalized_json,
    payload_hash, event_count, imported_by
  ) select season.id, season.league_id, 'SIMULATION_FIXTURE',
    'americanfootball_nfl', now(), '{"events":[]}'::jsonb, repeat('b', 64),
    1, '8c000000-0000-4000-8000-000000000001'::uuid
    from private.seasons as season
    join private.leagues as league on league.id = season.league_id
    where league.slug = 'phase-8c-live-isolation'$$,
  'Provider source does not match the frozen season mode.',
  'a Live season cannot consume a Simulation fixture'
);

select lives_ok(
  $$select api.lock_live_roster_and_open_week(
    (select id from private.leagues where slug = 'phase-8c-simulation'),
    'phase8c-lock-roster-week1'
  )$$,
  'the shared roster authority freezes the Simulation rules and 14-week schedule'
);
select is(
  (select count(*) from private.schedule_publications as publication
   join private.leagues as league on league.id = publication.league_id
   where league.slug = 'phase-8c-simulation'),
  1::bigint,
  'one immutable normal schedule publication is stored'
);
select is(
  (select count(*) from private.matchups as matchup
   join private.leagues as league on league.id = matchup.league_id
   where league.slug = 'phase-8c-simulation' and matchup.scope = 'REGULAR'),
  28::bigint,
  'the four-member target has one matchup per member for all 14 regular weeks'
);
select is(
  (select count(*) from private.weekly_cards as card
   join private.leagues as league on league.id = card.league_id
   where league.slug = 'phase-8c-simulation'),
  4::bigint,
  'the ordinary weekly_cards relation grants one Week 1 card per member'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"8c000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  $$select api.advance_simulated_time(
    (select id from private.leagues where slug = 'phase-8c-simulation'),
    '2026-09-13 16:01:00+00', 'phase8c-member-clock'
  )$$,
  'Commissioner membership required.',
  'a participant cannot advance Simulation time'
);
select throws_ok(
  $$select api.get_stage1_state('phase-8c-live-isolation')$$,
  'League membership required.',
  'membership in one mode grants no access to a different league'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"8c000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select is(
  api.get_stage1_state('phase-8c-simulation') #>> '{league,mode}',
  'SIMULATION',
  'the participant read DTO reports the frozen Simulation mode'
);
select ok(
  not (api.get_stage1_state('phase-8c-simulation')::text ~ 'simulation_fixture_manifests'),
  'participant DTOs do not reveal the private fixture manifest'
);

select * from finish();
rollback;
