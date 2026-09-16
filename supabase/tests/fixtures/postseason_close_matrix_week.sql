create or replace function pg_temp.phase8_close_matrix_week(
  p_season_id uuid,
  p_week integer
)
returns void
language plpgsql
volatile
as $$
declare
  v_week private.season_weeks%rowtype;
begin
  select week.* into strict v_week
  from private.season_weeks as week
  where week.season_id = p_season_id and week.nfl_week = p_week;

  update private.weekly_cards
  set compliance = 'INCOMPLETE', locked_at = clock_timestamp()
  where week_id = v_week.id;

  insert into private.weekly_score_versions (
    card_id, week_id, league_id, entry_id, input_hash, compliance,
    score_centicredits, is_complete, status
  )
  select
    card.id, card.week_id, card.league_id, card.entry_id,
    encode(extensions.digest(card.id::text || ':matrix-final', 'sha256'), 'hex'),
    'INCOMPLETE', 0, false, 'FINAL'
  from private.weekly_cards as card
  where card.week_id = v_week.id;

  insert into private.matchup_result_versions (
    matchup_id, week_id, league_id, side_a_score_version_id,
    side_b_score_version_id, side_a_decision, side_b_decision,
    side_a_points_for_centicredits, side_b_points_for_centicredits,
    input_hash, status
  )
  select
    matchup.id, matchup.week_id, matchup.league_id,
    side_a_score.id, side_b_score.id,
    case when matchup.postseason_role = 'THIRD_PLACE' then 'TIE' else 'LOSS' end,
    case when matchup.postseason_role = 'THIRD_PLACE' then 'TIE' else 'LOSS' end,
    0, 0,
    encode(extensions.digest(matchup.id::text || ':matrix-final', 'sha256'), 'hex'),
    'FINAL'
  from private.matchups as matchup
  join private.weekly_score_versions as side_a_score
    on side_a_score.week_id = matchup.week_id
   and side_a_score.entry_id = matchup.side_a_entry_id
   and side_a_score.status = 'FINAL'
  join private.weekly_score_versions as side_b_score
    on side_b_score.week_id = matchup.week_id
   and side_b_score.entry_id = matchup.side_b_entry_id
   and side_b_score.status = 'FINAL'
  where matchup.week_id = v_week.id;

  update private.season_weeks
  set state = 'FINAL',
      locked_at = clock_timestamp(),
      correction_window_closes_at = now() - interval '1 second'
  where id = v_week.id;
end;
$$;

