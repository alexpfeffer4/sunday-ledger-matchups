begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table(
  'private',
  'playoff_publications',
  'immutable playoff publications are stored outside the Data API schema'
);
select has_index(
  'private',
  'playoff_publications',
  'playoff_publications_season_league_fk_idx',
  'the composite season/league foreign key is indexed'
);
select has_function(
  'api',
  'publish_live_playoff_qualification',
  array['uuid', 'text'],
  'the commissioner qualification command is exposed'
);
select has_function(
  'api',
  'get_live_playoff_state',
  array['text'],
  'the member playoff read model is exposed'
);
select function_privs_are(
  'api',
  'publish_live_playoff_qualification',
  array['uuid', 'text'],
  'anon',
  array[]::text[],
  'anonymous callers cannot publish qualification'
);
select function_privs_are(
  'api',
  'publish_live_playoff_qualification',
  array['uuid', 'text'],
  'authenticated',
  array['EXECUTE'],
  'authenticated callers can invoke the self-authorizing command'
);
select function_privs_are(
  'private',
  'build_live_playoff_publication',
  array['jsonb', 'integer'],
  'authenticated',
  array[]::text[],
  'participants cannot invoke the internal bracket builder'
);

insert into auth.users (id, email)
values
  ('a1000000-0000-4000-8000-000000000001', 'playoff-commissioner@example.test'),
  ('a1000000-0000-4000-8000-000000000002', 'playoff-member-2@example.test'),
  ('a1000000-0000-4000-8000-000000000003', 'playoff-member-3@example.test'),
  ('a1000000-0000-4000-8000-000000000004', 'playoff-member-4@example.test'),
  ('a1000000-0000-4000-8000-000000000005', 'playoff-member-5@example.test'),
  ('a1000000-0000-4000-8000-000000000006', 'playoff-member-6@example.test');

insert into private.profiles (id, display_name)
values
  ('a1000000-0000-4000-8000-000000000001', 'Playoff Commissioner'),
  ('a1000000-0000-4000-8000-000000000002', 'Playoff Member Two'),
  ('a1000000-0000-4000-8000-000000000003', 'Playoff Member Three'),
  ('a1000000-0000-4000-8000-000000000004', 'Playoff Member Four'),
  ('a1000000-0000-4000-8000-000000000005', 'Playoff Member Five'),
  ('a1000000-0000-4000-8000-000000000006', 'Playoff Member Six');

insert into private.leagues (id, name, slug, created_by)
values (
  'a2000000-0000-4000-8000-000000000001',
  'Stage 3 Playoff Qualification Test',
  'stage3-playoff-qualification-test',
  'a1000000-0000-4000-8000-000000000001'
);

insert into private.league_memberships (league_id, user_id, role)
values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'COMMISSIONER'),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'MEMBER'),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', 'MEMBER'),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000004', 'MEMBER'),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000005', 'MEMBER'),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000006', 'MEMBER');

insert into private.season_ruleset_snapshots (
  id, ruleset_id, ruleset_version, product_bible_id, product_bible_version,
  mode, canonical_json, sha256_hash, frozen_at
) values (
  'a3000000-0000-4000-8000-000000000001',
  'live-season-1', '1.1', 'sunday-ledger-product-bible', '3.0',
  'LIVE', jsonb_build_object(
    'version', '1.1',
    'mode', 'LIVE',
    'attendance', jsonb_build_object('playoffIneligibilityAtMisses', 3),
    'playoffs', jsonb_build_object(
      'minimumChampionshipField', 4,
      'selectionOrder', 'ELIGIBLE_BEFORE_REINSTATED',
      'reinstatementReason', 'MINIMUM_FOUR_CHAMPIONSHIP_FIELD',
      'noReinstatementAtOrAboveEligibleCount', 4,
      'sixSlotVacancyBehavior', jsonb_build_object(
        'vacantSlotsRemainVacant', true,
        'fourParticipantsVacantSeeds', jsonb_build_array(5, 6),
        'fourParticipantsAutomaticAdvances', jsonb_build_array(3, 4),
        'fiveParticipantsVacantSeeds', jsonb_build_array(6),
        'fiveParticipantsAutomaticAdvances', jsonb_build_array(3)
      ),
      'everyMemberPostseasonParticipation', jsonb_build_object(
        'weeks', jsonb_build_array(15, 16, 17),
        'cardsPerMemberPerWeek', 1,
        'matchupsPerMemberPerWeek', 1,
        'remainingPairingOrder', 'ADJACENT_FROZEN_WEEK_14_ORDER',
        'byeExhibitions', true,
        'rematchesAllowed', true
      ),
      'regularSeasonAttendanceFrozenAfterWeek', 14,
      'exhibitionMiss', jsonb_build_object('marker', 'EXHIBITION_MISS', 'scoreCenticredits', 0, 'affectsOfficialCompetition', false),
      'postseasonRoles', jsonb_build_array('CHAMPIONSHIP', 'THIRD_PLACE', 'PLACEMENT', 'EXHIBITION'),
      'championshipAdvancement', jsonb_build_object(
        'advancingRole', 'CHAMPIONSHIP', 'higherSeedAdvancesExactTie', true,
        'singleIncompleteEliminated', true, 'dualIncompleteAdvancesHigherSeed', true,
        'reseedSemifinals', 'SEED_1_VS_LOWEST_REMAINING'
      )
    )
  ), repeat('a', 64), now() - interval '16 weeks'
);

