create or replace function api.get_league_invite_preview(p_token text)
returns table (
  league_name text,
  mode text,
  nfl_year integer,
  commissioner_name text,
  member_count integer,
  expires_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    league.name,
    season.mode,
    season.nfl_year,
    coalesce(profile.display_name, 'Commissioner'),
    (
      select count(*)::integer
      from private.league_memberships as membership
      where membership.league_id = invite.league_id
    ),
    invite.expires_at
  from private.league_invites as invite
  join private.leagues as league on league.id = invite.league_id
  join private.seasons as season on season.league_id = league.id
  left join private.profiles as profile on profile.id = league.created_by
  where char_length(p_token) between 16 and 120
    and invite.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and invite.revoked_at is null
    and invite.expires_at > now()
    and invite.uses < invite.max_uses
    and season.lifecycle = 'DRAFT'
  order by season.created_at desc
  limit 1;
$$;

create or replace function api.list_league_invites(p_league_slug text)
returns table (
  id uuid,
  created_at timestamptz,
  expires_at timestamptz,
  max_uses integer,
  uses integer,
  revoked_at timestamptz,
  active boolean,
  status text
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_league_id uuid;
begin
  select league.id into v_league_id
  from private.leagues as league
  where league.slug = p_league_slug;

  if v_league_id is null or not private.is_league_commissioner(v_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;

  return query
  select
    invite.id,
    invite.created_at,
    invite.expires_at,
    invite.max_uses,
    invite.uses,
    invite.revoked_at,
    invite.revoked_at is null
      and invite.expires_at > now()
      and invite.uses < invite.max_uses,
    case
      when invite.revoked_at is not null then 'Revoked'
      when invite.expires_at <= now() then 'Expired'
      when invite.uses >= invite.max_uses then 'Fully used'
      else 'Active'
    end
  from private.league_invites as invite
  where invite.league_id = v_league_id
  order by invite.created_at desc
  limit 20;
end;
$$;

create or replace function api.revoke_league_invite(
  p_league_id uuid,
  p_invite_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer := 0;
begin
  if (select auth.uid()) is null or not private.is_league_commissioner(p_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;

  update private.league_invites as invite
  set revoked_at = now()
  where invite.id = p_invite_id
    and invite.league_id = p_league_id
    and invite.revoked_at is null;
  get diagnostics v_updated = row_count;

  return v_updated = 1;
end;
$$;

revoke execute on function api.get_league_invite_preview(text) from public;
revoke execute on function api.list_league_invites(text) from public, anon;
revoke execute on function api.revoke_league_invite(uuid, uuid) from public, anon;

grant execute on function api.get_league_invite_preview(text) to anon, authenticated;
grant execute on function api.list_league_invites(text) to authenticated;
grant execute on function api.revoke_league_invite(uuid, uuid) to authenticated;
