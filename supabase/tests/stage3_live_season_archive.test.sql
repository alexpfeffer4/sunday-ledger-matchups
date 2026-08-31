begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table(
  'private',
  'season_archive_versions',
  'versioned season archives are stored outside the Data API schema'
);
select has_function(
  'api',
  'publish_live_season_archive',
  array['uuid', 'text'],
  'the guarded final archive command is exposed'
);
select has_function(
  'api',
  'get_season_archive',
  array['text'],
  'the unified member archive read model is exposed'
);
select policies_are(
  'private',
  'season_archive_versions',
  array['season_archive_versions_select_member'],
  'the archive has only the league-member read policy'
);
select function_privs_are(
  'api',
  'publish_live_season_archive',
  array['uuid', 'text'],
  'anon',
  array[]::text[],
  'anonymous callers cannot publish a final archive'
);

create temporary table archive_members as
select
  seed,
  ('c1000000-0000-4000-8000-' || lpad(seed::text, 12, '0'))::uuid as user_id,
  ('c4000000-0000-4000-8000-' || lpad(seed::text, 12, '0'))::uuid as entry_id,
  'Archive Seed ' || seed::text as display_name
from generate_series(1, 4) as seed;

create temporary table archive_weeks as
select
  week as nfl_week,
  ('c5000000-0000-4000-8000-' || lpad(week::text, 12, '0'))::uuid as week_id
from generate_series(1, 17) as week;

insert into auth.users (id, email)
select user_id, 'archive-seed-' || seed::text || '@example.test'
from archive_members;
insert into private.profiles (id, display_name)
select user_id, display_name from archive_members;
insert into private.leagues (id, name, slug, created_by)
values (
  'c2000000-0000-4000-8000-000000000001',
  'Stage 3 Live Archive Test',
  'stage3-live-archive-test',
  'c1000000-0000-4000-8000-000000000001'
);
insert into private.league_memberships (league_id, user_id, role)
select
  'c2000000-0000-4000-8000-000000000001',
  user_id,
  case when seed = 1 then 'COMMISSIONER' else 'MEMBER' end
from archive_members;
insert into private.season_ruleset_snapshots (
  id, ruleset_id, ruleset_version, product_bible_id,
  product_bible_version, mode, canonical_json, sha256_hash, frozen_at
) values (
  'c3000000-0000-4000-8000-000000000001',
  'live-season-1', '1.0', 'sunday-ledger-product-bible', '3.0',
  'LIVE', '{"mode":"LIVE"}', repeat('1', 64), now() - interval '20 weeks'
);
insert into private.seasons (
  id, league_id, ruleset_snapshot_id, mode, nfl_year, lifecycle,
  roster_seed, schedule_seed, roster_locked_at
) values (
  'c3500000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000001',
  'LIVE', 2026, 'PLAYOFFS', repeat('2', 64), repeat('3', 64),
  now() - interval '20 weeks'
);
insert into private.season_entries (
  id, season_id, league_id, user_id, standing_tiebreak
)
select
  entry_id,
  'c3500000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  user_id,
  repeat(to_hex(seed), 64)
from archive_members;

with generated as (
  select private.generate_regular_season_schedule(
    array_agg(entry_id order by seed),
    repeat('3', 64)
  ) as schedule
  from archive_members
)
insert into private.schedule_publications (
  id, season_id, league_id, version, algorithm_version, seed,
  ordered_entry_ids, output_hash, schedule_json, created_by
)
select
  'c7000000-0000-4000-8000-000000000001',
  'c3500000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  1, 'circle-v1', repeat('3', 64),
  (select array_agg(entry_id order by seed) from archive_members),
  schedule ->> 'outputHash', schedule,
  'c1000000-0000-4000-8000-000000000001'
from generated;

insert into private.season_weeks (
  id, season_id, league_id, nfl_week, scope, state, opens_at,
  common_lock_at, locked_at, correction_window_closes_at
)
select
  week_id,
  'c3500000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  nfl_week,
  case when nfl_week <= 14 then 'REGULAR'
       when nfl_week = 15 then 'EXHIBITION'
       else 'PLAYOFF' end,
  'FINAL', now() - interval '20 weeks', now() - interval '19 weeks',
  now() - interval '19 weeks', now() - interval '18 weeks'
from archive_weeks;

