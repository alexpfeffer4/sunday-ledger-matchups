-- Owner-approved 2026-09-14: final weekly results after all published games settle.
-- Preserve completed historical weeks and frozen betting/scoring terms.
alter table private.season_weeks add column finalization_mode text not null
  default 'MANUAL_24H' check (finalization_mode in ('MANUAL_24H', 'AFTER_RESULTS'));
update private.season_weeks set finalization_mode = 'AFTER_RESULTS' where state <> 'FINAL';
alter table private.season_weeks alter column finalization_mode set default 'AFTER_RESULTS';

-- This is an internal operation, never a member-callable early-close escape hatch.
create function private.finalize_completed_week(p_week_id uuid)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_week private.season_weeks%rowtype;
  v_previous_score private.weekly_score_versions%rowtype;
  v_previous_matchup private.matchup_result_versions%rowtype;
  v_previous_standings private.standings_snapshots%rowtype;
  v_side_a_score_id uuid;
  v_side_b_score_id uuid;
  v_new_hash text;
begin
  select * into strict v_week from private.season_weeks where id = p_week_id for update;
  if v_week.state not in ('LOCKED', 'PROVISIONAL', 'FINAL')
    or not exists (select 1 from private.sports_events where week_id = p_week_id)
    or exists (
      select 1 from private.sports_events event where event.week_id = p_week_id
      and not exists (select 1 from private.event_result_versions result
        where result.event_id = event.id and result.status in ('FINAL', 'VOID'))
    )
    or not exists (select 1 from private.matchups matchup where matchup.week_id = p_week_id
      and private.is_effective_postseason_matchup(matchup.id))
    or exists (
      select 1 from private.weekly_cards card
      left join lateral (select score.is_complete from private.weekly_score_versions score
        where score.card_id = card.id order by score.created_at desc, score.id desc limit 1) latest on true
      where card.week_id = p_week_id and latest.is_complete is distinct from true
    )
    or exists (
      select 1 from private.matchups matchup where matchup.week_id = p_week_id
      and private.is_effective_postseason_matchup(matchup.id)
      and not exists (select 1 from private.matchup_result_versions result where result.matchup_id = matchup.id)
    ) then
    raise exception using errcode = '55000', message = 'Every published game and card must be settled before the week is final.';
  end if;

  for v_previous_score in
    select distinct on (score.card_id) score.*
    from private.weekly_score_versions as score
    where score.week_id = v_week.id
    order by score.card_id, score.created_at desc, score.id desc
  loop
    if v_previous_score.status = 'FINAL' then continue; end if;
    v_new_hash := encode(
      extensions.digest(v_previous_score.input_hash || ':FINAL', 'sha256'),
      'hex'
    );
    insert into private.weekly_score_versions (
      card_id, week_id, league_id, entry_id, input_hash, compliance,
      score_centicredits, is_complete, status, supersedes_id
    ) values (
      v_previous_score.card_id, v_previous_score.week_id,
      v_previous_score.league_id, v_previous_score.entry_id, v_new_hash,
      v_previous_score.compliance, v_previous_score.score_centicredits,
      v_previous_score.is_complete, 'FINAL', v_previous_score.id
    ) on conflict (card_id, input_hash) do nothing;
  end loop;

  for v_previous_matchup in
    select distinct on (result.matchup_id) result.*
    from private.matchup_result_versions as result
    where result.week_id = v_week.id
    order by result.matchup_id, result.created_at desc, result.id desc
  loop
    if v_previous_matchup.status = 'FINAL' then continue; end if;
    select score.id into strict v_side_a_score_id
    from private.weekly_score_versions as score
    join private.matchups as matchup
      on matchup.id = v_previous_matchup.matchup_id
     and matchup.side_a_entry_id = score.entry_id
    where score.week_id = v_week.id and score.status = 'FINAL'
    order by score.created_at desc, score.id desc
    limit 1;

    select score.id into strict v_side_b_score_id
    from private.weekly_score_versions as score
    join private.matchups as matchup
      on matchup.id = v_previous_matchup.matchup_id
     and matchup.side_b_entry_id = score.entry_id
    where score.week_id = v_week.id and score.status = 'FINAL'
    order by score.created_at desc, score.id desc
    limit 1;

    v_new_hash := encode(
      extensions.digest(
        v_previous_matchup.input_hash || ':FINAL:'
        || v_side_a_score_id::text || ':' || v_side_b_score_id::text,
        'sha256'
      ),
      'hex'
    );
    insert into private.matchup_result_versions (
      matchup_id, week_id, league_id, side_a_score_version_id,
      side_b_score_version_id, side_a_decision, side_b_decision,
      side_a_points_for_centicredits, side_b_points_for_centicredits,
      input_hash, status, supersedes_id
    ) values (
      v_previous_matchup.matchup_id, v_previous_matchup.week_id,
      v_previous_matchup.league_id, v_side_a_score_id, v_side_b_score_id,
      v_previous_matchup.side_a_decision, v_previous_matchup.side_b_decision,
      v_previous_matchup.side_a_points_for_centicredits,
      v_previous_matchup.side_b_points_for_centicredits,
      v_new_hash, 'FINAL', v_previous_matchup.id
    ) on conflict (matchup_id, input_hash) do nothing;
  end loop;

  if v_week.scope = 'REGULAR' and v_week.nfl_week <> 18 then
    select standings.* into strict v_previous_standings
    from private.standings_snapshots as standings
    where standings.week_id = v_week.id
    order by standings.created_at desc, standings.id desc
    limit 1;

    if v_previous_standings.status <> 'FINAL' then
    v_new_hash := encode(
      extensions.digest(v_previous_standings.input_hash || ':FINAL', 'sha256'),
      'hex'
    );
    insert into private.standings_snapshots (
      season_id, week_id, league_id, through_week, ordered_rows,
      input_hash, status, supersedes_id
    ) values (
      v_previous_standings.season_id, v_previous_standings.week_id,
      v_previous_standings.league_id, v_previous_standings.through_week,
      v_previous_standings.ordered_rows, v_new_hash, 'FINAL',
      v_previous_standings.id
    ) on conflict (season_id, through_week, input_hash) do nothing;
    end if;
  end if;

  update private.season_weeks set state = 'FINAL',
    correction_window_closes_at = coalesce(correction_window_closes_at,
      private.stage1_season_time(v_week.season_id) + interval '24 hours')
    where id = v_week.id;

