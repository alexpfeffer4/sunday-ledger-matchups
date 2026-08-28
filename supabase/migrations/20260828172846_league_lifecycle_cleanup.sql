-- Simplify league creation and add guarded lifecycle management.
alter table private.leagues
  add column if not exists archived_at timestamptz;

create index if not exists leagues_archived_at_idx
  on private.leagues (archived_at)
  where archived_at is not null;

create unique index if not exists league_memberships_one_commissioner_idx
  on private.league_memberships (league_id)
  where role = 'COMMISSIONER';

create or replace function private.can_delete_empty_draft_league(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from private.leagues as league
      join private.seasons as season on season.league_id = league.id
      where league.id = p_league_id
        and season.lifecycle = 'DRAFT'
        and season.roster_locked_at is null
    )
    and 1 = (
      select count(*)
      from private.league_memberships as membership
      where membership.league_id = p_league_id
    )
    and not exists (
      select 1 from private.season_weeks as week
      where week.league_id = p_league_id
    )
    and not exists (
      select 1 from private.command_receipts as receipt
      where receipt.league_id = p_league_id
    )
    and not exists (
      select 1 from private.live_odds_imports as import
      where import.league_id = p_league_id
    )
    and not exists (
      select 1 from private.live_score_imports as import
      where import.league_id = p_league_id
    )
    and not exists (
      select 1 from private.schedule_publications as publication
      where publication.league_id = p_league_id
    )
    and not exists (
      select 1 from private.playoff_publications as publication
      where publication.league_id = p_league_id
    )
    and not exists (
      select 1 from private.position_receipts as receipt
      where receipt.league_id = p_league_id
    )
    and not exists (
      select 1 from private.corrections as correction
      where correction.league_id = p_league_id
    )
    and not exists (
      select 1 from private.standings_snapshots as snapshot
      where snapshot.league_id = p_league_id
    )
    and not exists (
      select 1 from private.live_season_archives as archive
      where archive.league_id = p_league_id
    )
    and not exists (
      select 1 from private.simulation_season_archives as archive
      where archive.league_id = p_league_id
    );
$$;

revoke all on function private.can_delete_empty_draft_league(uuid)
  from public, anon, authenticated;

create or replace view api.my_leagues as
select
  league.id,
  league.name,
  league.slug,
  membership.role,
  membership.joined_at,
  season.mode,
  season.nfl_year,
  season.lifecycle,
  league.archived_at,
  (
    select count(*)::integer
    from private.league_memberships as member_count
    where member_count.league_id = league.id
  ) as member_count,
  (
    select max(week.nfl_week)
    from private.season_weeks as week
    where week.season_id = season.id
  ) as current_week,
  membership.role = 'COMMISSIONER'
    and private.can_delete_empty_draft_league(league.id) as can_delete
from private.league_memberships as membership
join private.leagues as league on league.id = membership.league_id
join lateral (
  select current_season.id,
         current_season.mode,
         current_season.nfl_year,
         current_season.lifecycle
  from private.seasons as current_season
  where current_season.league_id = league.id
  order by current_season.created_at desc
  limit 1
) as season on true
where membership.user_id = (select auth.uid());

revoke all on api.my_leagues from anon;
grant select on api.my_leagues to authenticated;