insert into private.standings_snapshots (
  id, season_id, week_id, league_id, through_week, ordered_rows,
  input_hash, status
)
select
  ('c6000000-0000-4000-8000-' || lpad(week.nfl_week::text, 12, '0'))::uuid,
  'c3500000-0000-4000-8000-000000000001', week.week_id,
  'c2000000-0000-4000-8000-000000000001', week.nfl_week,
  (
    select jsonb_agg(jsonb_build_object(
      'seed', member.seed,
      'entryId', member.entry_id,
      'displayName', member.display_name,
      'wins', 15 - member.seed,
      'losses', member.seed - 1,
      'ties', 0,
      'pointsForCenticredits', 1500000 - member.seed * 10000,
      'allPlayHalfWinUnits', 100 - member.seed,
      'allPlayComparisonCount', 126,
      'attendanceMisses', 0,
      'highestWeekCenticredits', 150000 - member.seed * 1000,
      'deterministicTiebreak', repeat(to_hex(member.seed), 64)
    ) order by member.seed)
    from archive_members as member
  ),
  encode(extensions.digest('archive-standings:' || week.nfl_week::text, 'sha256'), 'hex'),
  'FINAL'
from archive_weeks as week
where week.nfl_week <= 14;

insert into private.playoff_publications (
  id, season_id, league_id, week14_standings_snapshot_id,
  ruleset_snapshot_id, roster_size, expected_qualifier_count,
  standings_json, qualifiers, bracket_json, input_hash, created_by,
  version, source_result_version_ids
)
select
  'c8000000-0000-4000-8000-000000000001',
  'c3500000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  'c6000000-0000-4000-8000-000000000014',
  'c3000000-0000-4000-8000-000000000001',
  4, 4, standing.ordered_rows,
  (
    select jsonb_agg(jsonb_build_object(
      'entryId', member.entry_id,
      'displayName', member.display_name,
      'seed', member.seed,
      'regularSeasonSeed', member.seed,
      'qualificationSeed', member.seed,
      'wins', 15 - member.seed,
      'losses', member.seed - 1,
      'ties', 0,
      'pointsForCenticredits', 1500000 - member.seed * 10000,
      'allPlayHalfWinUnits', 100 - member.seed,
      'allPlayComparisonCount', 126,
      'attendanceMisses', 0,
      'highestWeekCenticredits', 150000 - member.seed * 1000,
      'deterministicTiebreak', repeat(to_hex(member.seed), 64)
    ) order by member.seed)
    from archive_members as member
  ),
  '{"format":"SMALL_FOUR","tieRule":"HIGHER_QUALIFICATION_SEED_ADVANCES","stages":[]}',
  repeat('5', 64),
  'c1000000-0000-4000-8000-000000000001',
  1,
  '{}'::uuid[]
from private.standings_snapshots as standing
where standing.id = 'c6000000-0000-4000-8000-000000000014';

insert into private.live_odds_imports (
  id, season_id, league_id, source, sport_key, fetched_at,
  normalized_json, payload_hash, event_count, imported_by
)
select
  ('c9000000-0000-4000-8000-' || lpad(week::text, 12, '0'))::uuid,
  'c3500000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  'THE_ODDS_API', 'americanfootball_nfl', now() - interval '1 week',
  jsonb_build_object('events', jsonb_build_array(jsonb_build_object('week', week))),
  encode(extensions.digest('archive-import:' || week::text, 'sha256'), 'hex'),
  1, 'c1000000-0000-4000-8000-000000000001'
from generate_series(15, 17) as week;

insert into private.playoff_round_publications (
  id, playoff_publication_id, season_id, league_id, week_id,
  live_odds_import_id, nfl_week, stage_scope,
  selected_external_event_ids, participant_entry_ids, matchups_json,
  source_result_version_ids, input_hash, created_by, version
)
select
  ('ca000000-0000-4000-8000-' || lpad(week.nfl_week::text, 12, '0'))::uuid,
  'c8000000-0000-4000-8000-000000000001',
  'c3500000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001', week.week_id,
  ('c9000000-0000-4000-8000-' || lpad(week.nfl_week::text, 12, '0'))::uuid,
  week.nfl_week,
  case when week.nfl_week = 15 then 'EXHIBITION' else 'PLAYOFF' end,
  array['archive-event-' || week.nfl_week::text],
  (select array_agg(entry_id order by seed) from archive_members),
  case when week.nfl_week = 15 then
    '[{"game":1,"label":"Week 15 exhibition"},{"game":2,"label":"Week 15 exhibition"}]'::jsonb
  when week.nfl_week = 16 then
    '[{"game":1,"label":"Semifinal · 1 vs 4"},{"game":2,"label":"Semifinal · 2 vs 3"}]'::jsonb
  else
    '[{"game":1,"label":"Championship"},{"game":2,"label":"Third place"}]'::jsonb
  end,
  '{}'::uuid[],
  encode(extensions.digest('archive-round:' || week.nfl_week::text, 'sha256'), 'hex'),
  'c1000000-0000-4000-8000-000000000001',
  1
