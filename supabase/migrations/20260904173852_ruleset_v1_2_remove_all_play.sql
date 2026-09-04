-- Ruleset V1.2 removes All-play from prospective standings while preserving
-- every frozen V1.1 snapshot and its historical ordering.

do $migration$
declare
  v_live_previous jsonb;
  v_simulation_previous jsonb;
  v_live jsonb;
  v_simulation jsonb;
  v_updated integer;
  v_tiebreak_order jsonb := '["MATCHUP_WIN_PERCENTAGE", "POINTS_FOR", "BALANCED_HEAD_TO_HEAD", "FEWER_ATTENDANCE_MISSES", "HIGHEST_SINGLE_WEEK_SCORE", "STORED_DETERMINISTIC_RANDOM"]'::jsonb;
begin
  select canonical_json
  into v_live_previous
  from private.authoritative_season_rulesets
  where mode = 'LIVE'
    and ruleset_version = '1.1'
    and product_bible_version = '3.0'
    and sha256_hash = '047550e7661915d3ba4d8e4046f85ab9474eac7b857fbba398cb4d9b91a5766c';

  select canonical_json
  into v_simulation_previous
  from private.authoritative_season_rulesets
  where mode = 'SIMULATION'
    and ruleset_version = '1.1'
    and product_bible_version = '3.0'
    and sha256_hash = '64772aad744ed8d5ec12b9e43e1303a610fc92051c250204bffb20c00f5e7a7d';

  if v_live_previous is null or v_simulation_previous is null then
    raise exception 'Ruleset V1.2 requires the exact expanded V1.1 catalog';
  end if;

  v_live := jsonb_set(
    jsonb_set(
      jsonb_set(v_live_previous, '{version}', '"1.2"'::jsonb),
      '{productBibleVersion}',
      '"3.1"'::jsonb
    ),
    '{standings,tiebreakOrder}',
    v_tiebreak_order
  );
  v_simulation := jsonb_set(
    jsonb_set(
      jsonb_set(v_simulation_previous, '{version}', '"1.2"'::jsonb),
      '{productBibleVersion}',
      '"3.1"'::jsonb
    ),
    '{standings,tiebreakOrder}',
    v_tiebreak_order
  );

  update private.season_ruleset_snapshots as snapshot
  set ruleset_version = '1.2',
      product_bible_version = '3.1',
      canonical_json = case snapshot.mode
        when 'LIVE' then v_live
        else v_simulation
      end,
      sha256_hash = case snapshot.mode
        when 'LIVE' then '6d9c85a0763b8c140296bda409ed3eecbe0ac4b91466b3504dd23ff4489e4ac7'
        else 'd7b74cb761ca652fad2ffff32f6e20a16326434d7e0f19d86a7e32b6a818ef8b'
      end,
      published_at = clock_timestamp()
  where snapshot.frozen_at is null
    and snapshot.ruleset_version = '1.1'
    and snapshot.product_bible_version = '3.0'
    and snapshot.canonical_json = case snapshot.mode
      when 'LIVE' then v_live_previous
      else v_simulation_previous
    end
    and snapshot.sha256_hash = case snapshot.mode
      when 'LIVE' then '047550e7661915d3ba4d8e4046f85ab9474eac7b857fbba398cb4d9b91a5766c'
      else '64772aad744ed8d5ec12b9e43e1303a610fc92051c250204bffb20c00f5e7a7d'
    end;

  update private.authoritative_season_rulesets as authoritative
  set ruleset_version = '1.2',
      product_bible_version = '3.1',
      canonical_json = case authoritative.mode
        when 'LIVE' then v_live
        else v_simulation
      end,
      sha256_hash = case authoritative.mode
        when 'LIVE' then '6d9c85a0763b8c140296bda409ed3eecbe0ac4b91466b3504dd23ff4489e4ac7'
        else 'd7b74cb761ca652fad2ffff32f6e20a16326434d7e0f19d86a7e32b6a818ef8b'
      end
  where (authoritative.mode = 'LIVE'
      and authoritative.sha256_hash = '047550e7661915d3ba4d8e4046f85ab9474eac7b857fbba398cb4d9b91a5766c')
     or (authoritative.mode = 'SIMULATION'
      and authoritative.sha256_hash = '64772aad744ed8d5ec12b9e43e1303a610fc92051c250204bffb20c00f5e7a7d');

  get diagnostics v_updated = row_count;
  if v_updated <> 2 then
    raise exception 'Ruleset V1.2 expected to update two authoritative catalog rows, updated %', v_updated;
  end if;
end;
$migration$;