insert into private.seasons (
  id, league_id, ruleset_snapshot_id, mode, nfl_year, lifecycle,
  roster_seed, schedule_seed, roster_locked_at
) values (
  'a3500000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001',
  'LIVE', 2026, 'REGULAR', repeat('b', 64), repeat('c', 64),
  now() - interval '16 weeks'
);

insert into private.season_entries (
  id, season_id, league_id, user_id, standing_tiebreak
) values
  ('a4000000-0000-4000-8000-000000000001', 'a3500000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', repeat('1', 64)),
  ('a4000000-0000-4000-8000-000000000002', 'a3500000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', repeat('2', 64)),
  ('a4000000-0000-4000-8000-000000000003', 'a3500000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', repeat('3', 64)),
  ('a4000000-0000-4000-8000-000000000004', 'a3500000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000004', repeat('4', 64)),
  ('a4000000-0000-4000-8000-000000000005', 'a3500000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000005', repeat('5', 64)),
  ('a4000000-0000-4000-8000-000000000006', 'a3500000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000006', repeat('6', 64));

insert into private.season_weeks (
  id, season_id, league_id, nfl_week, scope, state, opens_at,
  common_lock_at, locked_at, correction_window_closes_at
) values (
  'a5000000-0000-4000-8000-000000000001',
  'a3500000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  14, 'REGULAR', 'PROVISIONAL', now() - interval '8 days',
  now() - interval '7 days', now() - interval '7 days', now() - interval '6 days'
);

insert into private.standings_snapshots (
  id, season_id, week_id, league_id, through_week, ordered_rows,
  input_hash, status
) values (
  'a6000000-0000-4000-8000-000000000001',
  'a3500000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  14,
  jsonb_build_array(
    jsonb_build_object('seed', 1, 'entryId', 'a4000000-0000-4000-8000-000000000001', 'displayName', 'Playoff Commissioner', 'wins', 11, 'losses', 3, 'ties', 0, 'pointsForCenticredits', 1500000, 'allPlayHalfWinUnits', 120, 'allPlayComparisonCount', 70, 'attendanceMisses', 0, 'highestWeekCenticredits', 155000, 'deterministicTiebreak', repeat('1', 64)),
    jsonb_build_object('seed', 2, 'entryId', 'a4000000-0000-4000-8000-000000000002', 'displayName', 'Playoff Member Two', 'wins', 10, 'losses', 4, 'ties', 0, 'pointsForCenticredits', 1450000, 'allPlayHalfWinUnits', 115, 'allPlayComparisonCount', 70, 'attendanceMisses', 3, 'highestWeekCenticredits', 150000, 'deterministicTiebreak', repeat('2', 64)),
    jsonb_build_object('seed', 3, 'entryId', 'a4000000-0000-4000-8000-000000000003', 'displayName', 'Playoff Member Three', 'wins', 9, 'losses', 5, 'ties', 0, 'pointsForCenticredits', 1400000, 'allPlayHalfWinUnits', 110, 'allPlayComparisonCount', 70, 'attendanceMisses', 1, 'highestWeekCenticredits', 145000, 'deterministicTiebreak', repeat('3', 64)),
    jsonb_build_object('seed', 4, 'entryId', 'a4000000-0000-4000-8000-000000000004', 'displayName', 'Playoff Member Four', 'wins', 8, 'losses', 6, 'ties', 0, 'pointsForCenticredits', 1350000, 'allPlayHalfWinUnits', 105, 'allPlayComparisonCount', 70, 'attendanceMisses', 2, 'highestWeekCenticredits', 140000, 'deterministicTiebreak', repeat('4', 64)),
    jsonb_build_object('seed', 5, 'entryId', 'a4000000-0000-4000-8000-000000000005', 'displayName', 'Playoff Member Five', 'wins', 7, 'losses', 7, 'ties', 0, 'pointsForCenticredits', 1300000, 'allPlayHalfWinUnits', 100, 'allPlayComparisonCount', 70, 'attendanceMisses', 0, 'highestWeekCenticredits', 135000, 'deterministicTiebreak', repeat('5', 64)),
    jsonb_build_object('seed', 6, 'entryId', 'a4000000-0000-4000-8000-000000000006', 'displayName', 'Playoff Member Six', 'wins', 6, 'losses', 8, 'ties', 0, 'pointsForCenticredits', 1250000, 'allPlayHalfWinUnits', 95, 'allPlayComparisonCount', 70, 'attendanceMisses', 0, 'highestWeekCenticredits', 130000, 'deterministicTiebreak', repeat('6', 64))
  ),
  repeat('d', 64),
  'FINAL'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $$select api.publish_live_playoff_qualification(
    'a2000000-0000-4000-8000-000000000001',
    'playoff-before-week14-final'
  )$$,
  '55000',
  'Week 14 must be final before playoff qualification can publish.',
  'qualification cannot publish from a provisional Week 14'
);