from archive_weeks as week
where week.nfl_week between 15 and 17;

insert into private.matchups (
  week_id, season_id, league_id, schedule_publication_id,
  playoff_round_publication_id, side_a_entry_id, side_b_entry_id,
  scope, postseason_role, display_order
)
select
  week.week_id,
  'c3500000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  'c7000000-0000-4000-8000-000000000001', null,
  side_a.entry_id, side_b.entry_id, 'REGULAR', null, game
from archive_weeks as week
cross join generate_series(1, 2) as game
join archive_members as side_a on side_a.seed = game * 2 - 1
join archive_members as side_b on side_b.seed = game * 2
where week.nfl_week <= 14;

insert into private.matchups (
  week_id, season_id, league_id, schedule_publication_id,
  playoff_round_publication_id, side_a_entry_id, side_b_entry_id,
  scope, display_order
)
select
  week.week_id,
  'c3500000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001', null,
  ('ca000000-0000-4000-8000-' || lpad(week.nfl_week::text, 12, '0'))::uuid,
  side_a.entry_id, side_b.entry_id,
  case
    when week.nfl_week = 15 then 'EXHIBITION'
    when week.nfl_week = 17 and game = 2 then 'PLACEMENT'
    else 'PLAYOFF'
  end,
  case
    when week.nfl_week = 15 then 'EXHIBITION'
    when week.nfl_week = 17 and game = 2 then 'THIRD_PLACE'
    else 'CHAMPIONSHIP'
  end,
  game
from archive_weeks as week
cross join generate_series(1, 2) as game
join archive_members as side_a on side_a.seed = case
  when week.nfl_week = 16 and game = 1 then 1
  when week.nfl_week = 16 and game = 2 then 2
  when week.nfl_week = 17 and game = 1 then 1
  when week.nfl_week = 17 and game = 2 then 4
  else game * 2 - 1 end
join archive_members as side_b on side_b.seed = case
  when week.nfl_week = 16 and game = 1 then 4
  when week.nfl_week = 16 and game = 2 then 3
  when week.nfl_week = 17 and game = 1 then 2
  when week.nfl_week = 17 and game = 2 then 3
  else game * 2 end
where week.nfl_week between 15 and 17;

insert into private.weekly_cards (
  id, week_id, season_id, league_id, entry_id, owner_user_id,
  granted_credits, granted_at, compliance, locked_at
)
select
  gen_random_uuid(), week.week_id,
  'c3500000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  member.entry_id, member.user_id, 1000,
  now() - interval '20 weeks', 'INCOMPLETE', now() - interval '19 weeks'
from archive_weeks as week
cross join archive_members as member;

insert into private.weekly_score_versions (
  id, card_id, week_id, league_id, entry_id, input_hash, compliance,
  score_centicredits, is_complete, status
)
select
  gen_random_uuid(), card.id, card.week_id, card.league_id, card.entry_id,
  encode(extensions.digest(card.id::text || ':archive-score', 'sha256'), 'hex'),
  'INCOMPLETE', 0, false, 'FINAL'
from private.weekly_cards as card
where card.season_id = 'c3500000-0000-4000-8000-000000000001';

insert into private.matchup_result_versions (
  matchup_id, week_id, league_id, side_a_score_version_id,
  side_b_score_version_id, side_a_decision, side_b_decision,
  side_a_points_for_centicredits, side_b_points_for_centicredits,
  input_hash, status
)
select
  matchup.id, matchup.week_id, matchup.league_id,
  side_a_score.id, side_b_score.id,
  case
    when week.nfl_week = 17 and matchup.postseason_role = 'CHAMPIONSHIP'
      then 'WIN'
    when week.nfl_week = 17 and matchup.postseason_role = 'THIRD_PLACE'
      then 'TIE'
    else 'LOSS'
  end,
  case
    when week.nfl_week = 17 and matchup.postseason_role = 'CHAMPIONSHIP'
      then 'LOSS'
    when week.nfl_week = 17 and matchup.postseason_role = 'THIRD_PLACE'
      then 'TIE'
    else 'LOSS'
  end,
  case
    when week.nfl_week = 17 and matchup.postseason_role = 'CHAMPIONSHIP'
      then 100000
    when week.nfl_week = 17 and matchup.postseason_role = 'THIRD_PLACE'
      then 80000
    else 0
  end,
  case
    when week.nfl_week = 17 and matchup.postseason_role = 'CHAMPIONSHIP'
      then 90000
    when week.nfl_week = 17 and matchup.postseason_role = 'THIRD_PLACE'
      then 80000
    else 0
  end,
  encode(extensions.digest(matchup.id::text || ':archive-result', 'sha256'), 'hex'),
  'FINAL'
