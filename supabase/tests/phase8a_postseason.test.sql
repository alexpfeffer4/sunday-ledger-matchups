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
select has_function('private', 'is_effective_slate_item', array['uuid'], 'effective postseason slate selection is canonical');
select has_function('private', 'is_week_card_sealed', array['uuid'], 'postseason corrections share one card-seal guard');
select function_privs_are('private', 'is_effective_slate_item', array['uuid'], 'authenticated', array[]::text[], 'participants cannot call the slate-lineage helper');
select function_privs_are('private', 'is_week_card_sealed', array['uuid'], 'authenticated', array[]::text[], 'participants cannot call the card-seal helper');

create temporary table phase8_qualification_matrix as
select
  eligible_count,
  private.build_phase8_playoff_publication(ordered.rows, 10, 3) as state
from generate_series(0, 6) as matrix(eligible_count)
cross join lateral (
  select jsonb_agg(jsonb_build_object(
    'seed', seed,
    'entryId', ('98000000-0000-4000-8000-'
      || lpad((eligible_count * 10 + seed)::text, 12, '0'))::uuid,
    'displayName', 'Eligible ' || eligible_count::text || ' · Seed ' || seed::text,
    'attendanceMisses', case when seed <= eligible_count then 0 else 3 end
  ) order by seed) as rows
  from generate_series(1, 10) as standings(seed)
) as ordered;

select is(
  (select count(*)::integer
   from phase8_qualification_matrix
   cross join lateral jsonb_array_elements(state -> 'qualifiers') as qualifier(value)
   where qualifier.value ->> 'selectionReason' = 'MINIMUM_FOUR_CHAMPIONSHIP_FIELD'
     and eligible_count = 0),
  4,
  'zero eligible entries reinstate four'
);
select is(
  (select count(*)::integer
   from phase8_qualification_matrix
   cross join lateral jsonb_array_elements(state -> 'qualifiers') as qualifier(value)
   where qualifier.value ->> 'selectionReason' = 'MINIMUM_FOUR_CHAMPIONSHIP_FIELD'
     and eligible_count = 1),
  3,
  'one eligible entry reinstates three'
);
select is(
  (select count(*)::integer
   from phase8_qualification_matrix
   cross join lateral jsonb_array_elements(state -> 'qualifiers') as qualifier(value)
   where qualifier.value ->> 'selectionReason' = 'MINIMUM_FOUR_CHAMPIONSHIP_FIELD'
     and eligible_count = 2),
  2,
  'two eligible entries reinstate two'
);
select is(
  (select count(*)::integer
   from phase8_qualification_matrix
   cross join lateral jsonb_array_elements(state -> 'qualifiers') as qualifier(value)
   where qualifier.value ->> 'selectionReason' = 'MINIMUM_FOUR_CHAMPIONSHIP_FIELD'
     and eligible_count = 3),
  1,
  'three eligible entries reinstate one'
);
select is(
  (select count(*)::integer
   from phase8_qualification_matrix
   cross join lateral jsonb_array_elements(state -> 'qualifiers') as qualifier(value)
   where qualifier.value ->> 'selectionReason' = 'MINIMUM_FOUR_CHAMPIONSHIP_FIELD'
     and eligible_count = 4),
  0,
  'four eligible entries reinstate none'
);
select is(
  (select count(*)::integer
   from phase8_qualification_matrix
   cross join lateral jsonb_array_elements(state -> 'qualifiers') as qualifier(value)
   where qualifier.value ->> 'selectionReason' = 'MINIMUM_FOUR_CHAMPIONSHIP_FIELD'
     and eligible_count = 5),
  0,
  'five eligible entries reinstate none'
);
select is(
  (select count(*)::integer
   from phase8_qualification_matrix
   cross join lateral jsonb_array_elements(state -> 'qualifiers') as qualifier(value)
   where qualifier.value ->> 'selectionReason' = 'MINIMUM_FOUR_CHAMPIONSHIP_FIELD'
     and eligible_count = 6),
  0,
  'six eligible entries reinstate none'
);

select results_eq(
  $$select eligible_count, (state ->> 'actualQualifierCount')::integer
    from phase8_qualification_matrix order by eligible_count$$,
  $$values (0, 4), (1, 4), (2, 4), (3, 4), (4, 4), (5, 5), (6, 6)$$,
  'large-league fields contain exactly 4, 5, or 6 entries without dead ends'
);
select results_eq(
  $$select eligible_count,
      array_agg((qualifier.value ->> 'regularSeasonSeed')::integer
        order by (qualifier.value ->> 'qualificationSeed')::integer)
    from phase8_qualification_matrix
    cross join lateral jsonb_array_elements(state -> 'qualifiers') as qualifier(value)
    group by eligible_count order by eligible_count$$,
  $$values
    (0, array[1,2,3,4]), (1, array[1,2,3,4]),
    (2, array[1,2,3,4]), (3, array[1,2,3,4]),
    (4, array[1,2,3,4]), (5, array[1,2,3,4,5]),
    (6, array[1,2,3,4,5,6])$$,
  'eligible entries precede reinstated entries and both retain frozen Week 14 order'
);
select results_eq(
  $$select eligible_count,
      array_agg((slot.value ->> 'slot')::integer order by (slot.value ->> 'slot')::integer)
        filter (where slot.value ->> 'state' = 'VACANT')
    from phase8_qualification_matrix
    cross join lateral jsonb_array_elements(state #> '{bracketState,slots}') as slot(value)
    group by eligible_count order by eligible_count$$,
  $$values
    (0, array[5,6]), (1, array[5,6]), (2, array[5,6]),
    (3, array[5,6]), (4, array[5,6]), (5, array[6]),
    (6, null::integer[])$$,
  'vacant six-slot seeds remain explicit for four- and five-entry fields'
);
select results_eq(
  $$select eligible_count,
      coalesce(array_agg(
        (advance.value #>> '{entry,qualificationSeed}')::integer
        order by (advance.value #>> '{entry,qualificationSeed}')::integer
      ) filter (where advance.value ->> 'reason' = 'VACANT_OPPONENT'), '{}'::integer[])
    from phase8_qualification_matrix
    cross join lateral jsonb_array_elements(
      state #> '{bracketState,automaticWeek15Advancements}'
    ) as advance(value)
    group by eligible_count order by eligible_count$$,
  $$values
    (0, array[3,4]), (1, array[3,4]), (2, array[3,4]),
    (3, array[3,4]), (4, array[3,4]), (5, array[3]),
    (6, '{}'::integer[])$$,
  'vacancies grant only the approved automatic advancements'
);

select * from finish();
rollback;
