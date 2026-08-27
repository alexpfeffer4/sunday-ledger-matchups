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
select has_function(
  'api',
  'publish_live_week_slate',
  array['uuid', 'uuid', 'text[]', 'text'],
  'the guarded live slate publication command is exposed'
);
select has_table('private', 'live_quote_heads', 'current live quotes have explicit heads');
select has_index(
  'private',
  'live_quote_heads',
  'live_quote_heads_week_id_idx',
  'current quote reads have a week index'
);
select has_index(
  'private',
  'live_quote_heads',
  'live_quote_heads_event_week_league_fk_idx',
  'the event ownership foreign key has a covering index'
);
select has_function(
  'api',
  'refresh_live_week_quotes',
  array['uuid', 'uuid', 'text'],
  'the guarded quote refresh command is exposed'
);
select has_function(
  'api',
  'get_live_quote_heads',
  array['text'],
  'the member current-quote read model is exposed'
);
select has_trigger(
  'private',
  'position_receipts',
  'position_receipts_enforce_live_current_quote',
  'Live receipts enforce the current quote head'
);
select has_trigger(
  'private',
  'slate_items',
  'slate_items_set_initial_live_quote_head',
  'new Live slate observations initialize quote heads'
);
select policies_are(
  'private',
  'live_odds_imports',
  array['live_odds_imports_select_commissioner'],
  'imports have only the commissioner read policy'
);
select policies_are(
  'private',
  'live_quote_heads',
  array['live_quote_heads_no_direct_access'],
  'quote pointers have an explicit deny policy'
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
select function_privs_are(
  'api',
  'publish_live_week_slate',
  array['uuid', 'uuid', 'text[]', 'text'],
  'anon',
  array[]::text[],
  'anonymous callers cannot publish a live slate'
);
select function_privs_are(
  'api',
  'publish_live_week_slate',
  array['uuid', 'uuid', 'text[]', 'text'],
  'authenticated',
  array['EXECUTE'],
  'authenticated callers can invoke the guarded publication command'
);
select function_privs_are(
  'api',
  'refresh_live_week_quotes',
  array['uuid', 'uuid', 'text'],
  'anon',
  array[]::text[],
  'anonymous callers cannot refresh live quotes'
);
select function_privs_are(
  'api',
  'refresh_live_week_quotes',
  array['uuid', 'uuid', 'text'],
  'authenticated',
  array['EXECUTE'],
  'authenticated callers can invoke the guarded refresh command'
);
select table_privs_are(
  'private',
  'live_quote_heads',
  'authenticated',
  array[]::text[],
  'participants cannot access quote pointers directly'
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

insert into private.season_entries (
  id,
  season_id,
  league_id,
  user_id,
  standing_tiebreak
)
values
  (
    '65000000-0000-4000-8000-000000000001',
    '64000000-0000-4000-8000-000000000001',
    '62000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001',
    repeat('1', 64)
  ),
  (
    '65000000-0000-4000-8000-000000000002',
    '64000000-0000-4000-8000-000000000001',
    '62000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000002',
    repeat('2', 64)
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
  (
    select count(*) from private.live_odds_imports
    where season_id = '64000000-0000-4000-8000-000000000001'
  ),
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
  (
    select count(*) from private.live_odds_imports
    where season_id = '64000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'idempotent replay does not duplicate an import'
);
select throws_ok(
  $$select api.publish_live_week_slate(
    '62000000-0000-4000-8000-000000000001',
    (
      select id from private.live_odds_imports
      where season_id = '64000000-0000-4000-8000-000000000001'
      limit 1
    ),
    array['unknown-provider-event'],
    'publish-invalid-event'
  )$$,
  '22023',
  'Every selected event must belong to the reviewed import.',
  'publication rejects an event outside the reviewed import'
);
select is(
  (
    select count(*) from private.season_weeks
    where season_id = '64000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'a rejected publication creates no week'
);
select lives_ok(
  $$select api.publish_live_week_slate(
    '62000000-0000-4000-8000-000000000001',
    (
      select id from private.live_odds_imports
      where season_id = '64000000-0000-4000-8000-000000000001'
      limit 1
    ),
    array['provider-event-buf-nyj'],
    'publish-stage3-live-slate'
  )$$,
  'the commissioner can publish selected imported events'
);
select is(
  (
    select state from private.season_weeks
    where season_id = '64000000-0000-4000-8000-000000000001'
    limit 1
  ),
  'PLANNED',
  'slate publication leaves the week planned'
);
select is(
  (select lifecycle from private.seasons where id = '64000000-0000-4000-8000-000000000001'),
  'DRAFT',
  'slate publication does not lock the roster'
);
select is(
  (
    select count(*) from private.sports_events
    where league_id = '62000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'the selected event is published once'
);
select is(
  (
    select count(*) from private.market_snapshots
    where league_id = '62000000-0000-4000-8000-000000000001'
  ),
  6::bigint,
  'the complete main-market snapshot set is published'
);
select is(
  (
    select count(*) from private.slate_items
    where league_id = '62000000-0000-4000-8000-000000000001'
  ),
  6::bigint,
  'all six market outcomes belong to the slate'
);
select is(
  (
    select count(*) from private.live_quote_heads
    where league_id = '62000000-0000-4000-8000-000000000001'
  ),
  6::bigint,
  'publication snapshots are backfilled as the current quote heads'
);
select is(
  jsonb_array_length(
    api.get_live_quote_heads('stage3-live-import-test') -> 0 -> 'markets'
  ),
  6,
  'members receive one current observation for each main-market outcome'
);
select lives_ok(
  $$select api.store_live_odds_import(
    '62000000-0000-4000-8000-000000000001',
    jsonb_set(
      pg_temp.stage3_live_import(),
      '{events,0,markets,0,americanOdds}',
      '-170'::jsonb
    ),
    'store-stage3-live-refresh'
  )$$,
  'the commissioner can store a fresh observation set'
);
select lives_ok(
  $$select api.refresh_live_week_quotes(
    '62000000-0000-4000-8000-000000000001',
    (
      select id from private.live_odds_imports
      where season_id = '64000000-0000-4000-8000-000000000001'
      order by created_at desc, id desc
      limit 1
    ),
    'refresh-stage3-live-quotes'
  )$$,
  'the commissioner can refresh only the published event set'
);
select is(
  (
    select count(*) from private.market_snapshots
    where league_id = '62000000-0000-4000-8000-000000000001'
  ),
  7::bigint,
  'refresh appends only the changed immutable observation'
);
select is(
  (
    select count(*) from private.slate_items
    where league_id = '62000000-0000-4000-8000-000000000001'
  ),
  7::bigint,
  'the changed observation is appended to the immutable slate ledger'
);
select is(
  (
    select count(*) from private.live_quote_heads
    where league_id = '62000000-0000-4000-8000-000000000001'
  ),
  6::bigint,
  'refresh moves pointers without duplicating current outcomes'
);
select is(
  (
    select (market ->> 'americanOdds')::integer
    from jsonb_array_elements(
      api.get_live_quote_heads('stage3-live-import-test') -> 0 -> 'markets'
    ) as market
    where market ->> 'marketType' = 'MONEYLINE'
      and market ->> 'outcomeKey' = 'AWAY'
  ),
  -170,
  'the current read model returns the refreshed price'
);
select lives_ok(
  $$select api.refresh_live_week_quotes(
    '62000000-0000-4000-8000-000000000001',
    (
      select id from private.live_odds_imports
      where season_id = '64000000-0000-4000-8000-000000000001'
      order by created_at desc, id desc
      limit 1
    ),
    'refresh-stage3-live-quotes'
  )$$,
  'the exact quote refresh replays idempotently'
);
select is(
  (
    select count(*) from private.market_snapshots
    where league_id = '62000000-0000-4000-8000-000000000001'
  ),
  7::bigint,
  'idempotent refresh does not append observations again'
);
select is(
  (
    select count(*) from private.weekly_cards
    where league_id = '62000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'publishing eligibility does not open cards or grant credits'
);
select is(
  (
    select count(*) from private.schedule_publications
    where season_id = '64000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'publishing eligibility does not publish a competitive schedule'
);
select is(
  (
    select common_lock_at = '2026-09-13T16:55:00.000Z'::timestamptz
    from private.season_weeks
    where season_id = '64000000-0000-4000-8000-000000000001'
    limit 1
  ),
  true,
  'common lock is five minutes before the first selected event'
);
select is(
  jsonb_array_length(api.get_stage1_state('stage3-live-import-test') -> 'slate'),
  1,
  'the member-scoped read model projects the published slate'
);
select lives_ok(
  $$select api.publish_live_week_slate(
    '62000000-0000-4000-8000-000000000001',
    (
      select id from private.live_odds_imports
      where season_id = '64000000-0000-4000-8000-000000000001'
      limit 1
    ),
    array['provider-event-buf-nyj'],
    'publish-stage3-live-slate'
  )$$,
  'the exact publication command replays idempotently'
);
select is(
  (
    select count(*) from private.season_weeks
    where season_id = '64000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'idempotent replay does not duplicate the week'
);
select throws_ok(
  $$select api.publish_live_week_slate(
    '62000000-0000-4000-8000-000000000001',
    (
      select id from private.live_odds_imports
      where season_id = '64000000-0000-4000-8000-000000000001'
      limit 1
    ),
    array['provider-event-buf-nyj'],
    'publish-stage3-live-slate-again'
  )$$,
  '55000',
  'A weekly slate is already published for this season.',
  'a second publication command cannot replace the slate'
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
    set normalized_json = normalized_json || '{"tampered":true}'::jsonb
    where season_id = '64000000-0000-4000-8000-000000000001'$$,
  '55000',
  'live_odds_imports is append-only.',
  'stored imports cannot be rewritten'
);

set local role authenticated;
select is(
  (
    select count(*) from private.live_odds_imports
    where season_id = '64000000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'RLS exposes the import history to the signed-in commissioner'
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
select throws_ok(
  $$select api.publish_live_week_slate(
    '62000000-0000-4000-8000-000000000001',
    (
      select id from private.live_odds_imports
      where season_id = '64000000-0000-4000-8000-000000000001'
      limit 1
    ),
    array['provider-event-buf-nyj'],
    'member-publish-live-slate'
  )$$,
  '42501',
  'Commissioner membership required.',
  'a regular member cannot publish a live slate'
);
set local role authenticated;
select is(
  (
    select count(*) from private.live_odds_imports
    where season_id = '64000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'RLS hides private import rows from regular members'
);
reset role;

select * from finish();
rollback;