from private.matchups as matchup
join private.season_weeks as week on week.id = matchup.week_id
join private.weekly_cards as side_a_card
  on side_a_card.week_id = matchup.week_id
 and side_a_card.entry_id = matchup.side_a_entry_id
join private.weekly_cards as side_b_card
  on side_b_card.week_id = matchup.week_id
 and side_b_card.entry_id = matchup.side_b_entry_id
join private.weekly_score_versions as side_a_score
  on side_a_score.card_id = side_a_card.id
join private.weekly_score_versions as side_b_score
  on side_b_score.card_id = side_b_card.id
where matchup.season_id = 'c3500000-0000-4000-8000-000000000001';

select set_config(
  'request.jwt.claims',
  '{"sub":"c1000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
select throws_ok(
  $$select api.publish_live_season_archive(
    'c2000000-0000-4000-8000-000000000001',
    'member-cannot-publish-archive'
  )$$,
  '42501',
  'Commissioner membership required.',
  'a regular member cannot publish the final archive'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select api.publish_live_season_archive(
    'c2000000-0000-4000-8000-000000000001',
    'publish-final-live-archive'
  )$$,
  '55000',
  'Week 18 must be final before the complete archive can publish.',
  'the commissioner cannot publish a complete archive from Week 17'
);
select is(
  (select lifecycle from private.seasons
   where id = 'c3500000-0000-4000-8000-000000000001'),
  'PLAYOFFS',
  'a refused Week 17 archive leaves lifecycle unchanged'
);
select is(
  (select count(*)::integer from private.season_archive_versions
   where season_id = 'c3500000-0000-4000-8000-000000000001'),
  0,
  'no complete archive exists during the Week 17 playoff state'
);

select is(
  api.finalize_champion_bracket(
    'c2000000-0000-4000-8000-000000000001',
    'finalize-champion-bracket'
  ) ->> 'lifecycle',
  'CHAMPION_FINAL',
  'the commissioner finalizes the champion after the Week 17 correction window'
);
select is(
  api.finalize_champion_bracket(
    'c2000000-0000-4000-8000-000000000001',
    'finalize-champion-bracket'
  ) ->> 'publicationId',
  (
    select publication.id::text
    from private.playoff_publications as publication
    where publication.season_id = 'c3500000-0000-4000-8000-000000000001'
      and publication.publication_stage = 'CHAMPION_FINAL'
  ),
  'champion finalization replays idempotently after its lifecycle transition'
);
select is(
  (select lifecycle from private.seasons
   where id = 'c3500000-0000-4000-8000-000000000001'),
  'CHAMPION_FINAL',
  'champion finality is a stored state distinct from final archive publication'
);
select is(
  (
    select champion_entry_id::text
    from private.playoff_publications as publication
    where publication.season_id = 'c3500000-0000-4000-8000-000000000001'
      and publication.publication_stage = 'CHAMPION_FINAL'
  ),
  'c4000000-0000-4000-8000-000000000001',
  'the champion is derived from the terminal Week 17 championship result'
);
select is(
  (
    select third_place_tied
    from private.playoff_publications as publication
    where publication.season_id = 'c3500000-0000-4000-8000-000000000001'
      and publication.publication_stage = 'CHAMPION_FINAL'
  ),
  true,
  'a compliant third-place tie remains explicitly tied'
);
select is(
  (select count(*)::integer from private.season_archive_versions
   where season_id = 'c3500000-0000-4000-8000-000000000001'),
  0,
  'the complete archive remains absent during champion finality'
);
select is(
  (
    select jsonb_array_length(
      private.build_phase8b_postseason_round(publication.id, 18) -> 'games'
    )
    from private.playoff_publications as publication
    where publication.season_id = 'c3500000-0000-4000-8000-000000000001'
      and publication.publication_stage = 'CHAMPION_FINAL'
  ),
  2,
  'the stored four-member placement derives two Week 18 exhibitions'
);
select is(
  (
    select private.build_phase8b_postseason_round(publication.id, 18)
      #>> '{games,0,sideA,entryId}'
    from private.playoff_publications as publication
    where publication.season_id = 'c3500000-0000-4000-8000-000000000001'
      and publication.publication_stage = 'CHAMPION_FINAL'
  ),
  'c4000000-0000-4000-8000-000000000001',
  'Week 18 adjacent pairing begins with the champion'
);
select is(
  (
    select private.build_phase8b_postseason_round(publication.id, 18)
      #>> '{games,0,sideB,entryId}'
    from private.playoff_publications as publication
    where publication.season_id = 'c3500000-0000-4000-8000-000000000001'
      and publication.publication_stage = 'CHAMPION_FINAL'
  ),
  'c4000000-0000-4000-8000-000000000002',
  'Week 18 pairs the runner-up adjacent to the champion'
);
select throws_ok(
  $$select api.publish_live_season_archive(
    'c2000000-0000-4000-8000-000000000001',
    'champion-final-cannot-publish-archive'
  )$$,
  '55000',
  'Week 18 must be final before the complete archive can publish.',
  'champion finality still cannot publish a complete archive'
);

insert into private.season_archive_versions (
  id, season_id, league_id, ruleset_snapshot_id, schedule_publication_id,
  terminal_bracket_publication_id, championship_result_version_id,
  third_place_result_version_id, champion_entry_id, runner_up_entry_id,
  third_place_entry_id, third_place_tied, archive_hash, archive_json,
  published_by, archive_schema_version, version
)
select
  'cf000000-0000-4000-8000-000000000001',
  'c3500000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000001',
  'c7000000-0000-4000-8000-000000000001',
  'c8000000-0000-4000-8000-000000000001',
  championship.id, third_place.id,
  'c4000000-0000-4000-8000-000000000001',
  'c4000000-0000-4000-8000-000000000002',
  null, true, repeat('f', 64), '{"schemaVersion":1}'::jsonb,
  'c1000000-0000-4000-8000-000000000001', 1, 1
from private.matchup_result_versions as championship
join private.matchups as championship_matchup
  on championship_matchup.id = championship.matchup_id
 and championship_matchup.scope = 'PLAYOFF'
join private.matchup_result_versions as third_place on true
join private.matchups as third_place_matchup
  on third_place_matchup.id = third_place.matchup_id
 and third_place_matchup.scope = 'PLACEMENT'
where championship.week_id = 'c5000000-0000-4000-8000-000000000017'
  and third_place.week_id = 'c5000000-0000-4000-8000-000000000017'
limit 1;

insert into auth.users (id, email) values (
  'c1000000-0000-4000-8000-000000000099',
  'archive-nonmember@example.test'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c1000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from private.season_archive_versions
   where season_id = 'c3500000-0000-4000-8000-000000000001'),
  1,
  'an exact league member can read the legacy archive root'
);
select throws_ok(
  $$insert into private.season_archive_versions (
      id, season_id, league_id, ruleset_snapshot_id,
      schedule_publication_id, terminal_bracket_publication_id,
      championship_result_version_id, third_place_result_version_id,
      champion_entry_id, runner_up_entry_id, third_place_entry_id,
      third_place_tied, archive_hash, archive_json, published_by,
      archive_schema_version, version
    ) select
      gen_random_uuid(), season_id, league_id, ruleset_snapshot_id,
      schedule_publication_id, terminal_bracket_publication_id,
      championship_result_version_id, third_place_result_version_id,
      champion_entry_id, runner_up_entry_id, third_place_entry_id,
      third_place_tied, repeat('e', 64), archive_json, published_by,
      archive_schema_version, version + 1
    from private.season_archive_versions
    where season_id = 'c3500000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'a league member cannot insert an archive version directly'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"c1000000-0000-4000-8000-000000000099","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from private.season_archive_versions),
  0,
  'an authenticated nonmember cannot read another league archive'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select * from private.season_archive_versions$$,
  '42501',
  null,
  'anonymous callers cannot read the archive relation'
);

reset role;

select throws_ok(
  $$update private.season_archive_versions
    set archive_json = archive_json || '{"tampered":true}'::jsonb
    where season_id = 'c3500000-0000-4000-8000-000000000001'$$,
  '55000',
  'season_archive_versions is append-only.',
  'a legacy archive root rejects mutation'
);

select * from finish();
rollback;
