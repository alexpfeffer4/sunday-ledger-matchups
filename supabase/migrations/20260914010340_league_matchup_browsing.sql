-- Member-scoped league browsing, without impersonation or owner-card disclosure.
create function api.get_league_matchup_cards(p_league_slug text, p_week_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_league_id uuid;
  v_week private.season_weeks%rowtype;
  v_now timestamptz;
  v_started boolean;
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
  select exists(select 1 from private.sports_events e where e.week_id = v_week.id
    and (e.state = 'VOID' or (e.state in ('LIVE','FINAL','CORRECTED')
      and e.actual_started_at is not null and e.actual_started_at <= v_now))) into v_started;
  return jsonb_build_object('weekId', v_week.id, 'cards', coalesce((
    select jsonb_agg(jsonb_build_object(
      'entryId', entry.id,
      'readiness', case when v_week.state in ('LOCKED','PROVISIONAL','FINAL') then card.compliance else null end,
      'scoreCenticredits', case
        when not v_started or v_week.state not in ('LOCKED','PROVISIONAL','FINAL') then null
        when card.compliance = 'INCOMPLETE' then 0
        when card.compliance = 'COMPLIANT' then visible.returned
        else null end,
      'positions', visible.positions
    ) order by entry.id)
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
    where entry.season_id = v_week.season_id
  ),'[]'::jsonb));
end;
$$;
revoke all on function api.get_league_matchup_cards(text,uuid) from public, anon;
grant execute on function api.get_league_matchup_cards(text,uuid) to authenticated;
notify pgrst, 'reload schema';
