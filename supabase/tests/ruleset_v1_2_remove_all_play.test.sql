begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select is(
  (select count(*) from private.authoritative_season_rulesets),
  2::bigint,
  'the authoritative catalog still contains exactly one row per mode'
);

select results_eq(
  $$select mode, ruleset_version, product_bible_version
    from private.authoritative_season_rulesets
    order by mode$$,
  $$values
    ('LIVE', '1.2', '3.1'),
    ('SIMULATION', '1.2', '3.1')$$,
  'both authoritative modes publish the prospective V1.2 identity'
);

select results_eq(
  $$select mode, canonical_json #> '{standings,tiebreakOrder}'
    from private.authoritative_season_rulesets
    order by mode$$,
  $$values
    ('LIVE', '["MATCHUP_WIN_PERCENTAGE", "POINTS_FOR", "BALANCED_HEAD_TO_HEAD", "FEWER_ATTENDANCE_MISSES", "HIGHEST_SINGLE_WEEK_SCORE", "STORED_DETERMINISTIC_RANDOM"]'::jsonb),
    ('SIMULATION', '["MATCHUP_WIN_PERCENTAGE", "POINTS_FOR", "BALANCED_HEAD_TO_HEAD", "FEWER_ATTENDANCE_MISSES", "HIGHEST_SINGLE_WEEK_SCORE", "STORED_DETERMINISTIC_RANDOM"]'::jsonb)$$,
  'V1.2 stores the approved tiebreak order without All-play'
);

select ok(
  not exists (
    select 1
    from private.authoritative_season_rulesets
    where canonical_json #> '{standings,tiebreakOrder}'
      ? 'ALL_PLAY_PERCENTAGE'
  ),
  'no prospective authoritative Ruleset accepts the All-play identifier'
);

select results_eq(
  $$select mode, sha256_hash
    from private.authoritative_season_rulesets
    order by mode$$,
  $$values
    ('LIVE', '6d9c85a0763b8c140296bda409ed3eecbe0ac4b91466b3504dd23ff4489e4ac7'),
    ('SIMULATION', 'd7b74cb761ca652fad2ffff32f6e20a16326434d7e0f19d86a7e32b6a818ef8b')$$,
  'the database catalog digests match the compiled V1.2 Rulesets'
);

select ok(
  position(
    'snapshot.canonical_json' in
    pg_get_functiondef('private.build_regular_standings(uuid)'::regprocedure)
  ) > 0,
  'standings choose compatibility behavior from the season snapshot'
);

select ok(
  position(
    'uses_all_play' in
    pg_get_functiondef('private.build_regular_standings(uuid)'::regprocedure)
  ) > 0,
  'the authoritative calculation retains an explicit V1.1 compatibility gate'
);

select function_privs_are(
  'private',
  'build_regular_standings',
  array['uuid'],
  'authenticated',
  array[]::text[],
  'members cannot invoke the private standings builder directly'
);

select * from finish();
rollback;
