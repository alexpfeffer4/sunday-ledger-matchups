begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table(
  'private',
  'season_archive_versions',
  'the existing archive relation is generalized into one version chain'
);
select hasnt_table(
  'private',
  'live_season_archives',
  'the legacy archive name is retired after the in-place rename'
);

select has_column('private', 'playoff_publications', 'publication_stage');
select has_column('private', 'playoff_publications', 'champion_entry_id');
select has_column('private', 'playoff_publications', 'runner_up_entry_id');
select has_column('private', 'playoff_publications', 'third_place_entry_ids');
select has_column('private', 'playoff_publications', 'final_placement_json');
select has_column('private', 'playoff_publications', 'terminal_result_version_ids');
select has_column('private', 'playoff_publications', 'correction_id');

select has_column('private', 'season_archive_versions', 'archive_schema_version');
select has_column('private', 'season_archive_versions', 'version');
select has_column('private', 'season_archive_versions', 'supersedes_id');
select has_column('private', 'season_archive_versions', 'terminal_bracket_publication_id');
select has_column('private', 'season_archive_versions', 'terminal_w17_result_version_ids');
select has_column('private', 'season_archive_versions', 'effective_w18_round_publication_id');
select has_column('private', 'season_archive_versions', 'terminal_w18_result_version_ids');
select has_column('private', 'season_archive_versions', 'correction_id');

select has_index(
  'private',
  'season_archive_versions',
  'season_archive_versions_one_successor_idx',
  'an archive version can have at most one successor'
);
select has_index(
  'private',
  'playoff_publications',
  'playoff_publications_one_successor_idx',
  'a bracket version can have at most one successor'
);
select has_index(
  'private',
  'playoff_round_publications',
  'playoff_round_publications_one_successor_idx',
  'a postseason round version can have at most one successor'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conname = 'season_archive_versions_supersedes_same_season_fk'
      and constraint_row.contype = 'f'
  ),
  'archive supersession is constrained to the same season'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conname = 'playoff_publications_supersedes_same_season_fk'
      and constraint_row.contype = 'f'
  ),
  'bracket supersession is constrained to the same season'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conname = 'playoff_round_publications_supersedes_same_week_fk'
      and constraint_row.contype = 'f'
  ),
  'round supersession is constrained to the same season and week'
);

select has_function('api', 'finalize_champion_bracket', array['uuid', 'text']);
select has_function('api', 'publish_week18_exhibition', array['uuid', 'uuid', 'text[]', 'text']);
select has_function('api', 'correct_finalized_week17_result', array['uuid', 'text', 'integer', 'integer', 'text', 'text']);
select has_function('api', 'finalize_season_archive', array['uuid', 'text']);
select has_function('api', 'get_season_archive', array['text']);
select has_function('api', 'get_week17_correction_operations', array['text']);
select has_function('private', 'is_week18_pairing_replaceable', array['uuid']);

select function_privs_are(
  'api', 'finalize_champion_bracket', array['uuid', 'text'],
  'anon', array[]::text[], 'anonymous champion finalization is denied'
);
select function_privs_are(
  'api', 'finalize_champion_bracket', array['uuid', 'text'],
  'authenticated', array['EXECUTE'], 'authenticated callers use the guarded command'
);
select function_privs_are(
  'api', 'publish_week18_exhibition', array['uuid', 'uuid', 'text[]', 'text'],
  'anon', array[]::text[], 'anonymous Week 18 publication is denied'
);
select function_privs_are(
  'api', 'publish_week18_exhibition', array['uuid', 'uuid', 'text[]', 'text'],
  'authenticated', array['EXECUTE'], 'authenticated callers use the guarded command'
);
select function_privs_are(
  'api', 'correct_finalized_week17_result', array['uuid', 'text', 'integer', 'integer', 'text', 'text'],
  'anon', array[]::text[], 'anonymous late correction is denied'
);
select function_privs_are(
  'api', 'correct_finalized_week17_result', array['uuid', 'text', 'integer', 'integer', 'text', 'text'],
  'authenticated', array['EXECUTE'], 'authenticated callers use the guarded correction command'
);
select function_privs_are(
  'api', 'finalize_season_archive', array['uuid', 'text'],
  'anon', array[]::text[], 'anonymous archive finalization is denied'
);
select function_privs_are(
  'api', 'finalize_season_archive', array['uuid', 'text'],
  'authenticated', array['EXECUTE'], 'authenticated callers use the guarded archive command'
);
select function_privs_are(
  'private', 'is_week18_pairing_replaceable', array['uuid'],
  'authenticated', array[]::text[], 'participants cannot invoke the freeze predicate directly'
);

select policies_are(
  'private',
  'season_archive_versions',
  array['season_archive_versions_select_member'],
  'archive versions retain only exact league-member read access'
);
select table_privs_are(
  'private',
  'season_archive_versions',
  'authenticated',
  array['SELECT'],
  'authenticated users cannot mutate archive rows directly'
);
select table_privs_are(
  'private',
  'season_archive_versions',
  'anon',
  array[]::text[],
  'anonymous users cannot read or mutate archive rows'
);

select function_privs_are(
  'api', 'publish_simulation_season_archive', array['uuid', 'jsonb', 'text'],
  'authenticated', array[]::text[], 'retired Simulation publication remains revoked'
);
select function_privs_are(
  'api', 'get_simulation_season_archive', array['text'],
  'authenticated', array[]::text[], 'retired Simulation archive read remains revoked'
);
select table_privs_are(
  'private', 'simulation_season_archives', 'authenticated', array[]::text[],
  'retired Simulation archive rows remain unavailable'
);

select * from finish();
rollback;
