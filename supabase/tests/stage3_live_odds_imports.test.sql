begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('private', 'live_odds_imports', 'live odds imports are stored');
select has_index(
  'private',
  'live_odds_imports',
  'live_odds_imports_league_created_idx',
  'league import history has a read index'
);
select has_index(
  'private',
  'live_odds_imports',
  'live_odds_imports_imported_by_idx',
  'the importer membership foreign key is indexed'
);
select has_index(
  'private',
  'live_odds_imports',
  'live_odds_imports_season_league_idx',
  'the season and league foreign key is indexed'
);
select has_function(
  'api',
  'store_live_odds_import',
  array['uuid', 'jsonb', 'text'],
  'the guarded import command is exposed'
);
select has_function(
  'api',
  'get_live_odds_import',
  array['text'],
  'the commissioner review read model is exposed'
);
select policies_are(
  'private',
  'live_odds_imports',
  array['live_odds_imports_select_commissioner'],
  'imports have only the commissioner read policy'
);
select table_privs_are(
  'private',
  'live_odds_imports',
  'authenticated',
  array['SELECT'],
  'authenticated callers cannot mutate imports directly'
);
select function_privs_are(
  'api',
  'store_live_odds_import',
  array['uuid', 'jsonb', 'text'],
  'anon',
  array[]::text[],
  'anonymous callers cannot store imports'
);
select function_privs_are(
  'api',
  'store_live_odds_import',
  array['uuid', 'jsonb', 'text'],
  'authenticated',
  array['EXECUTE'],
  'authenticated callers can invoke the guarded import command'
);

create or replace function pg_temp.stage3_live_import()
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
        'externalEventId', 'provider-event-buf-nyj',
        'sportKey', 'americanfootball_nfl',
        'awayTeam', 'Buffalo Bills',
        'homeTeam', 'New York Jets',
        'scheduledStartAt', '2026-09-13T17:00:00.000Z',
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
  ('61000000-0000-4000-8000-000000000001', 'stage3-commissioner@example.test'),
  ('61000000-0000-4000-8000-000000000002', 'stage3-member@example.test');

insert into private.profiles (id, display_name)
values
  ('61000000-0000-4000-8000-000000000001', 'Stage 3 Commissioner'),
  ('61000000-0000-4000-8000-000000000002', 'Stage 3 Member');

insert into private.leagues (id, name, slug, created_by)
values (
  '62000000-0000-4000-8000-000000000001',
  'Stage 3 Live Import Test',
  'stage3-live-import-test',
  '61000000-0000-4000-8000-000000000001'
);

insert into private.league_memberships (league_id, user_id, role)
values
  (
    '62000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001',
    'COMMISSIONER'
  ),
  (
    '62000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000002',
    'MEMBER'
  );

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
  '63000000-0000-4000-8000-000000000001',
  'live-season-1',
  '1.0',
  'sunday-ledger-product-bible',
  '3.0',
  'LIVE',
  '{"mode":"LIVE"}',
  repeat('d', 64)
);

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
  '64000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000001',
  'LIVE',
  2026,
  repeat('e', 64),
  repeat('f', 64)
);

select set_config(
  'request.jwt.claims',
  '{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$select api.store_live_odds_import(
    '62000000-0000-4000-8000-000000000001',
    pg_temp.stage3_live_import(),
    'store-stage3-live-import'
  )$$,
  'the commissioner can store a normalized live import'
);
select is(
  (select count(*) from private.live_odds_imports),
  1::bigint,
  'one append-only import is stored'
);
select is(
  api.get_live_odds_import('stage3-live-import-test') ->> 'eventCount',
  '1',
  'the commissioner review model reports the event count'
);
select is(
  jsonb_array_length(
    api.get_live_odds_import('stage3-live-import-test') -> 'events' -> 0 -> 'markets'
  ),
  6,
  'the review model returns the complete six-outcome main-market set'
);
select lives_ok(
  $$select api.store_live_odds_import(
    '62000000-0000-4000-8000-000000000001',
    pg_temp.stage3_live_import(),
    'store-stage3-live-import'
  )$$,
  'the exact import command replays idempotently'
);
select is(
  (select count(*) from private.live_odds_imports),
  1::bigint,
  'idempotent replay does not duplicate an import'
);
select throws_ok(
  $$select api.store_live_odds_import(
    '62000000-0000-4000-8000-000000000001',
    jsonb_set(pg_temp.stage3_live_import(), '{events,0,markets}', '[]'::jsonb),
    'invalid-stage3-live-import'
  )$$,
  '22023',
  'A provider event is invalid or incomplete.',
  'an incomplete main-market payload fails closed'
);
select throws_ok(
  $$update private.live_odds_imports
    set normalized_json = normalized_json || '{"tampered":true}'::jsonb$$,
  '55000',
  'live_odds_imports is append-only.',
  'stored imports cannot be rewritten'
);

set local role authenticated;
select is(
  (select count(*) from private.live_odds_imports),
  1::bigint,
  'RLS exposes the import to the signed-in commissioner'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"61000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  $$select api.get_live_odds_import('stage3-live-import-test')$$,
  '42501',
  'Commissioner membership required.',
  'a regular member cannot read the private import review'
);
select throws_ok(
  $$select api.store_live_odds_import(
    '62000000-0000-4000-8000-000000000001',
    pg_temp.stage3_live_import(),
    'member-stage3-live-import'
  )$$,
  '42501',
  'Commissioner membership required.',
  'a regular member cannot store an import'
);
set local role authenticated;
select is(
  (select count(*) from private.live_odds_imports),
  0::bigint,
  'RLS hides private import rows from regular members'
);
reset role;

select * from finish();
rollback;
