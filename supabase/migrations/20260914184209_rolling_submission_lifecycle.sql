-- Rolling V1.3 uses the authoritative score/attendance/finality engine.
-- Legacy weeks retain their original common-lock and full-allocation contract.
-- Installing this migration does not activate the V1.3 rules catalog.

create function private.rolling_week_entries_closed(p_week_id uuid)
returns boolean language sql volatile security invoker set search_path = '' as $$
  select coalesce(private.card_confirmation_time(week.season_id)
    >= private.week_entry_closes_at(week.id), false)
  from private.season_weeks week where week.id = p_week_id;
$$;
revoke all on function private.rolling_week_entries_closed(uuid) from public, anon, authenticated;

-- Structural eligibility deliberately ignores quote availability/freshness.
-- An outage cannot finish a member's week while a legal later bet is possible.
create function private.rolling_card_can_submit(p_card_id uuid)
returns boolean language sql volatile security invoker set search_path = '' as $$
  select coalesce(private.is_rolling_week(card.week_id)
    and week.state in ('OPEN', 'LOCKED', 'PROVISIONAL')
    and private.card_confirmation_time(week.season_id) >= week.opens_at
    and not private.rolling_week_entries_closed(week.id)
    and card.granted_credits - totals.credits >= 50
    and totals.picks < 20
    and exists (
      select 1 from private.slate_items item
      join private.market_snapshots snapshot on snapshot.id = item.market_snapshot_id
      where item.week_id = week.id and private.is_effective_slate_item(item.id)
        and private.event_accepts_entries(snapshot.event_id)
        and snapshot.market_type in ('MONEYLINE', 'SPREAD', 'TOTAL')
        and not exists (select 1 from private.position_receipts receipt
          where receipt.card_id = card.id and receipt.event_id = snapshot.event_id
            and receipt.market_type = snapshot.market_type)
    ), false)
  from private.weekly_cards card
  join private.season_weeks week on week.id = card.week_id
  cross join lateral (select coalesce(sum(receipt.stake_credits), 0) credits, count(*) picks
    from private.position_receipts receipt where receipt.card_id = card.id) totals
  where card.id = p_card_id;
$$;
revoke all on function private.rolling_card_can_submit(uuid) from public, anon, authenticated;

