-- Read-only Phase 2 gate. Run before applying the standings migration.
-- Any row with order_could_change = true requires an owner-approved transition
-- decision before the migration may be applied.

with active_seasons as (
  select
    league.id as league_id,
    league.slug as league_slug,
    season.id as season_id
  from private.leagues as league
  join private.seasons as season on season.league_id = league.id
  where season.lifecycle in ('REGULAR', 'PLAYOFFS')
    and league.archived_at is null
), latest_official as (
  select
    active.*,
    standings.id as standings_snapshot_id,
    standings.through_week,
    standings.ordered_rows
  from active_seasons as active
  join lateral (
    select candidate.*
    from private.standings_snapshots as candidate
    where candidate.season_id = active.season_id
      and candidate.status = 'FINAL'
    order by candidate.through_week desc, candidate.created_at desc, candidate.id desc
    limit 1
  ) as standings on true
), standing_rows as (
  select
    official.league_id,
    official.league_slug,
    official.season_id,
    official.standings_snapshot_id,
    official.through_week,
    row.ordinality::integer as official_seed,
    (row.value ->> 'entryId')::uuid as entry_id,
    (row.value ->> 'wins')::integer as wins,
    (row.value ->> 'losses')::integer as losses,
    (row.value ->> 'ties')::integer as ties,
    (row.value ->> 'pointsForCenticredits')::bigint as points_for_centicredits,
    (row.value ->> 'allPlayHalfWinUnits')::integer as all_play_half_win_units,
    (row.value ->> 'allPlayComparisonCount')::integer as all_play_comparison_count,
    (row.value ->> 'headToHeadHalfWinUnits')::integer as head_to_head_half_win_units,
    (row.value ->> 'headToHeadComparisonCount')::integer as head_to_head_comparison_count,
    (row.value ->> 'attendanceMisses')::integer as attendance_misses,
    (row.value ->> 'highestWeekCenticredits')::bigint as highest_week_centicredits,
    row.value ->> 'deterministicTiebreak' as deterministic_tiebreak,
    ((row.value ->> 'wins')::integer * 2 + (row.value ->> 'ties')::integer)::numeric
      / nullif(
        (
          (row.value ->> 'wins')::integer
          + (row.value ->> 'losses')::integer
          + (row.value ->> 'ties')::integer
        ) * 2,
        0
      ) as win_percentage,
    (row.value ->> 'allPlayHalfWinUnits')::numeric
      / nullif((row.value ->> 'allPlayComparisonCount')::integer * 2, 0)
      as all_play_percentage
  from latest_official as official,
    jsonb_array_elements(official.ordered_rows) with ordinality as row(value, ordinality)
), grouped as (
  select
    standing.*,
    dense_rank() over (
      partition by standing.season_id
      order by
        standing.win_percentage desc nulls last,
        standing.points_for_centicredits desc,
        standing.all_play_percentage desc nulls last
    ) as primary_group,
    count(*) over (
      partition by
        standing.season_id,
        standing.win_percentage,
        standing.points_for_centicredits,
        standing.all_play_percentage
    )::integer as primary_group_size
  from standing_rows as standing
), latest_results as (
  select distinct on (matchup.id)
    grouped.season_id,
    grouped.through_week,
    matchup.id as matchup_id,
    matchup.side_a_entry_id,
    matchup.side_b_entry_id
  from grouped
  join private.season_weeks as week
    on week.season_id = grouped.season_id
   and week.scope = 'REGULAR'
   and week.nfl_week <= grouped.through_week
  join private.matchups as matchup on matchup.week_id = week.id
  join private.matchup_result_versions as result on result.matchup_id = matchup.id
  order by matchup.id, result.created_at desc, result.id desc
), pair_counts as (
  select
    first.season_id,
    first.primary_group,
    least(result.side_a_entry_id, result.side_b_entry_id) as first_entry_id,
    greatest(result.side_a_entry_id, result.side_b_entry_id) as second_entry_id,
    count(*)::integer as meeting_count
  from latest_results as result
  join grouped as first
    on first.season_id = result.season_id
   and first.entry_id = result.side_a_entry_id
  join grouped as second
    on second.season_id = result.season_id
   and second.entry_id = result.side_b_entry_id
   and second.primary_group = first.primary_group
  where first.primary_group_size > 1
  group by
    first.season_id,
    first.primary_group,
    least(result.side_a_entry_id, result.side_b_entry_id),
    greatest(result.side_a_entry_id, result.side_b_entry_id)
), member_meeting_counts as (
  select
    pair.season_id,
    pair.primary_group,
    member.entry_id,
    sum(pair.meeting_count)::integer as meeting_count
  from pair_counts as pair
  cross join lateral (
    values (pair.first_entry_id), (pair.second_entry_id)
  ) as member(entry_id)
  group by pair.season_id, pair.primary_group, member.entry_id
), tied_group_summary as (
  select
    tied.league_slug,
    tied.season_id,
    tied.standings_snapshot_id,
    tied.through_week,
    tied.primary_group,
    tied.primary_group_size,
    jsonb_agg(tied.entry_id order by tied.official_seed) as current_official_order,
    count(distinct (
      tied.head_to_head_half_win_units::numeric
        / nullif(tied.head_to_head_comparison_count * 2, 0)
    )) > 1 as head_to_head_would_separate_group
  from grouped as tied
  where tied.primary_group_size > 1
  group by
    tied.league_slug,
    tied.season_id,
    tied.standings_snapshot_id,
    tied.through_week,
    tied.primary_group,
    tied.primary_group_size
), legacy_applicability as (
  select
    member.season_id,
    member.primary_group,
    count(*)::integer as represented_members,
    min(member.meeting_count) > 0
      and min(member.meeting_count) = max(member.meeting_count) as applies
  from member_meeting_counts as member
  group by member.season_id, member.primary_group
), corrected_applicability as (
  select
    pair.season_id,
    pair.primary_group,
    count(*)::integer as represented_pairs,
    min(pair.meeting_count) > 0
      and min(pair.meeting_count) = max(pair.meeting_count) as applies,
    jsonb_agg(
      jsonb_build_object(
        'firstEntryId', pair.first_entry_id,
        'secondEntryId', pair.second_entry_id,
        'meetingCount', pair.meeting_count
      ) order by pair.first_entry_id, pair.second_entry_id
    ) as unordered_pair_counts
  from pair_counts as pair
  group by pair.season_id, pair.primary_group
), group_summary as (
  select
    tied.*,
    coalesce(
      legacy.represented_members = tied.primary_group_size and legacy.applies,
      false
    ) as legacy_member_total_check_applies,
    coalesce(
      corrected.represented_pairs
        = (tied.primary_group_size * (tied.primary_group_size - 1)) / 2
        and corrected.applies,
      false
    ) as corrected_pair_check_applies,
    coalesce(corrected.unordered_pair_counts, '[]'::jsonb) as unordered_pair_counts
  from tied_group_summary as tied
  left join legacy_applicability as legacy
    on legacy.season_id = tied.season_id
   and legacy.primary_group = tied.primary_group
  left join corrected_applicability as corrected
    on corrected.season_id = tied.season_id
   and corrected.primary_group = tied.primary_group
)
select
  league_slug,
  season_id,
  standings_snapshot_id,
  through_week,
  primary_group,
  primary_group_size,
  current_official_order,
  unordered_pair_counts,
  legacy_member_total_check_applies,
  corrected_pair_check_applies,
  head_to_head_would_separate_group,
  legacy_member_total_check_applies
    and not corrected_pair_check_applies
    and head_to_head_would_separate_group as order_could_change
from group_summary
order by league_slug, through_week, primary_group;
