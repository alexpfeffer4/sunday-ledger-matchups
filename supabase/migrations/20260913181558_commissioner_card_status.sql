-- Owner-approved September 13: current commissioners may inspect only the
-- submission fact for the current week's roster. No receipt/draft metadata.
create function api.get_commissioner_card_status(p_league_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_league_id uuid;
  v_season_id uuid;
  v_week private.season_weeks%rowtype;
begin
  select id into v_league_id from private.leagues where slug = lower(p_league_slug);
  if (select auth.uid()) is null or v_league_id is null
    or not private.is_league_commissioner(v_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;
  -- Private rehearsal keeps its existing guide and containment contract.
  if exists(select 1 from private.owner_rehearsals where league_id = v_league_id) then
    return null;
  end if;
  select id into v_season_id from private.seasons
    where league_id = v_league_id order by created_at desc limit 1;
  select * into v_week from private.season_weeks
    where season_id = v_season_id order by nfl_week desc limit 1;
  if v_week.id is null or v_week.state = 'PLANNED' then return null; end if;
  return jsonb_build_object(
    'weekId', v_week.id,
    'nflWeek', v_week.nfl_week,
    'cards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'entryId', entry.id,
        'displayName', profile.display_name,
        'sealed', case when card.id is null then null else (
          select coalesce(sum(receipt.stake_credits), 0) = card.granted_credits
          from private.position_receipts receipt where receipt.card_id = card.id
        ) end
      ) order by profile.display_name, entry.id)
      from private.season_entries entry
      join private.profiles profile on profile.id = entry.user_id
      left join private.weekly_cards card on card.entry_id = entry.id and card.week_id = v_week.id
      where entry.season_id = v_season_id
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function api.get_commissioner_card_status(text) from public, anon;
grant execute on function api.get_commissioner_card_status(text) to authenticated;
notify pgrst, 'reload schema';
