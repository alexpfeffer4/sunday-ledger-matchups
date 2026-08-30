begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_column('private', 'playoff_publications', 'version', 'qualification publications are versioned');
select has_column('private', 'playoff_publications', 'supersedes_id', 'qualification lineage stores its parent');
select has_column('private', 'playoff_publications', 'bracket_state', 'terminal bracket state is explicit');
select has_column('private', 'playoff_publications', 'source_result_version_ids', 'qualification cites its result lineage');
select has_column('private', 'playoff_round_publications', 'version', 'postseason rounds are versioned');
select has_column('private', 'matchups', 'postseason_role', 'postseason matchups store their explicit role');
select has_function('api', 'publish_playoff_qualification', array['uuid', 'text'], 'canonical qualification command exists');
select has_function('api', 'publish_postseason_week', array['uuid', 'uuid', 'text[]', 'text'], 'canonical round command exists');
select has_function('api', 'get_playoff_state', array['text'], 'canonical participant read exists');
select function_privs_are('api', 'publish_playoff_qualification', array['uuid', 'text'], 'anon', array[]::text[], 'anonymous qualification is denied');
select function_privs_are('api', 'publish_postseason_week', array['uuid', 'uuid', 'text[]', 'text'], 'anon', array[]::text[], 'anonymous round publication is denied');
select function_privs_are('private', 'build_phase8_playoff_publication', array['jsonb', 'integer', 'integer'], 'authenticated', array[]::text[], 'participants cannot call the qualification kernel');
select function_privs_are('private', 'build_phase8_postseason_round', array['uuid', 'integer'], 'authenticated', array[]::text[], 'participants cannot call the pairing kernel');

with ordered as (
  select jsonb_agg(jsonb_build_object(
    'seed', seed, 'entryId', ('98000000-0000-4000-8000-' || lpad(seed::text, 12, '0'))::uuid,
    'displayName', 'Sparse ' || seed::text, 'attendanceMisses', 3
  ) order by seed) as rows
  from generate_series(1, 10) as seed
), built as (
  select private.build_phase8_playoff_publication(rows, 10, 3) as state from ordered
)
select is((select state ->> 'actualQualifierCount' from built), '4', 'zero eligible members reinstate exactly four');

with ordered as (
  select jsonb_agg(jsonb_build_object(
    'seed', seed, 'entryId', ('99000000-0000-4000-8000-' || lpad(seed::text, 12, '0'))::uuid,
    'displayName', 'Five ' || seed::text, 'attendanceMisses', case when seed <= 5 then 0 else 3 end
  ) order by seed) as rows
  from generate_series(1, 10) as seed
), built as (
  select private.build_phase8_playoff_publication(rows, 10, 3) as state from ordered
)
select is((select state ->> 'actualQualifierCount' from built), '5', 'five eligible members preserve one vacancy');

select * from finish();
rollback;