update private.season_weeks
set state = 'FINAL'
where id = 'a5000000-0000-4000-8000-000000000001';

select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select throws_ok(
  $$select api.publish_live_playoff_qualification(
    'a2000000-0000-4000-8000-000000000001',
    'member-cannot-publish-playoffs'
  )$$,
  '42501',
  'Commissioner membership required.',
  'a regular member cannot freeze the playoff field'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$select api.publish_live_playoff_qualification(
    'a2000000-0000-4000-8000-000000000001',
    'publish-playoff-field-2026'
  )$$,
  'the commissioner can freeze qualification after Week 14 finalization'
);

select is(
  (select lifecycle from private.seasons where id = 'a3500000-0000-4000-8000-000000000001'),
  'PLAYOFFS',
  'qualification advances the season lifecycle to playoffs'
);
select is(
  (select count(*)::integer from private.playoff_publications where season_id = 'a3500000-0000-4000-8000-000000000001'),
  1,
  'one immutable qualification publication exists'
);
select is(
  (select expected_qualifier_count from private.playoff_publications where season_id = 'a3500000-0000-4000-8000-000000000001'),
  4,
  'a six-member league uses the frozen top-four field'
);
select is(
  (select jsonb_array_length(qualifiers) from private.playoff_publications where season_id = 'a3500000-0000-4000-8000-000000000001'),
  4,
  'the next eligible standing fills the field without admitting an ineligible entry'
);
select is(
  (select qualifiers #>> '{1,entryId}' from private.playoff_publications where season_id = 'a3500000-0000-4000-8000-000000000001'),
  'a4000000-0000-4000-8000-000000000003',
  'the regular-season No. 2 entry is excluded after its third miss'
);
select is(
  (select qualifiers #>> '{3,regularSeasonSeed}' from private.playoff_publications where season_id = 'a3500000-0000-4000-8000-000000000001'),
  '5',
  'the fourth eligible qualifier retains its regular-season seed evidence'
);
select is(
  (select bracket_state ->> 'format' from private.playoff_publications where season_id = 'a3500000-0000-4000-8000-000000000001'),
  'FOUR_SLOT',
  'the publication chooses the small-league bracket'
);
select is(
  (select jsonb_array_length(bracket_state -> 'slots') from private.playoff_publications where season_id = 'a3500000-0000-4000-8000-000000000001'),
  4,
  'the four-slot representation stores every occupied slot'
);
select is(
  (select bracket_state #>> '{slots,3,entry,regularSeasonSeed}' from private.playoff_publications where season_id = 'a3500000-0000-4000-8000-000000000001'),
  '5',
  'the 1-vs-4 semifinal uses the frozen eligible field'
);

select is(
  (api.publish_live_playoff_qualification(
    'a2000000-0000-4000-8000-000000000001',
    'publish-playoff-field-2026'
  ) ->> 'publicationId'),
  (select id::text from private.playoff_publications where season_id = 'a3500000-0000-4000-8000-000000000001'),
  'the qualification command replays idempotently'
);

select throws_ok(
  $$update private.playoff_publications
    set published_at = published_at + interval '1 second'
    where season_id = 'a3500000-0000-4000-8000-000000000001'$$,
  '55000',
  'playoff_publications is append-only.',
  'the frozen field rejects mutation'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select lives_ok(
  $$select api.get_live_playoff_state('stage3-playoff-qualification-test')$$,
  'a league member can read the frozen playoff artifact'
);
select is(
  api.get_live_playoff_state('stage3-playoff-qualification-test') #>> '{publication,qualifiers,0,displayName}',
  'Playoff Commissioner',
  'the read model exposes the ordered qualifier evidence'
);
select is(
  (select count(*)::integer from private.playoff_publications),
  1,
  'member-scoped RLS allows the publication for this league'
);

select * from finish();
rollback;