create or replace function private.build_regular_standings(p_week_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with current_week as (
    select
      week.season_id,
      week.nfl_week,
      coalesce(
        snapshot.canonical_json #> '{standings,tiebreakOrder}'
          ? 'ALL_PLAY_PERCENTAGE',
        false
      ) as uses_all_play
    from private.season_weeks as week
    join private.seasons as season on season.id = week.season_id
    join private.season_ruleset_snapshots as snapshot
      on snapshot.id = season.ruleset_snapshot_id
    where week.id = p_week_id
      and week.scope = 'REGULAR'
  ), latest_matchup_results as (
    select distinct on (result.matchup_id)
      result.*,
      week.nfl_week
    from private.matchup_result_versions as result
    join private.matchups as matchup on matchup.id = result.matchup_id
    join private.season_weeks as week on week.id = matchup.week_id
    join current_week on current_week.season_id = week.season_id
    where week.scope = 'REGULAR'
      and week.nfl_week <= current_week.nfl_week
    order by result.matchup_id, result.created_at desc, result.id desc
  ), entry_results as (
    select
      matchup.side_a_entry_id as entry_id,
      matchup.side_b_entry_id as opponent_entry_id,
      result.nfl_week,
      result.side_a_decision as decision,
      result.side_a_points_for_centicredits as points_for_centicredits
    from latest_matchup_results as result
    join private.matchups as matchup on matchup.id = result.matchup_id
    union all
    select
      matchup.side_b_entry_id,
      matchup.side_a_entry_id,
      result.nfl_week,
      result.side_b_decision,
      result.side_b_points_for_centicredits
    from latest_matchup_results as result
    join private.matchups as matchup on matchup.id = result.matchup_id
  ), latest_scores as (
    select distinct on (score.week_id, score.entry_id)
      score.week_id,
      week.nfl_week,
      score.entry_id,
      score.compliance,
      score.score_centicredits
    from private.weekly_score_versions as score
    join private.season_weeks as week on week.id = score.week_id
    join current_week on current_week.season_id = week.season_id
    where week.scope = 'REGULAR'
      and week.nfl_week <= current_week.nfl_week
    order by score.week_id, score.entry_id, score.created_at desc, score.id desc
  ), all_play_weekly as (
    select
      score.entry_id,
      count(other.entry_id)::integer as comparison_count,
      coalesce(sum(
        case
          when score.score_centicredits > other.score_centicredits then 2
          when score.score_centicredits = other.score_centicredits then 1
          else 0
        end
      ), 0)::integer as half_win_units
    from latest_scores as score
    join latest_scores as other
      on other.week_id = score.week_id
     and other.entry_id <> score.entry_id
     and other.compliance = 'COMPLIANT'
    where score.compliance = 'COMPLIANT'
      and (select uses_all_play from current_week)
    group by score.week_id, score.entry_id
  ), all_play_totals as (
    select
      weekly.entry_id,
      sum(weekly.comparison_count)::integer as comparison_count,
      sum(weekly.half_win_units)::integer as half_win_units
    from all_play_weekly as weekly
    group by weekly.entry_id
  ), record_totals as (
    select
      entry.id as entry_id,
      profile.display_name,
      count(*) filter (where result.decision = 'WIN')::integer as wins,
      count(*) filter (where result.decision = 'LOSS')::integer as losses,
      count(*) filter (where result.decision = 'TIE')::integer as ties,
      coalesce(sum(result.points_for_centicredits), 0)::bigint as points_for_centicredits,
      count(*) filter (where score.compliance = 'INCOMPLETE')::integer as attendance_misses,
      coalesce(max(score.score_centicredits), 0)::bigint as highest_week_centicredits,
      coalesce(all_play.half_win_units, 0)::integer as all_play_half_win_units,
      coalesce(all_play.comparison_count, 0)::integer as all_play_comparison_count,
      current_week.uses_all_play,
      entry.standing_tiebreak
    from current_week
    join private.season_entries as entry on entry.season_id = current_week.season_id
    join private.profiles as profile on profile.id = entry.user_id
    left join entry_results as result on result.entry_id = entry.id
    left join latest_scores as score on score.entry_id = entry.id
      and score.nfl_week = result.nfl_week
    left join all_play_totals as all_play on all_play.entry_id = entry.id
    group by
      entry.id,
      profile.display_name,
      entry.standing_tiebreak,
      current_week.uses_all_play,
      all_play.half_win_units,
      all_play.comparison_count
  ), primary_metrics as (
    select
      totals.*,
      totals.wins + totals.losses + totals.ties as games,
      (totals.wins * 2 + totals.ties)::numeric
        / nullif((totals.wins + totals.losses + totals.ties) * 2, 0) as win_percentage,
      totals.all_play_half_win_units::numeric
        / nullif(totals.all_play_comparison_count * 2, 0) as all_play_percentage
    from record_totals as totals
  ), grouped as (
    select
      metrics.*,
      dense_rank() over (
        order by
          metrics.win_percentage desc nulls last,
          metrics.points_for_centicredits desc,
          case when metrics.uses_all_play then metrics.all_play_percentage end
            desc nulls last
      ) as primary_group,
      count(*) over (
        partition by
          metrics.win_percentage,
          metrics.points_for_centicredits,
          case when metrics.uses_all_play then metrics.all_play_percentage end
      )::integer as primary_group_size
    from primary_metrics as metrics
  ), head_to_head_totals as (
    select
      tied.primary_group,
      result.entry_id,
      count(*)::integer as comparison_count,
      sum(case result.decision when 'WIN' then 2 when 'TIE' then 1 else 0 end)::integer
        as half_win_units
    from grouped as tied
    join entry_results as result on result.entry_id = tied.entry_id
    join grouped as opponent
      on opponent.entry_id = result.opponent_entry_id
     and opponent.primary_group = tied.primary_group
    where tied.primary_group_size > 1
    group by tied.primary_group, result.entry_id
  ), head_to_head_pair_counts as (
    select
      tied.primary_group,
      result.entry_id as first_entry_id,
      result.opponent_entry_id as second_entry_id,
      count(*)::integer as meeting_count
    from grouped as tied
    join entry_results as result on result.entry_id = tied.entry_id
    join grouped as opponent
      on opponent.entry_id = result.opponent_entry_id
     and opponent.primary_group = tied.primary_group
    where tied.primary_group_size > 1
      and result.entry_id < result.opponent_entry_id
    group by
      tied.primary_group,
      result.entry_id,
      result.opponent_entry_id
  ), head_to_head_applicability as (
    select
      tied.primary_group,
      private.head_to_head_group_is_balanced(
        tied.primary_group_size,
        array_agg(pair.meeting_count order by pair.first_entry_id, pair.second_entry_id)
          filter (where pair.first_entry_id is not null)
      ) as applies
    from (
      select distinct primary_group, primary_group_size
      from grouped
      where primary_group_size > 1
    ) as tied
    left join head_to_head_pair_counts as pair
      on pair.primary_group = tied.primary_group
    group by tied.primary_group, tied.primary_group_size
  ), ranked as (
    select
      tied.*,
      coalesce(head_to_head.half_win_units, 0)::integer as head_to_head_half_win_units,
      coalesce(head_to_head.comparison_count, 0)::integer as head_to_head_comparison_count,
      coalesce(applicability.applies, false) as head_to_head_applied,
      row_number() over (
        order by
          tied.win_percentage desc nulls last,
          tied.points_for_centicredits desc,
          case when tied.uses_all_play then tied.all_play_percentage end
            desc nulls last,
          case when applicability.applies then
            head_to_head.half_win_units::numeric
              / nullif(head_to_head.comparison_count * 2, 0)
          end desc nulls last,
          tied.attendance_misses asc,
          tied.highest_week_centicredits desc,
          tied.standing_tiebreak asc
      ) as seed
    from grouped as tied
    left join head_to_head_totals as head_to_head
      on head_to_head.primary_group = tied.primary_group
     and head_to_head.entry_id = tied.entry_id
    left join head_to_head_applicability as applicability
      on applicability.primary_group = tied.primary_group
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'seed', ranked.seed,
      'entryId', ranked.entry_id,
      'displayName', ranked.display_name,
      'wins', ranked.wins,
      'losses', ranked.losses,
      'ties', ranked.ties,
      'pointsForCenticredits', ranked.points_for_centicredits,
      'allPlayHalfWinUnits', ranked.all_play_half_win_units,
      'allPlayComparisonCount', ranked.all_play_comparison_count,
      'headToHeadApplied', ranked.head_to_head_applied,
      'headToHeadHalfWinUnits', ranked.head_to_head_half_win_units,
      'headToHeadComparisonCount', ranked.head_to_head_comparison_count,
      'attendanceMisses', ranked.attendance_misses,
      'highestWeekCenticredits', ranked.highest_week_centicredits,
      'deterministicTiebreak', ranked.standing_tiebreak
    ) order by ranked.seed
  ), '[]'::jsonb)
  from ranked;
$$;

revoke execute on function private.build_regular_standings(uuid)
from public, anon, authenticated;

notify pgrst, 'reload schema';
