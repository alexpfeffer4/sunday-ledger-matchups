-- All published weeks disclose successful submission facts immediately. This private
-- projection is called only after each public RPC's membership/rehearsal guard.
-- Never derive visible games from drafts, reviews, or idempotency requests.
create function private.rolling_card_public_fields(p_card_id uuid, p_week_id uuid)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_card private.weekly_cards%rowtype;
  v_week private.season_weeks%rowtype;
  v_allocated bigint;
  v_submitted boolean;
  v_aggregate_visible boolean;
  v_closed boolean;
  v_public jsonb;
begin
  select * into v_week from private.season_weeks where id = p_week_id;
  select * into v_card from private.weekly_cards where id = p_card_id and week_id = p_week_id;
  select coalesce(sum(stake_credits), 0), count(*) > 0 into v_allocated, v_submitted
    from private.position_receipts where card_id = v_card.id and week_id = p_week_id;
  v_public := jsonb_build_object(
    'submitted', case when v_card.id is null then null else v_submitted end,
    'selectedGames', coalesce((
      select jsonb_agg(jsonb_build_object(
        'eventId', event.id,
        'eventLabel', event.away_team || ' at ' || event.home_team,
        'scheduledStartAt', event.scheduled_start_at
      ) order by event.scheduled_start_at, event.id)
      from private.sports_events event
      where event.week_id = p_week_id and exists (
        select 1 from private.position_receipts receipt
        where receipt.card_id = v_card.id and receipt.week_id = p_week_id and receipt.event_id = event.id
      )
    ), '[]'::jsonb)
  );
  -- Game identity is a visibility rule, independent of the week's immutable
  -- submission/scoring rules. Only rolling weeks expose new budget fields.
  if not coalesce(private.is_rolling_week(p_week_id), false) then return v_public; end if;
  v_aggregate_visible := coalesce(private.stage1_season_time(v_week.season_id) >= v_week.common_lock_at, false);
  v_closed := private.rolling_week_entries_closed(p_week_id);
  return v_public || jsonb_build_object(
    'availableCredits', case when not v_aggregate_visible or v_card.id is null then null
      when v_closed then 0 else greatest(v_card.granted_credits - v_allocated, 0) end,
    'expiredCredits', case when not v_aggregate_visible or v_card.id is null then null
      when v_closed then greatest(v_card.granted_credits - v_allocated, 0) else 0 end,
    'canSubmit', case when not v_aggregate_visible or v_card.id is null then null
      else private.rolling_card_can_submit(v_card.id) end
  );
end;
$$;
revoke all on function private.rolling_card_public_fields(uuid,uuid) from public, anon, authenticated;

