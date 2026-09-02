-- Stage 3: materialize each remaining regular-season week from the frozen
-- schedule only after the previous week is final. Every week receives a new
-- immutable slate and a fresh 1,000-credit card per frozen season entry.

create or replace function private.build_regular_standings(p_week_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with current_week as (
    select week.season_id, week.nfl_week
    from private.season_weeks as week
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
          metrics.all_play_percentage desc nulls last
      ) as primary_group,
      count(*) over (
        partition by
          metrics.win_percentage,
          metrics.points_for_centicredits,
          metrics.all_play_percentage
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
  ), head_to_head_applicability as (
    select
      tied.primary_group,
      tied.primary_group_size > 1
        and count(head_to_head.entry_id) = tied.primary_group_size
        and min(head_to_head.comparison_count) > 0
        and min(head_to_head.comparison_count) = max(head_to_head.comparison_count)
        as applies
    from grouped as tied
    left join head_to_head_totals as head_to_head
      on head_to_head.primary_group = tied.primary_group
     and head_to_head.entry_id = tied.entry_id
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
          tied.all_play_percentage desc nulls last,
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

-- Replace the original single-week standings section without duplicating the
-- settlement and matchup ledger. The guard aborts if an earlier migration has
-- changed the expected function shape.
do $migration$
declare
  v_definition text;
  v_start integer;
  v_finish integer;
  v_replacement text := $replacement$
    v_standings_rows := private.build_regular_standings(p_week_id);

    select coalesce(
      string_agg(result.id::text, ',' order by result.nfl_week, result.matchup_id),
      ''
    )
    into v_standings_input
    from (
      select distinct on (candidate.matchup_id)
        candidate.id,
        candidate.matchup_id,
        week.nfl_week
      from private.matchup_result_versions as candidate
      join private.season_weeks as week on week.id = candidate.week_id
      where week.season_id = v_week.season_id
        and week.scope = 'REGULAR'
        and week.nfl_week <= v_week.nfl_week
      order by candidate.matchup_id, candidate.created_at desc, candidate.id desc
    ) as result;

$replacement$;
begin
  select pg_get_functiondef('private.recompute_stage1_week(uuid,uuid)'::regprocedure)
  into v_definition;

  v_start := strpos(v_definition, '    with latest_matchup_results as (');
  v_finish := strpos(v_definition, '    v_standings_hash := encode(');
  if v_start = 0 or v_finish = 0 or v_finish <= v_start then
    raise exception 'recompute_stage1_week standings shape changed; migration refused';
  end if;

  v_definition := substr(v_definition, 1, v_start - 1)
    || v_replacement
    || substr(v_definition, v_finish);
  execute v_definition;
end;
$migration$;

-- Existing Stage 1 RPC names remain stable for clients, but operational calls
-- now target the latest materialized regular-season week rather than Week 1.
do $migration$
declare
  v_signature regprocedure;
  v_definition text;
  v_old constant text := 'and week.nfl_week = 1';
  v_new constant text := $selector$and week.nfl_week = (
      select max(current_week.nfl_week)
      from private.season_weeks as current_week
      where current_week.season_id = v_season.id
        and current_week.scope = 'REGULAR'
    )$selector$;
  v_occurrences integer;
begin
  foreach v_signature in array array[
    'api.accept_stage1_card(text,jsonb,text)'::regprocedure,
    'api.finalize_stage1_week(uuid,text)'::regprocedure,
    'api.lock_stage1_week(uuid,text)'::regprocedure,
    'api.refresh_live_week_quotes(uuid,uuid,text)'::regprocedure,
    'api.get_live_quote_heads(text)'::regprocedure,
    'api.get_stage1_state(text)'::regprocedure,
    'api.import_live_scores(uuid,jsonb,text)'::regprocedure,
    'api.get_live_week_operations(text)'::regprocedure
  ] loop
    select pg_get_functiondef(v_signature) into v_definition;
    v_occurrences := (length(v_definition) - length(replace(v_definition, v_old, '')))
      / length(v_old);
    if v_occurrences <> 1 then
      raise exception '% expected one Week 1 selector, found %', v_signature, v_occurrences;
    end if;
    execute replace(v_definition, v_old, v_new);
  end loop;
end;
$migration$;

-- Report the actual roster size from the lock receipt.
do $migration$
declare
  v_definition text;
  v_old constant text := $old$'cardCount', 8$old$;
  v_new constant text := $new$'cardCount', (
      select count(*)
      from private.weekly_cards as card
      where card.week_id = v_week.id
    )$new$;
begin
  select pg_get_functiondef('api.lock_stage1_week(uuid,text)'::regprocedure)
  into v_definition;
  if strpos(v_definition, v_old) = 0 then
    raise exception 'lock_stage1_week card-count shape changed; migration refused';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$migration$;

-- Keep the most recent completed standings visible while the next week is
-- OPEN or LOCKED and replace it with the current provisional snapshot once all
-- matchups settle.
do $migration$
declare
  v_definition text;
  v_old constant text := $old$where standings.week_id = v_week.id
      order by standings.created_at desc, standings.id desc$old$;
  v_new constant text := $new$where standings.season_id = v_season.id
        and standings.through_week <= v_week.nfl_week
      order by standings.through_week desc, standings.created_at desc, standings.id desc$new$;
begin
  select pg_get_functiondef('api.get_stage1_state(text)'::regprocedure)
  into v_definition;
  if strpos(v_definition, v_old) = 0 then
    raise exception 'get_stage1_state standings shape changed; migration refused';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$migration$;

create or replace function api.publish_next_live_week_slate(
  p_league_id uuid,
  p_import_id uuid,
  p_external_event_ids text[],
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_season private.seasons%rowtype;
  v_previous_week private.season_weeks%rowtype;
  v_import private.live_odds_imports%rowtype;
  v_publication private.schedule_publications%rowtype;
  v_command private.command_receipts%rowtype;
  v_week_id uuid := gen_random_uuid();
  v_slate_id uuid := gen_random_uuid();
  v_selected_event_ids text[];
  v_selected_count integer;
  v_available_count integer;
  v_next_week integer;
  v_entry_count integer;
  v_matchup_count integer;
  v_card_count integer;
  v_request_hash text;
  v_published_at timestamptz := clock_timestamp();
  v_first_kickoff_at timestamptz;
  v_common_lock_at timestamptz;
  v_event_json jsonb;
  v_market_json jsonb;
  v_event_id uuid;
  v_snapshot_id uuid;
  v_line_milli integer;
  v_response jsonb;
begin
  if v_user_id is null or not private.is_league_commissioner(p_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;
  if char_length(p_idempotency_key) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'Idempotency key is invalid.';
  end if;
  if p_import_id is null
    or p_external_event_ids is null
    or cardinality(p_external_event_ids) not between 1 and 32 then
    raise exception using errcode = '22023', message = 'Select between one and 32 imported events.';
  end if;

  select array_agg(btrim(event_id) order by btrim(event_id))
  into v_selected_event_ids
  from unnest(p_external_event_ids) as selected(event_id);

  if exists (
    select 1
    from unnest(v_selected_event_ids) as selected(event_id)
    where selected.event_id = ''
  ) or (
    select count(*) from unnest(v_selected_event_ids)
  ) <> (
    select count(distinct event_id)
    from unnest(v_selected_event_ids) as selected(event_id)
  ) then
    raise exception using errcode = '22023', message = 'Selected event identifiers must be unique and non-empty.';
  end if;

  v_request_hash := encode(
    extensions.digest(
      p_league_id::text || ':' || p_import_id::text || ':'
      || array_to_string(v_selected_event_ids, ','),
      'sha256'
    ),
    'hex'
  );

  select command.* into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'PUBLISH_NEXT_LIVE_WEEK_SLATE'
    and command.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json;
  end if;

  select season.* into strict v_season
  from private.seasons as season
  where season.league_id = p_league_id
  order by season.created_at desc
  limit 1
  for update;

  if v_season.mode <> 'LIVE'
    or v_season.lifecycle <> 'REGULAR'
    or v_season.roster_locked_at is null then
    raise exception using errcode = '55000', message = 'An active roster-locked Live season is required.';
  end if;

  select week.* into strict v_previous_week
  from private.season_weeks as week
  where week.season_id = v_season.id
    and week.scope = 'REGULAR'
  order by week.nfl_week desc
  limit 1
  for update;

  if v_previous_week.state <> 'FINAL' then
    raise exception using errcode = '55000', message = 'The current week must be final before the next week can publish.';
  end if;
  if v_previous_week.nfl_week >= 14 then
    raise exception using errcode = '55000', message = 'The 14-week regular season is complete.';
  end if;
  v_next_week := v_previous_week.nfl_week + 1;

  select odds_import.* into strict v_import
  from private.live_odds_imports as odds_import
  where odds_import.id = p_import_id
    and odds_import.season_id = v_season.id
    and odds_import.league_id = p_league_id;

  if exists (
    select 1
    from private.live_odds_imports as newer_import
    where newer_import.season_id = v_season.id
      and (newer_import.created_at, newer_import.id) > (v_import.created_at, v_import.id)
  ) then
    raise exception using errcode = '40001', message = 'A newer reviewed import is available.';
  end if;

  select count(*) into v_available_count
  from jsonb_array_elements(v_import.normalized_json -> 'events') as provider_event(value)
  where provider_event.value ->> 'externalEventId' = any(v_selected_event_ids);

  v_selected_count := cardinality(v_selected_event_ids);
  if v_available_count <> v_selected_count then
    raise exception using errcode = '22023', message = 'Every selected event must belong to the reviewed import.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_import.normalized_json -> 'events') as provider_event(value)
    cross join lateral jsonb_array_elements(provider_event.value -> 'markets') as provider_market(value)
    where provider_event.value ->> 'externalEventId' = any(v_selected_event_ids)
      and (
        (provider_market.value ->> 'observedAt')::timestamptz > v_published_at
        or (provider_market.value ->> 'observedAt')::timestamptz < v_published_at - interval '2 minutes'
      )
  ) then
    raise exception using errcode = '55000', message = 'Every selected event requires six fresh current quotes before cards open.';
  end if;

  select min((provider_event.value ->> 'scheduledStartAt')::timestamptz)
  into v_first_kickoff_at
  from jsonb_array_elements(v_import.normalized_json -> 'events') as provider_event(value)
  where provider_event.value ->> 'externalEventId' = any(v_selected_event_ids);

  v_common_lock_at := v_first_kickoff_at - interval '5 minutes';
  if v_common_lock_at <= v_published_at then
    raise exception using errcode = '22023', message = 'The selected slate has already reached common lock.';
  end if;

  select publication.* into strict v_publication
  from private.schedule_publications as publication
  where publication.season_id = v_season.id
    and publication.algorithm_version = 'circle-v1'
  order by publication.version desc
  limit 1
  for share;

  select count(*) into v_entry_count
  from private.season_entries as entry
  where entry.season_id = v_season.id;
  if v_entry_count not in (4, 6, 8, 10, 12, 14, 16) then
    raise exception using errcode = '55000', message = 'The frozen Live roster is invalid.';
  end if;

  insert into private.season_weeks (
    id, season_id, league_id, nfl_week, scope, state, opens_at, common_lock_at
  ) values (
    v_week_id, v_season.id, p_league_id, v_next_week, 'REGULAR', 'OPEN',
    v_published_at, v_common_lock_at
  );

  insert into private.slates (
    id, week_id, season_id, league_id, version, fixture_id, common_lock_at, published_at
  ) values (
    v_slate_id, v_week_id, v_season.id, p_league_id, 1,
    'live-import:' || v_import.id::text, v_common_lock_at, v_published_at
  );

  for v_event_json in
    select provider_event.value
    from jsonb_array_elements(v_import.normalized_json -> 'events') as provider_event(value)
    where provider_event.value ->> 'externalEventId' = any(v_selected_event_ids)
    order by (provider_event.value ->> 'scheduledStartAt')::timestamptz,
      provider_event.value ->> 'externalEventId'
  loop
    v_event_id := gen_random_uuid();
    insert into private.sports_events (
      id, week_id, season_id, league_id, fixture_event_key, away_team,
      home_team, scheduled_start_at, provider_health
    ) values (
      v_event_id, v_week_id, v_season.id, p_league_id,
      v_event_json ->> 'externalEventId', v_event_json ->> 'awayTeam',
      v_event_json ->> 'homeTeam',
      (v_event_json ->> 'scheduledStartAt')::timestamptz, 'HEALTHY'
    );

    for v_market_json in
      select provider_market.value
      from jsonb_array_elements(v_event_json -> 'markets') as provider_market(value)
      order by provider_market.value ->> 'marketType', provider_market.value ->> 'outcomeKey'
    loop
      v_snapshot_id := gen_random_uuid();
      v_line_milli := case
        when jsonb_typeof(v_market_json -> 'lineMilli') = 'null' then null
        else (v_market_json ->> 'lineMilli')::integer
      end;

      insert into private.market_snapshots (
        id, event_id, week_id, league_id, book_key, market_type, outcome_key,
        proposition, line_milli, american_odds, quality_status, observed_at, payload_hash
      ) values (
        v_snapshot_id, v_event_id, v_week_id, p_league_id,
        lower(v_market_json ->> 'sourceBook'), upper(v_market_json ->> 'marketType'),
        upper(v_market_json ->> 'outcomeKey'), v_market_json ->> 'proposition',
        v_line_milli, (v_market_json ->> 'americanOdds')::integer, 'HEALTHY',
        (v_market_json ->> 'observedAt')::timestamptz,
        encode(extensions.digest(
          (v_event_json ->> 'externalEventId') || ':' || v_market_json::text,
          'sha256'
        ), 'hex')
      );

      insert into private.slate_items (
        slate_id, event_id, market_snapshot_id, week_id, league_id
      ) values (
        v_slate_id, v_event_id, v_snapshot_id, v_week_id, p_league_id
      );
    end loop;
  end loop;

  if (
    select count(*) from private.sports_events as event where event.week_id = v_week_id
  ) <> v_selected_count or (
    select count(*) from private.slate_items as item where item.week_id = v_week_id
  ) <> v_selected_count * 6 or (
    select count(*) from private.live_quote_heads as head where head.week_id = v_week_id
  ) <> v_selected_count * 6 then
    raise exception using errcode = '22023', message = 'The published slate is incomplete.';
  end if;

  insert into private.matchups (
    week_id, season_id, league_id, schedule_publication_id,
    side_a_entry_id, side_b_entry_id, scope, display_order
  )
  select
    v_week_id,
    v_season.id,
    p_league_id,
    v_publication.id,
    (scheduled.value ->> 'sideAEntryId')::uuid,
    (scheduled.value ->> 'sideBEntryId')::uuid,
    'REGULAR',
    row_number() over (order by scheduled.ordinality)::integer
  from jsonb_array_elements(v_publication.schedule_json -> 'matchups')
    with ordinality as scheduled(value, ordinality)
  where (scheduled.value ->> 'week')::integer = v_next_week
  order by scheduled.ordinality;
  get diagnostics v_matchup_count = row_count;

  if v_matchup_count <> v_entry_count / 2 then
    raise exception using errcode = '22023', message = 'The frozen weekly schedule is incomplete.';
  end if;

  insert into private.weekly_cards (
    week_id, season_id, league_id, entry_id, owner_user_id,
    granted_credits, granted_at
  )
  select
    v_week_id, v_season.id, p_league_id, entry.id, entry.user_id,
    1000, v_published_at
  from private.season_entries as entry
  where entry.season_id = v_season.id
  order by entry.id;
  get diagnostics v_card_count = row_count;

  if v_card_count <> v_entry_count then
    raise exception using errcode = '22023', message = 'Every frozen entry requires one fresh weekly card.';
  end if;

  v_response := jsonb_build_object(
    'leagueId', p_league_id,
    'seasonId', v_season.id,
    'weekId', v_week_id,
    'slateId', v_slate_id,
    'importId', v_import.id,
    'week', v_next_week,
    'eventCount', v_selected_count,
    'marketCount', v_selected_count * 6,
    'matchupCount', v_matchup_count,
    'cardCount', v_card_count,
    'grantedCreditsPerEntry', 1000,
    'commonLockAt', v_common_lock_at,
    'publishedAt', v_published_at,
    'weekState', 'OPEN'
  );

  insert into private.command_receipts (
    league_id, actor_user_id, command_name, idempotency_key, request_hash, response_json
  ) values (
    p_league_id, v_user_id, 'PUBLISH_NEXT_LIVE_WEEK_SLATE',
    p_idempotency_key, v_request_hash, v_response
  );

  return v_response;
end;
$$;

revoke execute on function api.publish_next_live_week_slate(uuid, uuid, text[], text)
from public, anon;
grant execute on function api.publish_next_live_week_slate(uuid, uuid, text[], text)
to authenticated;