end;
$function$;
revoke all on function private.finalize_completed_week(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION api.finalize_stage1_week(p_league_id uuid, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_season private.seasons%rowtype;
  v_week private.season_weeks%rowtype;
  v_command private.command_receipts%rowtype;
  v_request_hash text;
  v_previous_score private.weekly_score_versions%rowtype;
  v_previous_matchup private.matchup_result_versions%rowtype;
  v_previous_standings private.standings_snapshots%rowtype;
  v_side_a_score_id uuid;
  v_side_b_score_id uuid;
  v_new_hash text;
  v_response jsonb;
begin
  if v_user_id is null or not private.is_league_commissioner(p_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;
  if char_length(p_idempotency_key) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'Idempotency key is invalid.';
  end if;

  select season.* into strict v_season
  from private.seasons as season
  where season.league_id = p_league_id
    and season.lifecycle in ('REGULAR', 'PLAYOFFS', 'CHAMPION_FINAL', 'WEEK_18_EXHIBITION')
  order by season.created_at desc
  limit 1
  for update;

  select week.* into strict v_week
  from private.season_weeks as week
  where week.season_id = v_season.id
  order by week.nfl_week desc
  limit 1
  for update;

  v_request_hash := encode(
    extensions.digest(p_league_id::text || ':FINALIZE:' || v_week.id::text, 'sha256'),
    'hex'
  );

  select command.* into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'FINALIZE_STAGE1_WEEK'
    and command.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json;
  end if;

  if v_week.state <> 'FINAL' then
    if v_week.finalization_mode = 'MANUAL_24H' and (
      v_week.state <> 'PROVISIONAL' or v_week.correction_window_closes_at is null
      or private.stage1_season_time(v_season.id) < v_week.correction_window_closes_at
    ) then
      raise exception using errcode = '55000', message = 'The current week cannot finalize before its correction window closes.';
    end if;
    perform private.finalize_completed_week(v_week.id);
  end if;

  v_response := jsonb_build_object(
    'weekId', v_week.id,
    'week', v_week.nfl_week,
    'scope', v_week.scope,
    'state', 'FINAL',
    'finalizedAt', private.stage1_season_time(v_season.id)
  );
  insert into private.command_receipts (
    league_id, actor_user_id, command_name, idempotency_key,
    request_hash, response_json
  ) values (
    p_league_id, v_user_id, 'FINALIZE_STAGE1_WEEK', p_idempotency_key,
    v_request_hash, v_response
  );
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION private.recompute_stage1_week(p_week_id uuid, p_result_version_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_week private.season_weeks%rowtype;
  v_result private.event_result_versions%rowtype;
  v_receipt private.position_receipts%rowtype;
  v_previous_settlement private.settlement_versions%rowtype;
  v_graded record;
  v_card private.weekly_cards%rowtype;
  v_previous_score private.weekly_score_versions%rowtype;
  v_score_centicredits bigint;
  v_receipt_count integer;
  v_settled_count integer;
  v_score_complete boolean;
  v_score_input text;
  v_score_hash text;
  v_matchup private.matchups%rowtype;
  v_side_a_card private.weekly_cards%rowtype;
  v_side_b_card private.weekly_cards%rowtype;
  v_side_a_score private.weekly_score_versions%rowtype;
  v_side_b_score private.weekly_score_versions%rowtype;
  v_previous_matchup private.matchup_result_versions%rowtype;
  v_side_a_decision text;
  v_side_b_decision text;
  v_side_a_points bigint;
  v_side_b_points bigint;
  v_matchup_hash text;
  v_matchup_count integer;
  v_completed_matchup_count integer;
  v_standings_rows jsonb;
  v_standings_input text;
  v_standings_hash text;
  v_previous_standings private.standings_snapshots%rowtype;
  v_all_events_complete boolean;
begin
  select * into strict v_week
  from private.season_weeks
  where id = p_week_id
  for update;

  select * into strict v_result
  from private.event_result_versions
  where id = p_result_version_id
    and week_id = p_week_id;

  for v_receipt in
    select receipt.*
    from private.position_receipts as receipt
    where receipt.event_id = v_result.event_id
    order by receipt.accepted_at, receipt.id
  loop
    select * into v_previous_settlement
    from private.settlement_versions as settlement
    where settlement.receipt_id = v_receipt.id
    order by settlement.created_at desc, settlement.id desc
    limit 1;

    select * into strict v_graded
    from private.grade_stage1_receipt(
      v_receipt.market_type,
      v_receipt.outcome_key,
      v_receipt.line_milli,
      v_receipt.american_odds,
      v_receipt.stake_credits,
      v_result.status,
      v_result.away_score,
      v_result.home_score
    );

    insert into private.settlement_versions (
      receipt_id,
      result_version_id,
      week_id,
      league_id,
      owner_user_id,
      outcome,
      returned_centicredits,
      supersedes_id
    ) values (
      v_receipt.id,
      v_result.id,
      v_receipt.week_id,
      v_receipt.league_id,
      v_receipt.owner_user_id,
      v_graded.outcome,
      v_graded.returned_centicredits,
      v_previous_settlement.id
    )
    on conflict (receipt_id, result_version_id) do nothing;
  end loop;

  for v_card in
    select card.*
    from private.weekly_cards as card
    where card.week_id = p_week_id
    order by card.entry_id
  loop
    select count(*) into v_receipt_count
    from private.position_receipts as receipt
    where receipt.card_id = v_card.id;

    select
      count(settlement.id),
      coalesce(sum(settlement.returned_centicredits), 0),
      coalesce(
        string_agg(
          receipt.id::text || ':' || coalesce(settlement.id::text, 'PENDING'),
          ',' order by receipt.id
        ),
        ''
      )
    into v_settled_count, v_score_centicredits, v_score_input
    from private.position_receipts as receipt
    left join lateral (
      select candidate.id, candidate.returned_centicredits
      from private.settlement_versions as candidate
      where candidate.receipt_id = receipt.id
      order by candidate.created_at desc, candidate.id desc
      limit 1
    ) as settlement on true
    where receipt.card_id = v_card.id;

    v_score_complete :=
      v_card.compliance = 'INCOMPLETE'
      or (
        v_card.compliance = 'COMPLIANT'
        and v_receipt_count > 0
        and v_settled_count = v_receipt_count
      );

    if v_card.compliance = 'INCOMPLETE' then
      v_score_centicredits := 0;
    end if;

    v_score_hash := encode(
      extensions.digest(
        v_card.id::text || ':' || v_card.compliance || ':'
        || v_score_complete::text || ':' || v_score_centicredits::text
        || ':' || v_score_input,
        'sha256'
      ),
      'hex'
    );

    select * into v_previous_score
    from private.weekly_score_versions as score
    where score.card_id = v_card.id
    order by score.created_at desc, score.id desc
    limit 1;

    insert into private.weekly_score_versions (
      card_id,
      week_id,
      league_id,
      entry_id,
      input_hash,
      compliance,
      score_centicredits,
      is_complete,
      status,
      supersedes_id
    ) values (
      v_card.id,
      v_card.week_id,
      v_card.league_id,
      v_card.entry_id,
      v_score_hash,
      v_card.compliance,
      v_score_centicredits,
      v_score_complete,
      'PROVISIONAL',
      v_previous_score.id
    )
    on conflict (card_id, input_hash) do nothing;
  end loop;

  for v_matchup in
    select matchup.*
    from private.matchups as matchup
    where matchup.week_id = p_week_id
      and private.is_effective_postseason_matchup(matchup.id)
    order by matchup.display_order
  loop
    select * into strict v_side_a_card
    from private.weekly_cards
    where week_id = p_week_id and entry_id = v_matchup.side_a_entry_id;

    select * into strict v_side_b_card
    from private.weekly_cards
    where week_id = p_week_id and entry_id = v_matchup.side_b_entry_id;

    select * into strict v_side_a_score
    from private.weekly_score_versions
    where card_id = v_side_a_card.id
    order by created_at desc, id desc
    limit 1;

    select * into strict v_side_b_score
    from private.weekly_score_versions
    where card_id = v_side_b_card.id
    order by created_at desc, id desc
    limit 1;

    if not v_side_a_score.is_complete or not v_side_b_score.is_complete then
      continue;
    end if;

    v_side_a_points := case
      when v_side_a_score.compliance = 'COMPLIANT' then v_side_a_score.score_centicredits
      else 0
    end;
    v_side_b_points := case
      when v_side_b_score.compliance = 'COMPLIANT' then v_side_b_score.score_centicredits
      else 0
    end;

    if v_side_a_score.compliance = 'INCOMPLETE'
      and v_side_b_score.compliance = 'INCOMPLETE' then
      v_side_a_decision := 'LOSS';
      v_side_b_decision := 'LOSS';
    elsif v_side_a_score.compliance = 'INCOMPLETE' then
      v_side_a_decision := 'LOSS';
      v_side_b_decision := 'WIN';
    elsif v_side_b_score.compliance = 'INCOMPLETE' then
      v_side_a_decision := 'WIN';
      v_side_b_decision := 'LOSS';
    elsif v_side_a_score.score_centicredits = v_side_b_score.score_centicredits then
      v_side_a_decision := 'TIE';
      v_side_b_decision := 'TIE';
    elsif v_side_a_score.score_centicredits > v_side_b_score.score_centicredits then
      v_side_a_decision := 'WIN';
      v_side_b_decision := 'LOSS';
    else
      v_side_a_decision := 'LOSS';
      v_side_b_decision := 'WIN';
    end if;

    v_matchup_hash := encode(
      extensions.digest(
        v_matchup.id::text || ':' || v_side_a_score.id::text || ':'
        || v_side_b_score.id::text || ':' || v_side_a_decision || ':'
        || v_side_b_decision,
        'sha256'
      ),
      'hex'
    );

    select * into v_previous_matchup
    from private.matchup_result_versions as result
    where result.matchup_id = v_matchup.id
    order by result.created_at desc, result.id desc
    limit 1;

    insert into private.matchup_result_versions (
      matchup_id,
      week_id,
      league_id,
      side_a_score_version_id,
      side_b_score_version_id,
      side_a_decision,
      side_b_decision,
      side_a_points_for_centicredits,
      side_b_points_for_centicredits,
      input_hash,
      status,
      supersedes_id
    ) values (
      v_matchup.id,
      p_week_id,
      v_matchup.league_id,
      v_side_a_score.id,
      v_side_b_score.id,
      v_side_a_decision,
      v_side_b_decision,
      v_side_a_points,
      v_side_b_points,
      v_matchup_hash,
      'PROVISIONAL',
      v_previous_matchup.id
    )
    on conflict (matchup_id, input_hash) do nothing;
  end loop;

  select count(*) into v_matchup_count
  from private.matchups as counted_matchup
  where counted_matchup.week_id = p_week_id
    and private.is_effective_postseason_matchup(counted_matchup.id);

  select count(*) into v_completed_matchup_count
  from private.matchups as matchup
  where matchup.week_id = p_week_id
      and private.is_effective_postseason_matchup(matchup.id)
    and exists (
      select 1
      from private.matchup_result_versions as result
      where result.matchup_id = matchup.id
    );

  if v_week.scope = 'REGULAR' and v_week.nfl_week <> 18 and v_matchup_count > 0 and v_completed_matchup_count = v_matchup_count then

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

    v_standings_hash := encode(
      extensions.digest(v_week.id::text || ':' || v_standings_input, 'sha256'),
      'hex'
    );

    select * into v_previous_standings
    from private.standings_snapshots as standings
    where standings.week_id = p_week_id
    order by standings.created_at desc, standings.id desc
    limit 1;

    insert into private.standings_snapshots (
      season_id,
      week_id,
      league_id,
      through_week,
      ordered_rows,
      input_hash,
      status,
      supersedes_id
    ) values (
      v_week.season_id,
      v_week.id,
      v_week.league_id,
      v_week.nfl_week,
      v_standings_rows,
      v_standings_hash,
      'PROVISIONAL',
      v_previous_standings.id
    )
    on conflict (season_id, through_week, input_hash) do nothing;
  end if;

  select not exists (
    select 1
    from private.sports_events as event
    where event.week_id = p_week_id
      and not exists (
        select 1
        from private.event_result_versions as result
        where result.event_id = event.id
      )
  ) into v_all_events_complete;

  if v_week.state <> 'FINAL' and v_all_events_complete and v_matchup_count > 0 and v_matchup_count = v_completed_matchup_count then
    update private.season_weeks
    set
      state = 'PROVISIONAL',
      correction_window_closes_at = coalesce(
        correction_window_closes_at,
        private.stage1_season_time(v_week.season_id) + interval '24 hours'
      )
    where id = p_week_id;
  end if;
  if v_week.finalization_mode = 'AFTER_RESULTS' and v_all_events_complete
    and v_matchup_count > 0 and v_matchup_count = v_completed_matchup_count then
    perform private.finalize_completed_week(p_week_id);
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.record_stage1_result_as(p_actor_user_id uuid, p_event_id uuid, p_status text, p_away_score integer, p_home_score integer, p_reason text, p_source text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := p_actor_user_id;
  v_event private.sports_events%rowtype;
  v_week private.season_weeks%rowtype;
  v_previous_result private.event_result_versions%rowtype;
  v_result_id uuid := gen_random_uuid();
  v_result_version integer;
  v_command private.command_receipts%rowtype;
  v_request_hash text;
  v_before_summary jsonb;
  v_after_summary jsonb;
  v_response jsonb;
begin
  select event.* into strict v_event
  from private.sports_events as event
  where event.id = p_event_id
  for update;

  if v_user_id is null or (case when v_user_id=(select auth.uid()) then not private.is_league_commissioner(v_event.league_id) else not exists(select 1 from private.league_memberships m join private.seasons s on s.league_id=m.league_id where m.league_id=v_event.league_id and m.user_id=v_user_id and m.role='COMMISSIONER' and s.id=v_event.season_id and s.mode='LIVE') end) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;

  select week.* into strict v_week
  from private.season_weeks as week
  where week.id = v_event.week_id
  for update;

  if session_user <> 'postgres' and exists (
    select 1 from private.seasons as season
    where season.id = v_event.season_id and season.mode = 'SIMULATION'
  ) and (
    upper(p_source) <> 'SIMULATION_FIXTURE'
    or not exists (
      select 1
      from private.simulation_fixture_manifests as manifest
      cross join lateral jsonb_array_elements(manifest.manifest_json -> 'weeks') as fixture_week(value)
      cross join lateral jsonb_array_elements(fixture_week.value -> 'events') as fixture_event(value)
      cross join lateral jsonb_array_elements(fixture_event.value -> 'resultVersions') as fixture_result(value)
      where manifest.pack_id = 'sunday-ledger-authoritative-2026-v1'
        and (fixture_week.value ->> 'week')::integer = v_week.nfl_week
        and fixture_event.value ->> 'externalEventId' = v_event.fixture_event_key
        and upper(fixture_result.value ->> 'status') = upper(p_status)
        and nullif(fixture_result.value ->> 'awayScore', '')::integer is not distinct from p_away_score
        and nullif(fixture_result.value ->> 'homeScore', '')::integer is not distinct from p_home_score
        and fixture_result.value ->> 'reason' = btrim(p_reason)
        and (fixture_result.value ->> 'availableAt')::timestamptz <= private.stage1_season_time(v_event.season_id)
    )
  ) then
    raise exception using errcode = '22023', message = 'Simulation results must match the reviewed fixture manifest.';
  end if;

  if upper(p_status) not in ('FINAL', 'VOID')
    or upper(p_source) not in ('SIMULATION_FIXTURE', 'MANUAL_OBJECTIVE', 'THE_ODDS_API')
    or char_length(btrim(p_reason)) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'Result status, source, or reason is invalid.';
  end if;
  if upper(p_status) = 'FINAL'
    and (p_away_score is null or p_home_score is null or p_away_score < 0 or p_home_score < 0) then
    raise exception using errcode = '22023', message = 'Final scores are invalid.';
  end if;
  if upper(p_status) = 'VOID' and (p_away_score is not null or p_home_score is not null) then
    raise exception using errcode = '22023', message = 'Void results cannot include scores.';
  end if;
  if private.stage1_season_time(v_event.season_id) < v_event.scheduled_start_at then
    raise exception using errcode = '55000', message = 'An event cannot settle before its scheduled start.';
  end if;

  v_request_hash := encode(
    extensions.digest(
      p_event_id::text || ':' || upper(p_status) || ':'
      || coalesce(p_away_score::text, 'NULL') || ':'
      || coalesce(p_home_score::text, 'NULL') || ':'
      || btrim(p_reason) || ':' || upper(p_source),
      'sha256'
    ),
    'hex'
  );

  select * into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'RECORD_STAGE1_RESULT'
    and command.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json;
  end if;

  -- Replay is resolved before mutable finality/window checks.
  if v_week.state not in ('LOCKED', 'PROVISIONAL') and not (
    v_week.state = 'FINAL' and v_week.finalization_mode = 'AFTER_RESULTS'
  ) then
    raise exception using errcode = '55000', message = 'Results require a locked, unfinalized week.';
  end if;

  select * into v_previous_result
  from private.event_result_versions as result
  where result.event_id = p_event_id
  order by result.version desc
  limit 1;

  if v_previous_result.id is null
    and upper(p_status) = 'FINAL'
    and (v_event.state <> 'LIVE' or v_event.actual_started_at is null) then
    raise exception using errcode = '55000', message = 'A final result requires reliable actual kickoff.';
  end if;
  if v_previous_result.id is not null
    and (
      v_week.state in ('PROVISIONAL', 'FINAL')
      and (
        v_week.correction_window_closes_at is null
        or private.stage1_season_time(v_event.season_id) >= v_week.correction_window_closes_at
      )
    ) then
    raise exception using errcode = '55000', message = 'The correction window is closed.';
  end if;

  v_result_version := coalesce(v_previous_result.version, 0) + 1;
  v_before_summary := jsonb_build_object(
    'eventState', v_event.state,
    'resultVersionId', v_previous_result.id,
    'standingsSnapshotId', (
      select standings.id
      from private.standings_snapshots as standings
      where standings.week_id = v_week.id
      order by standings.created_at desc, standings.id desc
      limit 1
    )
  );

  insert into private.event_result_versions (
    id,
    event_id,
    week_id,
    league_id,
    version,
    status,
    away_score,
    home_score,
    source,
    reason,
    recorded_by,
    supersedes_id,
    input_hash
  ) values (
    v_result_id,
    p_event_id,
    v_week.id,
    v_event.league_id,
    v_result_version,
    upper(p_status),
    case when upper(p_status) = 'FINAL' then p_away_score else null end,
    case when upper(p_status) = 'FINAL' then p_home_score else null end,
    upper(p_source),
    btrim(p_reason),
    v_user_id,
    v_previous_result.id,
    v_request_hash
  );

  update private.sports_events
  set
    state = case
      when v_previous_result.id is not null then 'CORRECTED'
      when upper(p_status) = 'VOID' then 'VOID'
      else 'FINAL'
    end,
    actual_started_at = case
      when upper(p_status) = 'FINAL' then coalesce(actual_started_at, scheduled_start_at)
      else actual_started_at
    end
  where id = p_event_id;

  perform private.recompute_stage1_week(v_week.id, v_result_id);

  v_after_summary := jsonb_build_object(
    'eventState', (
      select state from private.sports_events where id = p_event_id
    ),
    'resultVersionId', v_result_id,
    'standingsSnapshotId', (
      select standings.id
      from private.standings_snapshots as standings
      where standings.week_id = v_week.id
      order by standings.created_at desc, standings.id desc
      limit 1
    )
  );

  if v_previous_result.id is not null then
    insert into private.corrections (
      league_id,
      week_id,
      event_id,
      original_result_version_id,
      corrected_result_version_id,
      reason,
      actor_user_id,
      before_summary,
      after_summary
    ) values (
      v_event.league_id,
      v_week.id,
      p_event_id,
      v_previous_result.id,
      v_result_id,
      btrim(p_reason),
      v_user_id,
      v_before_summary,
      v_after_summary
    );
  end if;

  v_response := jsonb_build_object(
    'eventId', p_event_id,
    'resultVersionId', v_result_id,
    'version', v_result_version,
    'corrected', v_previous_result.id is not null,
    'weekState', (select state from private.season_weeks where id = v_week.id)
  );

  insert into private.command_receipts (
    league_id, actor_user_id, command_name, idempotency_key, request_hash, response_json
  ) values (
    v_event.league_id,
    v_user_id,
    'RECORD_STAGE1_RESULT',
    p_idempotency_key,
    v_request_hash,
    v_response
  );

  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION api.correct_live_event_result(p_event_id uuid, p_status text, p_away_score integer, p_home_score integer, p_reason text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_event private.sports_events%rowtype;
  v_season private.seasons%rowtype;
  v_previous private.event_result_versions%rowtype;
begin
  select event.* into strict v_event
  from private.sports_events as event
  where event.id = p_event_id
  for update;

  if v_user_id is null or not private.is_league_commissioner(v_event.league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;

  select season.* into strict v_season
  from private.seasons as season
  where season.id = v_event.season_id;

  if v_season.mode <> 'LIVE' then
    raise exception using errcode = '22023', message = 'Only Live seasons accept objective corrections.';
  end if;

  select result.* into strict v_previous
  from private.event_result_versions as result
  where result.event_id = p_event_id
  order by result.version desc
  limit 1;

  if char_length(btrim(p_reason)) not between 10 and 500 then
    raise exception using errcode = '22023', message = 'A visible correction reason of 10 through 500 characters is required.';
  end if;
  if not exists (select 1 from private.command_receipts command
    where command.actor_user_id = v_user_id and command.command_name = 'RECORD_STAGE1_RESULT'
      and command.idempotency_key = p_idempotency_key)
    and upper(p_status) = v_previous.status
    and p_away_score is not distinct from v_previous.away_score
    and p_home_score is not distinct from v_previous.home_score then
    raise exception using errcode = '22023', message = 'A correction must change the recorded result.';
  end if;

  return api.record_stage1_result(
    p_event_id,
    p_status,
    p_away_score,
    p_home_score,
    p_reason,
    'MANUAL_OBJECTIVE',
    p_idempotency_key
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.import_live_scores_as(p_actor_user_id uuid, p_league_id uuid, p_import jsonb, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := p_actor_user_id;
  v_season private.seasons%rowtype;
  v_week private.season_weeks%rowtype;
  v_event private.sports_events%rowtype;
  v_previous_result private.event_result_versions%rowtype;
  v_command private.command_receipts%rowtype;
  v_payload_event jsonb;
  v_fetched_at timestamptz;
  v_last_update timestamptz; v_reported_start timestamptz;
  v_away_score integer;
  v_home_score integer;
  v_completed boolean;
  v_payload_hash text;
  v_request_hash text;
  v_import_id uuid;
  v_event_count integer;
  v_live_count integer := 0;
  v_pending_count integer := 0;
  v_settled_count integer := 0;
  v_corrected_count integer := 0;
  v_unchanged_count integer := 0;
  v_response jsonb;
begin
  if v_user_id is null or not exists(select 1 from private.league_memberships where league_id=p_league_id and user_id=v_user_id and role='COMMISSIONER') then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;
  if jsonb_typeof(p_import) <> 'object'
    or p_import ->> 'source' <> 'THE_ODDS_API'
    or jsonb_typeof(p_import -> 'events') <> 'array' then
    raise exception using errcode = '22023', message = 'The live score import envelope is invalid.';
  end if;

  begin
    v_fetched_at := (p_import ->> 'fetchedAt')::timestamptz;
  exception when others then
    raise exception using errcode = '22023', message = 'The live score fetch time is invalid.';
  end;

  if v_fetched_at < clock_timestamp() - interval '15 minutes'
    or v_fetched_at > clock_timestamp() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'The live score import is not fresh.';
  end if;

  v_event_count := jsonb_array_length(p_import -> 'events');
  if v_event_count not between 1 and 32 then
    raise exception using errcode = '22023', message = 'A live score import requires 1 through 32 events.';
  end if;
  if (
    select count(distinct item.value ->> 'externalEventId')
    from jsonb_array_elements(p_import -> 'events') as item(value)
  ) <> v_event_count then
    raise exception using errcode = '22023', message = 'The live score import contains duplicate events.';
  end if;

  select season.* into strict v_season
  from private.seasons as season
  where season.league_id = p_league_id
    and season.mode = 'LIVE'
    and season.lifecycle in ('REGULAR', 'PLAYOFFS', 'CHAMPION_FINAL', 'WEEK_18_EXHIBITION')
  order by season.created_at desc
  limit 1
  for update;

  -- A correction batch still belongs to its published week after the next week opens.
  select week.* into v_week from private.season_weeks week
  where week.season_id = v_season.id and exists (
    select 1 from private.sports_events event where event.week_id = week.id
      and event.fixture_event_key = p_import #>> '{events,0,externalEventId}'
  ) order by week.nfl_week desc limit 1 for update;
  if v_week.id is null then
    raise exception using errcode = '22023', message = 'The live score batch must match published events.';
  end if;
  if v_week.state not in ('LOCKED', 'PROVISIONAL') and not (
    v_week.state = 'FINAL' and v_week.finalization_mode = 'AFTER_RESULTS'
    and private.stage1_season_time(v_season.id) < v_week.correction_window_closes_at
  ) then
    raise exception using errcode = '55000', message = 'Live score imports require locked cards and an unfinalized week.';
  end if;


  if exists(select 1 from jsonb_array_elements(p_import->'events') item
    where not exists(select 1 from private.sports_events e where e.week_id=v_week.id and e.fixture_event_key=item->>'externalEventId')) then
    raise exception using errcode='22023',message='The live score batch must match published events.';
  end if;
  v_payload_hash := encode(
    extensions.digest(p_import::text, 'sha256'),
    'hex'
  );
  v_request_hash := encode(
    extensions.digest(p_league_id::text || ':' || v_payload_hash, 'sha256'),
    'hex'
  );

  select * into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'IMPORT_LIVE_SCORES'
    and command.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json;
  end if;

  insert into private.live_score_imports (
    season_id,
    week_id,
    league_id,
    fetched_at,
    payload_hash,
    payload,
    imported_by
  ) values (
    v_season.id,
    v_week.id,
    p_league_id,
    v_fetched_at,
    v_payload_hash,
    p_import,
    v_user_id
  )
  on conflict (season_id, payload_hash) do nothing
  returning id into v_import_id;

  if v_import_id is null then
    select score_import.id into strict v_import_id
    from private.live_score_imports as score_import
    where score_import.season_id = v_season.id
      and score_import.payload_hash = v_payload_hash;
  end if;

  for v_payload_event in
    select item.value
    from jsonb_array_elements(p_import -> 'events') as item(value)
    order by item.value ->> 'externalEventId'
  loop
    if jsonb_typeof(v_payload_event) <> 'object'
      or v_payload_event ->> 'source' <> 'THE_ODDS_API'
      or v_payload_event ->> 'sportKey' <> 'americanfootball_nfl'
      or jsonb_typeof(v_payload_event -> 'completed') <> 'boolean' then
      raise exception using errcode = '22023', message = 'A live score event is invalid.';
    end if;

    select event.* into strict v_event
    from private.sports_events as event
    where event.week_id = v_week.id
      and event.fixture_event_key = v_payload_event ->> 'externalEventId'
    for update;

    v_reported_start := (v_payload_event ->> 'scheduledStartAt')::timestamptz;
    if (v_payload_event ->> 'awayTeam') is distinct from v_event.away_team
      or (v_payload_event ->> 'homeTeam') is distinct from v_event.home_team
      or v_reported_start is null
      or not isfinite(v_reported_start)
      or v_reported_start < v_event.scheduled_start_at
      or v_reported_start >= v_event.scheduled_start_at + interval '48 hours' then
      raise exception using errcode = '22023', message = 'The provider changed a published event identity or kickoff.';
    end if;

    v_completed := (v_payload_event ->> 'completed')::boolean;
    begin
      v_away_score := (v_payload_event ->> 'awayScore')::integer;
      v_home_score := (v_payload_event ->> 'homeScore')::integer;
      v_last_update := (v_payload_event ->> 'lastUpdate')::timestamptz;
    exception when others then
      raise exception using errcode = '22023', message = 'A live score event contains invalid scores or update time.';
    end;

    if (v_away_score is null) <> (v_home_score is null)
      or v_away_score < 0
      or v_home_score < 0
      or (v_away_score is not null and v_last_update is null)
      or (v_completed and (v_away_score is null or v_last_update is null))
      or (v_last_update is not null and (
        v_last_update < greatest(v_event.scheduled_start_at, v_reported_start)
        or v_last_update > v_fetched_at
      )) then
      raise exception using errcode = '22023', message = 'A live score event is internally inconsistent.';
    end if;


    -- Out-of-order data cannot regress an event or masquerade as a fresh score.
    if exists(select 1 from private.live_score_checks c where c.event_id=v_event.id
      and (c.source_updated_at>=v_last_update or (c.source_updated_at is not null and v_last_update is null))) then
      -- A repeated source value is still a successful fetch, not an outage.
      update private.live_score_checks set fetched_at=v_fetched_at,
        state='CHECKED',failure_count=0
      where event_id=v_event.id and source_updated_at=v_last_update;
      v_unchanged_count:=v_unchanged_count+1;
      continue;
    end if;
    insert into private.live_score_checks(event_id,fetched_at,source_updated_at,state)
      values(v_event.id,v_fetched_at,v_last_update,'CHECKED')
      on conflict(event_id) do update set fetched_at=excluded.fetched_at,
        source_updated_at=excluded.source_updated_at,state='CHECKED',failure_count=0;

    if not v_completed and v_away_score is null then
      v_pending_count := v_pending_count + 1;
      continue;
    end if;

    update private.sports_events
    set
      state = case when state = 'SCHEDULED' then 'LIVE' else state end,
      actual_started_at = coalesce(actual_started_at, v_last_update)
    where id = v_event.id;

    if not v_completed then
      v_live_count := v_live_count + 1;
      continue;
    end if;

    select result.* into v_previous_result
    from private.event_result_versions as result
    where result.event_id = v_event.id
    order by result.version desc
    limit 1;

    if v_previous_result.id is not null
      and v_previous_result.status = 'FINAL'
      and v_previous_result.away_score = v_away_score
      and v_previous_result.home_score = v_home_score then
      v_unchanged_count := v_unchanged_count + 1;
      continue;
    end if;

    perform private.record_stage1_result_as(v_user_id,
      v_event.id,
      'FINAL',
      v_away_score,
      v_home_score,
      'The Odds API completed score observed at ' || v_last_update::text || '.',
      'THE_ODDS_API',
      'live-result:' || encode(
        extensions.digest(
          v_event.id::text || ':' || v_away_score::text || ':'
          || v_home_score::text || ':' || v_last_update::text,
          'sha256'
        ),
        'hex'
      )
    );

    if v_previous_result.id is null then
      v_settled_count := v_settled_count + 1;
    else
      v_corrected_count := v_corrected_count + 1;
    end if;
  end loop;

  v_response := jsonb_build_object(
    'importId', v_import_id,
    'eventCount', v_event_count,
    'pendingCount', v_pending_count,
    'liveCount', v_live_count,
    'settledCount', v_settled_count,
    'correctedCount', v_corrected_count,
    'unchangedCount', v_unchanged_count,
    'weekState', (select state from private.season_weeks where id = v_week.id)
  );

  insert into private.command_receipts (
    league_id,
    actor_user_id,
    command_name,
    idempotency_key,
    request_hash,
    response_json
  ) values (
    p_league_id,
    v_user_id,
    'IMPORT_LIVE_SCORES',
    p_idempotency_key,
    v_request_hash,
    v_response
  );

  return v_response;
end;
$function$;

-- Small guarded edits retain the composed privacy and Simulation authority gates.
do $patch$
declare d text; old text; signatures text[]; signature text;
begin
  foreach signature in array array['api.get_stage1_state(text)', 'api.get_live_week_operations(text)', 'api.get_weekly_close_state(text)'] loop
    d := pg_get_functiondef(signature::regprocedure);
    old := case when signature = 'api.get_weekly_close_state(text)'
      then '''correctionWindowClosesAt'', week.correction_window_closes_at'
      else '''correctionWindowClosesAt'', v_week.correction_window_closes_at' end;
    if strpos(d, old) = 0 then raise exception 'Finalization projection changed: %', signature; end if;
    execute replace(d, old, old || case when signature = 'api.get_weekly_close_state(text)'
      then ', ''finalizationMode'', week.finalization_mode'
      else ', ''finalizationMode'', v_week.finalization_mode' end);
  end loop;

  d := pg_get_functiondef('private.due_score_events(uuid,boolean)'::regprocedure);
  old := 'w.state in (''LOCKED'',''PROVISIONAL'')';
  if strpos(d, old) = 0 then raise exception 'Score eligibility changed'; end if;
  d := replace(d, old, '(w.state in (''LOCKED'',''PROVISIONAL'') or (w.state=''FINAL'' and w.finalization_mode=''AFTER_RESULTS'' and clock_timestamp()<w.correction_window_closes_at))');
  old := 'and w.nfl_week=(select max(ww.nfl_week) from private.season_weeks ww where ww.season_id=s.id)';
  if strpos(d, old) = 0 then raise exception 'Score week selector changed'; end if;
  execute replace(d, old, '');

  d := pg_get_functiondef('api.apply_simulation_fixture_results(uuid,integer,text,text,text)'::regprocedure);
  old := 'elsif upper(p_step) = ''CORRECTION'' and v_week.state = ''FINAL'' then';
  if strpos(d, old) = 0 then raise exception 'Simulation correction dispatch changed'; end if;
  execute replace(d, old, 'elsif upper(p_step) = ''CORRECTION'' and v_week.state = ''FINAL'' and v_week.nfl_week = 17 and v_season.lifecycle in (''CHAMPION_FINAL'', ''WEEK_18_EXHIBITION'', ''FINAL'') then');

  d := pg_get_functiondef('api.get_live_week_operations(text)'::regprocedure);
  old := '''weekState'', v_week.state,';
  if strpos(d, old) = 0 then raise exception 'Operations week projection changed'; end if;
  execute replace(d, old, old || '
    ''correctionsOpen'', v_week.state in (''LOCKED'', ''PROVISIONAL'', ''FINAL'') and (v_week.state <> ''FINAL'' or v_week.finalization_mode = ''AFTER_RESULTS'') and (v_week.correction_window_closes_at is null or private.stage1_season_time(v_season.id) < v_week.correction_window_closes_at),');
end;
$patch$;

-- Weekly results are immediate. Keep the existing integrity boundary for
-- freezing downstream playoff pairings and the complete season archive:
-- those publications must not strand a correction still inside its review period.
create function private.assert_week_review_complete(p_week_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from private.season_weeks week where week.id = p_week_id
    and week.finalization_mode = 'AFTER_RESULTS'
    and (week.correction_window_closes_at is null
      or private.stage1_season_time(week.season_id) < week.correction_window_closes_at)) then
    raise exception using errcode = '55000', message = 'The score review period must close before downstream playoff or archive publication.';
  end if;
end;
$$;
revoke all on function private.assert_week_review_complete(uuid) from public, anon, authenticated;

do $dependencies$
declare d text; old text;
begin
  d := pg_get_functiondef('api.publish_playoff_qualification(uuid,text)'::regprocedure);
  old := '  perform private.assert_phase8_terminal_lineage(v_season.id);';
  if strpos(d, old) = 0 then raise exception 'Qualification lineage gate changed'; end if;
  execute replace(d, old, '  perform private.assert_week_review_complete(v_week.id);' || chr(10) || old);

  d := pg_get_functiondef('api.publish_postseason_week(uuid,uuid,text[],text)'::regprocedure);
  old := '  v_round := private.build_phase8b_postseason_round(v_publication.id, v_next_week);';
  if strpos(d, old) = 0 then raise exception 'Postseason round builder changed'; end if;
  execute replace(d, old, '  if v_next_week > v_latest_week.nfl_week then perform private.assert_week_review_complete(v_latest_week.id); end if;' || chr(10) || old);

  d := pg_get_functiondef('api.finalize_season_archive(uuid,text)'::regprocedure);
  old := '  v_archive := private.append_phase8b_archive(v_season.id, v_user_id, null);';
  if strpos(d, old) = 0 then raise exception 'Archive publication gate changed'; end if;
  execute replace(d, old, '  perform private.assert_week_review_complete((select id from private.season_weeks where season_id = v_season.id and nfl_week = 18));' || chr(10) || old);
end;
$dependencies$;

-- Existing complete-but-unfinalized weeks adopt the approved policy now. No
-- historical FINAL week or frozen receipt/ruleset is rewritten.
do $catch_up$
declare w record;
begin
  for w in select week.id from private.season_weeks week
    where week.state = 'PROVISIONAL' and week.finalization_mode = 'AFTER_RESULTS'
  loop
    perform private.finalize_completed_week(w.id);
  end loop;
end;
$catch_up$;