create function private.refresh_rolling_week_compliance(p_week_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_week private.season_weeks%rowtype; v_closed boolean; v_now timestamptz;
begin
  select * into strict v_week from private.season_weeks where id = p_week_id for update;
  if not private.is_rolling_week(p_week_id) then return; end if;
  v_closed := private.rolling_week_entries_closed(p_week_id);
  v_now := private.card_confirmation_time(v_week.season_id);
  update private.weekly_cards card set
    compliance = case when exists (select 1 from private.position_receipts receipt where receipt.card_id = card.id)
      then 'COMPLIANT' when v_closed then 'INCOMPLETE' else 'PENDING' end,
    locked_at = case when v_closed then coalesce(card.locked_at, v_now) else card.locked_at end
  where card.week_id = p_week_id;
end;
$$;
revoke all on function private.refresh_rolling_week_compliance(uuid) from public, anon, authenticated;

-- Keep one authoritative score rebuild. NULL means recompute accepted receipts
-- and entry closure only; no event result or settlement evidence is invented.
do $recompute$
declare d text; old text;
begin
  d := pg_get_functiondef('private.recompute_stage1_week(uuid,uuid)'::regprocedure);
  old := $old$  select * into strict v_result
  from private.event_result_versions
  where id = p_result_version_id
    and week_id = p_week_id;$old$;
  if strpos(d, old) = 0 then raise exception 'Rolling rebuild result anchor changed'; end if;
  d := replace(d, old, $new$  perform private.refresh_rolling_week_compliance(p_week_id);
  if p_result_version_id is not null then
    select * into strict v_result from private.event_result_versions
      where id = p_result_version_id and week_id = p_week_id;
  elsif not private.is_rolling_week(p_week_id) then
    raise exception using errcode = '22023', message = 'Legacy rebuild requires an event result.';
  end if;$new$);
  old := $old$  loop
    select count(*) into v_receipt_count$old$;
  if strpos(d, old) = 0 then raise exception 'Rolling card loop anchor changed'; end if;
  d := replace(d, old, $new$  loop
    -- No score/attendance row exists for a member still free to start Monday.
    if v_card.compliance = 'PENDING' then continue; end if;
    select count(*) into v_receipt_count$new$);
  old := $old$    if v_card.compliance = 'INCOMPLETE' then
      v_score_centicredits := 0;$old$;
  if strpos(d, old) = 0 then raise exception 'Rolling score completeness anchor changed'; end if;
  d := replace(d, old, $new$    if private.is_rolling_week(p_week_id) then
      v_score_complete := v_score_complete
        and not private.rolling_card_can_submit(v_card.id)
        and (v_receipt_count > 0 or private.rolling_week_entries_closed(p_week_id));
    end if;
    if v_card.compliance = 'INCOMPLETE' then
      v_score_centicredits := 0;$new$);
  d := replace(d, 'select * into strict v_side_a_score', 'select * into v_side_a_score');
  d := replace(d, 'select * into strict v_side_b_score', 'select * into v_side_b_score');
  old := 'if not v_side_a_score.is_complete or not v_side_b_score.is_complete then';
  if strpos(d, old) = 0 then raise exception 'Rolling matchup completeness anchor changed'; end if;
  d := replace(d, old, 'if v_side_a_score.id is null or v_side_b_score.id is null or not v_side_a_score.is_complete or not v_side_b_score.is_complete then');
  execute d;
end;
$recompute$;

-- The old common-lock action starts the operational game-day phase. It never
-- converts a rolling partial/empty card to an early forfeit.
do $lock$
declare d text; old text;
begin
  d := pg_get_functiondef('api.lock_stage1_week(uuid,text)'::regprocedure);
  old := $old$    compliance = case
      when ($old$;
  if strpos(d, old) = 0 then raise exception 'Rolling common lock compliance anchor changed'; end if;
  d := replace(d, old, $new$    compliance = case
      when private.is_rolling_week(v_week.id) then case
        when exists (select 1 from private.position_receipts receipt where receipt.card_id = card.id) then 'COMPLIANT'
        when private.rolling_week_entries_closed(v_week.id) then 'INCOMPLETE'
        else 'PENDING' end
      when ($new$);
  old := '    locked_at = v_now';
  if strpos(d, old) = 0 then raise exception 'Rolling common lock timestamp anchor changed'; end if;
  d := replace(d, old, '    locked_at = case when private.is_rolling_week(v_week.id) and not private.rolling_week_entries_closed(v_week.id) then card.locked_at else v_now end');
  old := '  select count(*) into v_ready_count';
  if strpos(d, old) = 0 then raise exception 'Rolling common lock rebuild anchor changed'; end if;
  d := replace(d, old, '  if private.is_rolling_week(v_week.id) then perform private.recompute_stage1_week(v_week.id, null); end if;' || chr(10) || old);
  execute d;
end;
$lock$;

-- Explicit guard also protects older clients' commissioner compatibility RPC.
-- Preserve the existing all-published-games and score-review publication gates.
do $finalize$
declare d text; old text;
begin
  d := pg_get_functiondef('private.finalize_completed_week(uuid)'::regprocedure);
  old := $old$  if v_week.state not in ('LOCKED', 'PROVISIONAL', 'FINAL')$old$;
  if strpos(d, old) = 0 then raise exception 'Rolling finalization guard anchor changed'; end if;
  d := replace(d, old, $new$  if private.is_rolling_week(p_week_id) and exists (
    select 1 from private.weekly_cards card where card.week_id = p_week_id
      and (private.rolling_card_can_submit(card.id)
        or card.compliance = 'PENDING'
        or (not private.rolling_week_entries_closed(p_week_id)
          and not exists (select 1 from private.position_receipts receipt where receipt.card_id = card.id)))
  ) then
    raise exception using errcode = '55000', message = 'Rolling submissions must close before a final result.';
  end if;
  if v_week.state not in ('LOCKED', 'PROVISIONAL', 'FINAL')$new$);
  execute d;
end;
$finalize$;

-- Refresh time-derived closure through the already authorized score dispatcher,
-- Simulation clock and normal settlement. This never calls an external provider.
create function private.reconcile_rolling_week_closures(p_league_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_week record;
begin
  for v_week in select week.id from private.season_weeks week
    join private.seasons season on season.id = week.season_id
    where (p_league_id is null or week.league_id = p_league_id)
      and week.state in ('OPEN', 'LOCKED', 'PROVISIONAL')
      and private.is_rolling_week(week.id)
      and private.rolling_week_entries_closed(week.id)
      and (p_league_id is not null or season.mode = 'LIVE')
    order by week.season_id, week.nfl_week
  loop
    perform private.recompute_stage1_week(v_week.id, null);
  end loop;
end;
$$;
revoke all on function private.reconcile_rolling_week_closures(uuid) from public, anon, authenticated;

do $operations$
declare d text; old text;
begin
  d := pg_get_functiondef('private.claim_score_refresh(uuid,boolean)'::regprocedure);
  old := '  perform 1 from private.odds_refresh_policy for update;';
  if strpos(d, old) = 0 then raise exception 'Rolling score dispatch anchor changed'; end if;
  execute replace(d, old, old || chr(10) || '  perform private.reconcile_rolling_week_closures(p_league_id);');

  d := pg_get_functiondef('api.advance_stage1_clock(uuid,timestamp with time zone,text)'::regprocedure);
  old := $old$  update private.seasons
  set simulated_now = p_target$old$;
  if strpos(d, old) = 0 then raise exception 'Rolling clock lock anchor changed'; end if;
  d := replace(d, old, $new$  -- Acceptance and clock movement serialize through the same week row.
  perform 1 from private.season_weeks week where week.season_id = v_season.id
    and private.is_rolling_week(week.id) order by week.nfl_week for update;
  update private.seasons
  set simulated_now = p_target$new$);
  old := $old$  v_response := jsonb_build_object($old$;
  if strpos(d, old) = 0 then raise exception 'Rolling clock closure anchor changed'; end if;
  execute replace(d, old, '  perform private.reconcile_rolling_week_closures(p_league_id);' || chr(10) || old);

  d := pg_get_functiondef('private.due_score_events(uuid,boolean)'::regprocedure);
  old := $old$w.state in ('LOCKED','PROVISIONAL')$old$;
  if strpos(d, old) = 0 then raise exception 'Rolling score event eligibility anchor changed'; end if;
  execute replace(d, old, $new$(w.state in ('LOCKED','PROVISIONAL') or (w.state = 'OPEN' and private.is_rolling_week(w.id)))$new$);

  d := pg_get_functiondef('private.import_live_scores_as(uuid,uuid,jsonb,text)'::regprocedure);
  old := $old$  if v_week.state not in ('LOCKED', 'PROVISIONAL') and not ($old$;
  if strpos(d, old) = 0 then raise exception 'Rolling score importer state anchor changed'; end if;
  execute replace(d, old, $new$  if v_week.state not in ('LOCKED', 'PROVISIONAL') and not (v_week.state = 'OPEN' and private.is_rolling_week(v_week.id)) and not ($new$);

  d := pg_get_functiondef('private.record_stage1_result_as(uuid,uuid,text,integer,integer,text,text,text)'::regprocedure);
  old := $old$begin
  select event.* into strict v_event$old$;
  if strpos(d, old) = 0 then raise exception 'Rolling result lock order anchor changed'; end if;
  d := replace(d, old, $new$begin
  perform 1 from private.season_weeks week where week.id = (
    select event.week_id from private.sports_events event where event.id = p_event_id
  ) and private.is_rolling_week(week.id) for update;
  select event.* into strict v_event$new$);
  old := $old$  if v_week.state not in ('LOCKED', 'PROVISIONAL') and not ($old$;
  if strpos(d, old) = 0 then raise exception 'Rolling result state anchor changed'; end if;
  execute replace(d, old, $new$  if v_week.state not in ('LOCKED', 'PROVISIONAL') and not (v_week.state = 'OPEN' and private.is_rolling_week(v_week.id)) and not ($new$);
end;
$operations$;

-- The private rehearsal remains an orchestrator over the same acceptance RPC.
-- New-rule sample cards intentionally leave unused credits; some bots submit a
-- second independent batch. Existing legacy samples and stored choices survive.
do $rehearsal$
declare d text; old text;
begin
  d := pg_get_functiondef('private.record_owner_rehearsal_card_choice(uuid,text,text)'::regprocedure);
  old := '  if 1000 <> (';
  if strpos(d, old) = 0 then raise exception 'Rolling rehearsal choice anchor changed'; end if;
  d := replace(d, old, '  if (case when private.is_rolling_week(v_week.id) then 0 = (');
  old := $old$  ) then
    return;
  end if;
  insert into private.owner_rehearsal_card_choices$old$;
  if strpos(d, old) = 0 then raise exception 'Rolling rehearsal choice completion anchor changed'; end if;
  d := replace(d, old, $new$  ) else 1000 <> (
    select coalesce(sum(receipt.stake_credits), 0)
    from private.position_receipts receipt join private.weekly_cards card on card.id = receipt.card_id
    where card.week_id = v_week.id and card.owner_user_id = p_owner_user_id
  ) end) then
    return;
  end if;
  insert into private.owner_rehearsal_card_choices$new$);
  execute d;

  d := pg_get_functiondef('api.advance_owner_rehearsal(text,text)'::regprocedure);
  old := '    if v_owner_card_credits <> 1000 then';
  if strpos(d, old) = 0 then raise exception 'Rolling rehearsal advancement anchor changed'; end if;
  d := replace(d, old, '    if (case when private.is_rolling_week(v_week.id) then v_owner_card_credits = 0 else v_owner_card_credits <> 1000 end) then');
  d := replace(d, 'Seal your card or confirm a sample card before advancing.', 'Submit bets or confirm a sample card before advancing.');
  execute d;

  d := pg_get_functiondef('private.owner_rehearsal_sample_card(private.owner_rehearsals,integer,uuid)'::regprocedure);
  old := '  v_existing integer;';
  if strpos(d, old) = 0 then raise exception 'Rolling rehearsal sample declaration anchor changed'; end if;
  d := replace(d, old, old || chr(10) || '  v_sample_result jsonb; v_second_snapshot private.market_snapshots%rowtype;');
  old := '  if v_existing = 1000 then';
  if strpos(d, old) = 0 then raise exception 'Rolling rehearsal sample existing-card anchor changed'; end if;
  d := replace(d, old, '  if v_existing = 1000 or (private.is_rolling_week(v_week_id) and v_existing > 0) then');
  old := '  return private.accept_authoritative_card_for_actor(';
  if strpos(d, old) = 0 then raise exception 'Rolling rehearsal sample acceptance anchor changed'; end if;
  d := replace(d, old, '  v_sample_result := private.accept_authoritative_card_for_actor(');
  d := replace(d, '''stakeCredits'', 1000,', '''stakeCredits'', case when private.is_rolling_week(v_week_id) then 600 else 1000 end,');
  old := $old$      || ':w' || p_week::text || ':s' || v_seed::text
  );
end;$old$;
  if strpos(d, old) = 0 then raise exception 'Rolling rehearsal sample return anchor changed'; end if;
  d := replace(d, old, $new$      || ':w' || p_week::text || ':s' || v_seed::text
  );
  if private.is_rolling_week(v_week_id) and p_week <> 4 and v_seed > 1 and v_seed % 2 = 0 then
    select snapshot.* into v_second_snapshot
    from private.live_quote_heads head
    join private.market_snapshots snapshot on snapshot.id = head.market_snapshot_id
    where head.week_id = v_week_id and private.event_accepts_entries(snapshot.event_id)
      and (snapshot.event_id <> v_snapshot.event_id or snapshot.market_type <> v_snapshot.market_type)
    order by snapshot.event_id, snapshot.market_type, snapshot.outcome_key limit 1;
    if v_second_snapshot.id is not null then
      v_sample_result := private.accept_authoritative_card_for_actor(
        p_actor_user_id,
        (select league.slug from private.leagues league where league.id = p_rehearsal.league_id),
        jsonb_build_array(jsonb_build_object('marketSnapshotId', v_second_snapshot.id,
          'stakeCredits', 200, 'payloadHash', v_second_snapshot.payload_hash)),
        'rehearsal-card:' || substr(p_rehearsal.id::text, 1, 12)
          || ':w' || p_week::text || ':s' || v_seed::text || ':batch2'
      );
    end if;
  end if;
  return v_sample_result;
end;$new$);
  execute d;
end;
$rehearsal$;

notify pgrst, 'reload schema';