create or replace function api.rename_league(
  p_league_slug text,
  p_name text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league_id uuid;
  v_name text := btrim(p_name);
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception using errcode = '22023', message = 'League name must contain 1 through 80 characters.';
  end if;

  select league.id into v_league_id
  from private.leagues as league
  where league.slug = lower(btrim(p_league_slug))
  for update;

  if v_league_id is null or not private.is_league_commissioner(v_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;

  update private.leagues
  set name = v_name
  where id = v_league_id;

  return v_name;
end;
$$;

create or replace function api.set_league_archived(
  p_league_slug text,
  p_archived boolean
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league_id uuid;
  v_archived_at timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;

  select league.id into v_league_id
  from private.leagues as league
  where league.slug = lower(btrim(p_league_slug))
  for update;

  if v_league_id is null or not private.is_league_commissioner(v_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;

  update private.leagues
  set archived_at = case when p_archived then coalesce(archived_at, now()) else null end
  where id = v_league_id
  returning archived_at into v_archived_at;

  return v_archived_at;
end;
$$;

create or replace function api.delete_empty_draft_league(
  p_league_slug text,
  p_confirmation_name text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league_id uuid;
  v_league_name text;
  v_ruleset_snapshot_ids uuid[];
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;

  select league.id, league.name
  into v_league_id, v_league_name
  from private.leagues as league
  where league.slug = lower(btrim(p_league_slug))
  for update;

  if v_league_id is null or not private.is_league_commissioner(v_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;
  if p_confirmation_name is distinct from v_league_name then
    raise exception using errcode = '22023', message = 'League name confirmation does not match.';
  end if;
  if not private.can_delete_empty_draft_league(v_league_id) then
    raise exception using errcode = '55000', message = 'Only an untouched one-member Draft league can be deleted. Archive this league instead.';
  end if;

  select array_agg(season.ruleset_snapshot_id)
  into v_ruleset_snapshot_ids
  from private.seasons as season
  where season.league_id = v_league_id;

  delete from private.leagues
  where id = v_league_id;

  delete from private.season_ruleset_snapshots as snapshot
  where snapshot.id = any(coalesce(v_ruleset_snapshot_ids, array[]::uuid[]))
    and not exists (
      select 1 from private.seasons as season
      where season.ruleset_snapshot_id = snapshot.id
    );

  return true;
end;
$$;

create or replace function api.remove_league_member(
  p_league_slug text,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league_id uuid;
  v_lifecycle text;
  v_roster_locked_at timestamptz;
  v_target_role text;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;

  select league.id, season.lifecycle, season.roster_locked_at
  into v_league_id, v_lifecycle, v_roster_locked_at
  from private.leagues as league
  join private.seasons as season on season.league_id = league.id
  where league.slug = lower(btrim(p_league_slug))
  order by season.created_at desc
  limit 1
  for update of league, season;

  if v_league_id is null or not private.is_league_commissioner(v_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;
  if v_lifecycle <> 'DRAFT' or v_roster_locked_at is not null then
    raise exception using errcode = '55000', message = 'Members cannot be removed after roster lock.';
  end if;

  select membership.role into v_target_role
  from private.league_memberships as membership
  where membership.league_id = v_league_id
    and membership.user_id = p_user_id
  for update;

  if v_target_role is null then
    raise exception using errcode = 'P0002', message = 'League member not found.';
  end if;
  if v_target_role = 'COMMISSIONER' then
    raise exception using errcode = '55000', message = 'Transfer commissioner ownership before removing this member.';
  end if;

  delete from private.league_memberships
  where league_id = v_league_id and user_id = p_user_id;

  return true;
end;
$$;

create or replace function api.leave_league(p_league_slug text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_league_id uuid;
  v_lifecycle text;
  v_roster_locked_at timestamptz;
  v_role text;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;

  select league.id, season.lifecycle, season.roster_locked_at, membership.role
  into v_league_id, v_lifecycle, v_roster_locked_at, v_role
  from private.leagues as league
  join private.seasons as season on season.league_id = league.id
  join private.league_memberships as membership
    on membership.league_id = league.id and membership.user_id = v_user_id
  where league.slug = lower(btrim(p_league_slug))
  order by season.created_at desc
  limit 1
  for update of league, season, membership;

  if v_league_id is null then
    raise exception using errcode = 'P0002', message = 'League membership not found.';
  end if;
  if v_role = 'COMMISSIONER' then
    raise exception using errcode = '55000', message = 'Transfer commissioner ownership or delete the empty league instead.';
  end if;
  if v_lifecycle <> 'DRAFT' or v_roster_locked_at is not null then
    raise exception using errcode = '55000', message = 'Members cannot leave after roster lock.';
  end if;

  delete from private.league_memberships
  where league_id = v_league_id and user_id = v_user_id;

  return true;
end;
$$;

create or replace function api.transfer_league_commissioner(
  p_league_slug text,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_league_id uuid;
  v_target_role text;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;

  select league.id into v_league_id
  from private.leagues as league
  where league.slug = lower(btrim(p_league_slug))
  for update;

  if v_league_id is null or not private.is_league_commissioner(v_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;
  if p_user_id = v_user_id then
    raise exception using errcode = '22023', message = 'Choose another league member.';
  end if;

  select membership.role into v_target_role
  from private.league_memberships as membership
  where membership.league_id = v_league_id
    and membership.user_id = p_user_id
  for update;

  if v_target_role is null then
    raise exception using errcode = 'P0002', message = 'League member not found.';
  end if;

  update private.league_memberships
  set role = 'MEMBER'
  where league_id = v_league_id and user_id = v_user_id;

  update private.league_memberships
  set role = 'COMMISSIONER'
  where league_id = v_league_id and user_id = p_user_id;

  return true;
end;
$$;

revoke all on function api.rename_league(text, text) from public, anon;
revoke all on function api.set_league_archived(text, boolean) from public, anon;
revoke all on function api.delete_empty_draft_league(text, text) from public, anon;
revoke all on function api.remove_league_member(text, uuid) from public, anon;
revoke all on function api.leave_league(text) from public, anon;
revoke all on function api.transfer_league_commissioner(text, uuid) from public, anon;

grant execute on function api.rename_league(text, text) to authenticated;
grant execute on function api.set_league_archived(text, boolean) to authenticated;
grant execute on function api.delete_empty_draft_league(text, text) to authenticated;
grant execute on function api.remove_league_member(text, uuid) to authenticated;
grant execute on function api.leave_league(text) to authenticated;
grant execute on function api.transfer_league_commissioner(text, uuid) to authenticated;