create or replace function api.get_league_matchup_cards(p_league_slug text, p_week_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_league_id uuid;
  v_week private.season_weeks%rowtype;
  v_now timestamptz;
  v_started boolean;
  v_rolling boolean;
  v_closed boolean;
begin
  select id into v_league_id from private.leagues where slug = lower(p_league_slug);
  if (select auth.uid()) is null or v_league_id is null
    or not private.is_league_member(v_league_id) then
    raise exception using errcode = '42501', message = 'League membership required.';
  end if;
  select * into v_week from private.season_weeks
    where id = p_week_id and league_id = v_league_id and state <> 'PLANNED';
  if v_week.id is null then
    raise exception using errcode = 'P0002', message = 'Published week not found.';
  end if;
  v_now := private.stage1_season_time(v_week.season_id);
  v_rolling := private.is_rolling_week(v_week.id);
  v_closed := v_rolling and private.rolling_week_entries_closed(v_week.id);
  select exists(select 1 from private.sports_events e where e.week_id = v_week.id
    and (e.state = 'VOID' or (e.state in ('LIVE','FINAL','CORRECTED')
      and e.actual_started_at is not null and e.actual_started_at <= v_now))) into v_started;
  return jsonb_build_object('weekId', v_week.id, 'cards', coalesce((
    select jsonb_agg(jsonb_build_object(
      'entryId', entry.id,
      'readiness', case when v_rolling then
        case when v_now is null or v_now < v_week.common_lock_at or card.id is null then null
          when totals.accepted > 0 then 'COMPLIANT' when v_closed then 'INCOMPLETE' else 'PENDING' end
        when v_week.state in ('LOCKED','PROVISIONAL','FINAL') then card.compliance else null end,
      'scoreCenticredits', case when v_rolling then
        case when card.id is null then null
          when totals.accepted = 0 then case when v_closed then 0 else null end
          when not v_started then null else visible.returned end
        when not v_started or v_week.state not in ('LOCKED','PROVISIONAL','FINAL') then null
        when card.compliance = 'INCOMPLETE' then 0
        when card.compliance = 'COMPLIANT' then visible.returned
        else null end,
      'outstanding', case
        when v_now is null or v_now < v_week.common_lock_at or card.id is null then null
        when v_rolling then jsonb_build_object('picks', totals.picks, 'credits', totals.credits)
        when card.compliance = 'INCOMPLETE' then jsonb_build_object('picks', 0, 'credits', 0)
        when card.compliance = 'COMPLIANT' or totals.allocated = card.granted_credits
          then jsonb_build_object('picks', totals.picks, 'credits', totals.credits)
        else null end,
      'positions', visible.positions
    ) || private.rolling_card_public_fields(card.id, v_week.id) order by entry.id)
    from private.season_entries entry
    left join private.weekly_cards card on card.entry_id = entry.id and card.week_id = v_week.id
    cross join lateral (
      select coalesce(sum(settlement.returned_centicredits),0) as returned,
        coalesce(jsonb_agg(jsonb_build_object(
          'id', receipt.id, 'eventId', event.id,
          'eventLabel', event.away_team || ' at ' || event.home_team,
          'marketType', receipt.market_type, 'proposition', receipt.proposition,
          'americanOdds', receipt.american_odds, 'stakeCredits', receipt.stake_credits,
          'settlement', case when settlement.id is null then null else jsonb_build_object(
            'outcome', settlement.outcome, 'returnedCenticredits', settlement.returned_centicredits) end
        ) order by event.scheduled_start_at, receipt.id),'[]'::jsonb) as positions
      from private.position_receipts receipt
      join private.sports_events event on event.id = receipt.event_id and event.week_id = v_week.id
      left join lateral (
        select candidate.* from private.settlement_versions candidate
        where candidate.receipt_id = receipt.id
        order by candidate.created_at desc, candidate.id desc limit 1
      ) settlement on true
      where receipt.card_id = card.id
        and (event.state = 'VOID' or (event.state in ('LIVE','FINAL','CORRECTED')
          and event.actual_started_at is not null and event.actual_started_at <= v_now))
    ) visible
    cross join lateral (
      select coalesce(sum(receipt.stake_credits), 0) as allocated,
        count(*) as accepted,
        count(*) filter (where not settled.is_settled) as picks,
        coalesce(sum(receipt.stake_credits) filter (where not settled.is_settled), 0) as credits
      from private.position_receipts receipt
      cross join lateral (
        select exists(select 1 from private.settlement_versions candidate
          where candidate.receipt_id = receipt.id) as is_settled
      ) settled
      where receipt.card_id = card.id and receipt.week_id = v_week.id
        and (v_rolling or v_now >= v_week.common_lock_at)
    ) totals
    where entry.season_id = v_week.season_id
  ),'[]'::jsonb));
end;
$$;
revoke all on function api.get_league_matchup_cards(text,uuid) from public, anon;
grant execute on function api.get_league_matchup_cards(text,uuid) to authenticated;

-- Publish game identities for existing and future weeks without changing their
-- submission contracts. Rolling eligibility and credit fields remain versioned.
-- The original body preserves governance, postseason and confirmed-start rules.
do $migration$
declare
  v_definition text;
  v_change record;
begin
  select pg_get_functiondef('api.get_stage1_state(text)'::regprocedure) into v_definition;
  for v_change in select * from (values
    ($old$  v_is_commissioner boolean;$old$, $new$  v_is_commissioner boolean;
  v_state jsonb;
  v_rolling_public jsonb;
  v_common_visible boolean;
  v_entry_closed boolean;$new$),
    ($old$  return jsonb_build_object($old$, $new$  v_state := jsonb_build_object($new$),
    ($old$  );
end;$old$, $new$  );
  if v_week.id is not null and v_matchup.id is not null then
    v_rolling_public := private.rolling_card_public_fields(v_opponent_card_id, v_week.id);
    v_state := jsonb_set(v_state, '{matchup}', (v_state -> 'matchup') || jsonb_build_object(
      'opponentSelectedGames', v_rolling_public -> 'selectedGames',
      'opponentSubmitted', v_rolling_public -> 'submitted'
    ));
  end if;
  if v_week.id is not null and private.is_rolling_week(v_week.id) then
    v_entry_closed := private.rolling_week_entries_closed(v_week.id);
    v_common_visible := coalesce(private.stage1_season_time(v_week.season_id) >= v_week.common_lock_at, false);
    v_state := jsonb_set(v_state, '{week}', (v_state -> 'week') || jsonb_build_object(
      'rollingSubmissionsEnabled', true,
      'entryClosesAt', private.week_entry_closes_at(v_week.id),
      'entryClosed', v_entry_closed
    ));
    v_state := jsonb_set(v_state, '{slate}', coalesce((
      select jsonb_agg(item || jsonb_build_object(
        'entryClosesAt', private.event_entry_closes_at((item ->> 'id')::uuid),
        'entryOpen', private.event_accepts_entries((item ->> 'id')::uuid)
      ) order by ordinal)
      from jsonb_array_elements(v_state -> 'slate') with ordinality as event(item, ordinal)
    ), '[]'::jsonb));
    if v_card.id is not null then
      v_state := jsonb_set(v_state, '{ownerCard}', (v_state -> 'ownerCard') || jsonb_build_object(
        'rollingSubmissionsEnabled', true,
        'canSubmit', private.rolling_card_can_submit(v_card.id)
      ));
    end if;
    if v_matchup.id is not null then
      v_state := jsonb_set(v_state, '{matchup}', (v_state -> 'matchup') || jsonb_build_object(
        'opponentSealed', v_rolling_public -> 'submitted',
        'opponentAvailableCredits', v_rolling_public -> 'availableCredits',
        'opponentExpiredCredits', v_rolling_public -> 'expiredCredits',
        'opponentCanSubmit', v_rolling_public -> 'canSubmit',
        'opponentReadiness', case when not v_common_visible or v_opponent_card_id is null then null
          when (v_rolling_public ->> 'submitted')::boolean then 'COMPLIANT'
          when v_entry_closed then 'INCOMPLETE' else 'PENDING' end
      ));
    end if;
  end if;
  return v_state;
end;$new$)
  ) as edits(old_text, new_text) loop
    if (length(v_definition) - length(replace(v_definition, v_change.old_text, ''))) / length(v_change.old_text) <> 1 then
      raise exception 'Rolling member-state projection baseline changed';
    end if;
    v_definition := replace(v_definition, v_change.old_text, v_change.new_text);
  end loop;
  execute v_definition;
end;
$migration$;

-- The commissioner continues to receive only one submission bit per member.
-- A partial rolling card is submitted; legacy cards still require full spend.
do $migration$
declare
  v_definition text;
  v_old text := $old$select coalesce(sum(receipt.stake_credits), 0) = card.granted_credits$old$;
begin
  select pg_get_functiondef('api.get_commissioner_card_status(text)'::regprocedure) into v_definition;
  if strpos(v_definition, v_old) = 0 or strpos(v_definition, $old$'nflWeek', v_week.nfl_week,$old$) = 0 then
    raise exception 'Rolling commissioner-status projection baseline changed';
  end if;
  v_definition := replace(v_definition, v_old, $new$select case when private.is_rolling_week(v_week.id) then count(*) > 0
            else coalesce(sum(receipt.stake_credits), 0) = card.granted_credits end$new$);
  v_definition := replace(v_definition, $old$'nflWeek', v_week.nfl_week,$old$, $new$'nflWeek', v_week.nfl_week,
    'rollingSubmissionsEnabled', private.is_rolling_week(v_week.id),$new$);
  execute v_definition;
end;
$migration$;
-- The private guide uses the same submitted meaning as the member pages.
do $migration$
declare d text; old text;
begin
  d := pg_get_functiondef('api.get_owner_rehearsal()'::regprocedure);
  old := 'select coalesce(sum(receipt.stake_credits), 0) = 1000';
  if strpos(d, old) = 0 or strpos(d, $old$'ownerCardSealed', coalesce(v_owner_card_sealed, false),$old$) = 0 then
    raise exception 'Rolling owner guide projection baseline changed';
  end if;
  d := replace(d, old, 'select case when private.is_rolling_week(v_week.id) then count(receipt.id) > 0 else coalesce(sum(receipt.stake_credits), 0) = 1000 end');
  d := replace(d, $old$'ownerCardSealed', coalesce(v_owner_card_sealed, false),$old$, $new$'ownerCardSealed', coalesce(v_owner_card_sealed, false),
    'rollingSubmissionsEnabled', case when v_week.id is not null then private.is_rolling_week(v_week.id)
      else exists(select 1 from private.season_ruleset_snapshots rules
        where rules.id = v_season.ruleset_snapshot_id and rules.ruleset_version = '1.3') end,$new$);
  execute d;
end;
$migration$;
notify pgrst, 'reload schema';
