begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table(
  'private',
  'authoritative_season_rulesets',
  'the trusted boundary owns a finite Ruleset allowlist'
);
select table_privs_are(
  'private',
  'authoritative_season_rulesets',
  'authenticated',
  array[]::text[],
  'members cannot read or edit the internal allowlist directly'
);
select has_function(
  'api',
  'create_league',
  array[
    'text', 'text', 'text', 'integer', 'text',
    'text', 'text', 'text', 'jsonb', 'text'
  ],
  'one compatibility signature fronts trusted league creation'
);
select hasnt_function(
  'api',
  'create_league',
  array['text', 'text', 'text', 'integer'],
  'the exposed API has no unsupported create_league overload'
);
select has_function(
  'private',
  'create_league_from_authoritative_ruleset',
  array['text', 'text', 'text', 'integer'],
  'the trusted four-argument implementation is private'
);
select function_privs_are(
  'private',
  'create_league_from_authoritative_ruleset',
  array['text', 'text', 'text', 'integer'],
  'authenticated',
  array[]::text[],
  'members cannot call the trusted implementation directly'
);
select is(
  (
    select procedure.pronargdefaults
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'api'
      and procedure.proname = 'create_league'
  ),
  6::smallint,
  'legacy Ruleset fields are optional compatibility inputs'
);
select function_privs_are(
  'api',
  'create_league',
  array[
    'text', 'text', 'text', 'integer', 'text',
    'text', 'text', 'text', 'jsonb', 'text'
  ],
  'authenticated',
  array['EXECUTE'],
  'authenticated members can use trusted league creation'
);
select function_privs_are(
  'api',
  'create_league',
  array[
    'text', 'text', 'text', 'integer', 'text',
    'text', 'text', 'text', 'jsonb', 'text'
  ],
  'anon',
  array[]::text[],
  'anonymous callers cannot create a league'
);
select has_function(
  'api',
  'get_season_ruleset',
  array['text'],
  'the member Ruleset read model is exposed'
);
select function_privs_are(
  'api',
  'get_season_ruleset',
  array['text'],
  'authenticated',
  array['EXECUTE'],
  'authenticated members can request their persisted snapshot'
);
select function_privs_are(
  'api',
  'get_season_ruleset',
  array['text'],
  'anon',
  array[]::text[],
  'anonymous callers cannot read a season snapshot'
);

select is(
  (select count(*) from private.authoritative_season_rulesets),
  2::bigint,
  'the allowlist has one Live and one Simulation identity'
);
select is(
  (
    select sha256_hash
    from private.authoritative_season_rulesets
    where mode = 'LIVE'
  ),
  '047550e7661915d3ba4d8e4046f85ab9474eac7b857fbba398cb4d9b91a5766c',
  'the Live allowlist digest matches the compiled V1.1 Ruleset'
);
select is(
  (
    select sha256_hash
    from private.authoritative_season_rulesets
    where mode = 'SIMULATION'
  ),
  '64772aad744ed8d5ec12b9e43e1303a610fc92051c250204bffb20c00f5e7a7d',
  'the Simulation allowlist digest matches the compiled V1.1 Ruleset'
);

select is(
  private.head_to_head_group_is_balanced(4, array[2, 2, 2, 2, 2, 2]),
  true,
  'equal positive counts for all six unordered pairs form a mini-table'
);
select is(
  private.head_to_head_group_is_balanced(4, array[2, 2, 1, 1, 2, 2]),
  false,
  'equal member totals cannot hide unequal unordered-pair counts'
);
select is(
  private.head_to_head_group_is_balanced(4, array[2, 2, 2, 2, 2]),
  false,
  'a missing unordered pair prevents the mini-table'
);
select is(
  private.head_to_head_group_is_balanced(2, array[0]),
  false,
  'a zero-meeting pair prevents the mini-table'
);

insert into auth.users (id, email)
values
  ('a1000000-0000-4000-8000-000000000001', 'phase2-member@example.test'),
  ('a1000000-0000-4000-8000-000000000002', 'phase2-outsider@example.test');

select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated","email":"phase2-member@example.test"}',
  true
);
select lives_ok(
  $$select api.create_league(
    'Phase 2 Trusted League',
    'phase-2-trusted-league',
    'LIVE',
    2026
  )$$,
  'member UI creation constructs the authoritative snapshot in the database'
);

select lives_ok(
  $$select api.create_league(
    'Phase 2 Legacy Compatibility',
    'phase-2-legacy-compatibility',
    'LIVE',
    2026,
    'FORGED-RULESET',
    '999.0',
    'FORGED-PRODUCT-BIBLE',
    '999.0',
    '{"mode":"LIVE","forged":true}'::jsonb,
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
  )$$,
  'legacy member UI fields cannot select the persisted Ruleset identity'
);

select is(
  (
    select snapshot.ruleset_version
    from private.leagues as league
    join private.seasons as season on season.league_id = league.id
    join private.season_ruleset_snapshots as snapshot
      on snapshot.id = season.ruleset_snapshot_id
    where league.slug = 'phase-2-trusted-league'
  ),
  '1.1',
  'trusted creation stores Ruleset V1.1'
);
select is(
  (
    select snapshot.sha256_hash
    from private.leagues as league
    join private.seasons as season on season.league_id = league.id
    join private.season_ruleset_snapshots as snapshot
      on snapshot.id = season.ruleset_snapshot_id
    where league.slug = 'phase-2-trusted-league'
  ),
  '047550e7661915d3ba4d8e4046f85ab9474eac7b857fbba398cb4d9b91a5766c',
  'trusted Live creation stores the allowlisted canonical digest'
);
select is(
  (
    select snapshot.ruleset_id
    from private.leagues as league
    join private.seasons as season on season.league_id = league.id
    join private.season_ruleset_snapshots as snapshot
      on snapshot.id = season.ruleset_snapshot_id
    where league.slug = 'phase-2-legacy-compatibility'
  ),
  'SUNDAY-LEDGER-POC-SEASON-RULESET-V1',
  'legacy compatibility ignores a forged Ruleset identifier'
);
select is(
  (
    select snapshot.sha256_hash
    from private.leagues as league
    join private.seasons as season on season.league_id = league.id
    join private.season_ruleset_snapshots as snapshot
      on snapshot.id = season.ruleset_snapshot_id
    where league.slug = 'phase-2-legacy-compatibility'
  ),
  '047550e7661915d3ba4d8e4046f85ab9474eac7b857fbba398cb4d9b91a5766c',
  'legacy compatibility stores the authoritative Live digest'
);

set local role authenticated;
select is(
  api.get_season_ruleset('phase-2-trusted-league') ->> 'rulesetId',
  'SUNDAY-LEDGER-POC-SEASON-RULESET-V1',
  'a member can render the persisted season identity'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated","email":"phase2-outsider@example.test"}',
  true
);
set local role authenticated;
select is(
  api.get_season_ruleset('phase-2-trusted-league'),
  null::jsonb,
  'a non-member cannot read another league Ruleset snapshot'
);
reset role;

select throws_ok(
  $$update private.season_ruleset_snapshots as snapshot
    set
      canonical_json = '{"mode":"LIVE","forged":true}'::jsonb,
      frozen_at = clock_timestamp()
    from private.seasons as season
    join private.leagues as league on league.id = season.league_id
    where snapshot.id = season.ruleset_snapshot_id
      and league.slug = 'phase-2-trusted-league'$$,
  '55000',
  'The season Ruleset is not an authoritative published snapshot.',
  'a non-allowlisted draft cannot cross the roster-lock freeze boundary'
);

select * from finish();
rollback;
