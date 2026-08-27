create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
create schema if not exists api;

-- Keep the Data API surface explicit and reproducible. Application tables stay
-- in private; only reviewed views and RPCs in api are addressable by PostgREST.
alter role authenticator set pgrst.db_schemas = 'api';
notify pgrst, 'reload config';

revoke all on schema private from public, anon, authenticated;
revoke all on schema api from public, anon, authenticated;
grant usage on schema private to authenticated;
grant usage on schema api to authenticated;

alter default privileges in schema private revoke execute on functions from public, anon, authenticated;
alter default privileges in schema api revoke execute on functions from public, anon, authenticated;

create table private.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_by uuid not null references private.profiles (id),
  created_at timestamptz not null default now()
);

create index leagues_created_by_idx
  on private.leagues (created_by);

create table private.league_memberships (
  league_id uuid not null references private.leagues (id) on delete cascade,
  user_id uuid not null references private.profiles (id) on delete cascade,
  role text not null check (role in ('MEMBER', 'COMMISSIONER')),
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create index league_memberships_user_id_idx
  on private.league_memberships (user_id, league_id);

create table private.league_invites (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references private.leagues (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  max_uses integer not null default 1 check (max_uses between 1 and 16),
  uses integer not null default 0 check (uses between 0 and max_uses),
  revoked_at timestamptz,
  created_by uuid not null references private.profiles (id),
  created_at timestamptz not null default now()
);

create index league_invites_league_id_idx
  on private.league_invites (league_id, expires_at);

create index league_invites_created_by_idx
  on private.league_invites (created_by);

create table private.season_ruleset_snapshots (
  id uuid primary key default gen_random_uuid(),
  ruleset_id text not null,
  ruleset_version text not null,
  product_bible_id text not null,
  product_bible_version text not null,
  mode text not null check (mode in ('LIVE', 'SIMULATION')),
  canonical_json jsonb not null,
  sha256_hash text not null check (sha256_hash ~ '^[0-9a-f]{64}$'),
  published_at timestamptz not null default now(),
  frozen_at timestamptz,
  created_at timestamptz not null default now()
);

create index season_ruleset_snapshots_hash_idx
  on private.season_ruleset_snapshots (sha256_hash);

create table private.seasons (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references private.leagues (id) on delete cascade,
  ruleset_snapshot_id uuid not null unique references private.season_ruleset_snapshots (id),
  mode text not null check (mode in ('LIVE', 'SIMULATION')),
  nfl_year integer not null check (nfl_year between 2020 and 2100),
  lifecycle text not null default 'DRAFT'
    check (lifecycle in ('DRAFT', 'ROSTER_LOCKED', 'REGULAR', 'PLAYOFFS', 'FINAL')),
  roster_seed text not null,
  schedule_seed text not null,
  roster_locked_at timestamptz,
  simulated_now timestamptz,
  created_at timestamptz not null default now(),
  unique (league_id, nfl_year, mode),
  unique (id, league_id),
  check ((mode = 'SIMULATION') or simulated_now is null)
);

create table private.season_entries (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  league_id uuid not null,
  user_id uuid not null,
  standing_tiebreak text not null check (standing_tiebreak ~ '^[0-9a-f]{64}$'),
  joined_at timestamptz not null default now(),
  foreign key (season_id, league_id)
    references private.seasons (id, league_id) on delete cascade,
  foreign key (league_id, user_id)
    references private.league_memberships (league_id, user_id) on delete cascade,
  unique (season_id, user_id),
  unique (season_id, standing_tiebreak)
);

create index season_entries_league_user_idx
  on private.season_entries (league_id, user_id);

alter table private.profiles enable row level security;
alter table private.leagues enable row level security;
alter table private.league_memberships enable row level security;
alter table private.league_invites enable row level security;
alter table private.season_ruleset_snapshots enable row level security;
alter table private.seasons enable row level security;
alter table private.season_entries enable row level security;

create or replace function private.is_league_member(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from private.league_memberships as membership
      where membership.league_id = p_league_id
        and membership.user_id = (select auth.uid())
    );
$$;

create or replace function private.is_league_commissioner(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from private.league_memberships as membership
      where membership.league_id = p_league_id
        and membership.user_id = (select auth.uid())
        and membership.role = 'COMMISSIONER'
    );
$$;

revoke execute on function private.is_league_member(uuid) from public, anon;
revoke execute on function private.is_league_commissioner(uuid) from public, anon;
grant execute on function private.is_league_member(uuid) to authenticated;
grant execute on function private.is_league_commissioner(uuid) to authenticated;

create policy profiles_select_same_league
on private.profiles for select
to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from private.league_memberships as profile_membership
    where profile_membership.user_id = private.profiles.id
      and (select private.is_league_member(profile_membership.league_id))
  )
);

create policy profiles_insert_self
on private.profiles for insert
to authenticated
with check (id = (select auth.uid()));

create policy profiles_update_self
on private.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy leagues_select_member
on private.leagues for select
to authenticated
using ((select private.is_league_member(id)));

create policy memberships_select_same_league
on private.league_memberships for select
to authenticated
using ((select private.is_league_member(league_id)));

create policy seasons_select_member
on private.seasons for select
to authenticated
using ((select private.is_league_member(league_id)));

create policy ruleset_snapshots_select_member
on private.season_ruleset_snapshots for select
to authenticated
using (
  exists (
    select 1
    from private.seasons as season
    where season.ruleset_snapshot_id = private.season_ruleset_snapshots.id
      and (select private.is_league_member(season.league_id))
  )
);

create policy season_entries_select_member
on private.season_entries for select
to authenticated
using ((select private.is_league_member(league_id)));

revoke all on all tables in schema private from anon, authenticated;
grant select, insert, update on table private.profiles to authenticated;
grant select on table private.leagues to authenticated;
grant select on table private.league_memberships to authenticated;
grant select on table private.season_ruleset_snapshots to authenticated;
grant select on table private.seasons to authenticated;
grant select on table private.season_entries to authenticated;

create or replace function private.guard_frozen_ruleset()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.frozen_at is not null then
    raise exception using
      errcode = '55000',
      message = 'A frozen season ruleset snapshot is immutable.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger guard_frozen_ruleset_update
before update on private.season_ruleset_snapshots
for each row execute function private.guard_frozen_ruleset();

create trigger guard_frozen_ruleset_delete
before delete on private.season_ruleset_snapshots
for each row execute function private.guard_frozen_ruleset();

create or replace function api.ensure_profile(p_display_name text default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_display_name text;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;

  v_display_name := nullif(btrim(p_display_name), '');
  if v_display_name is null then
    v_display_name := split_part(coalesce((select auth.jwt()) ->> 'email', 'Member'), '@', 1);
  end if;
  v_display_name := left(v_display_name, 60);

  insert into private.profiles (id, display_name)
  values (v_user_id, v_display_name)
  on conflict (id) do nothing;

  return v_user_id;
end;
$$;

create or replace function api.create_league(
  p_name text,
  p_slug text,
  p_mode text,
  p_nfl_year integer,
  p_ruleset_id text,
  p_ruleset_version text,
  p_product_bible_id text,
  p_product_bible_version text,
  p_canonical_ruleset jsonb,
  p_ruleset_sha256 text
)
returns table (league_id uuid, season_id uuid, league_slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_league_id uuid := gen_random_uuid();
  v_snapshot_id uuid := gen_random_uuid();
  v_season_id uuid := gen_random_uuid();
  v_entry_id uuid := gen_random_uuid();
  v_mode text := upper(p_mode);
  v_slug text := lower(btrim(p_slug));
  v_roster_seed text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;
  if v_mode not in ('LIVE', 'SIMULATION') then
    raise exception using errcode = '22023', message = 'Mode must be LIVE or SIMULATION.';
  end if;
  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception using errcode = '22023', message = 'League slug is invalid.';
  end if;
  if p_ruleset_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Ruleset hash is invalid.';
  end if;
  if upper(coalesce(p_canonical_ruleset ->> 'mode', '')) <> v_mode then
    raise exception using errcode = '22023', message = 'Ruleset mode does not match the season mode.';
  end if;

  insert into private.profiles (id, display_name)
  values (
    v_user_id,
    left(split_part(coalesce((select auth.jwt()) ->> 'email', 'Member'), '@', 1), 60)
  )
  on conflict (id) do nothing;

  insert into private.leagues (id, name, slug, created_by)
  values (v_league_id, btrim(p_name), v_slug, v_user_id);

  insert into private.league_memberships (league_id, user_id, role)
  values (v_league_id, v_user_id, 'COMMISSIONER');

  insert into private.season_ruleset_snapshots (
    id, ruleset_id, ruleset_version, product_bible_id,
    product_bible_version, mode, canonical_json, sha256_hash
  ) values (
    v_snapshot_id, p_ruleset_id, p_ruleset_version, p_product_bible_id,
    p_product_bible_version, v_mode, p_canonical_ruleset, p_ruleset_sha256
  );

  insert into private.seasons (
    id, league_id, ruleset_snapshot_id, mode, nfl_year,
    roster_seed, schedule_seed, simulated_now
  ) values (
    v_season_id, v_league_id, v_snapshot_id, v_mode, p_nfl_year,
    v_roster_seed, encode(extensions.gen_random_bytes(32), 'hex'),
    case when v_mode = 'SIMULATION' then now() else null end
  );

  insert into private.season_entries (
    id, season_id, league_id, user_id, standing_tiebreak
  ) values (
    v_entry_id, v_season_id, v_league_id, v_user_id,
    encode(
      extensions.digest(v_roster_seed || 'standings' || v_entry_id::text, 'sha256'),
      'hex'
    )
  );

  return query select v_league_id, v_season_id, v_slug;
end;
$$;

create or replace function api.create_league_invite(
  p_league_id uuid,
  p_expires_at timestamptz,
  p_max_uses integer default 1
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if v_user_id is null or not private.is_league_commissioner(p_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '30 days' then
    raise exception using errcode = '22023', message = 'Invite expiry is invalid.';
  end if;
  if p_max_uses < 1 or p_max_uses > 16 then
    raise exception using errcode = '22023', message = 'Invite use limit is invalid.';
  end if;

  insert into private.league_invites (
    league_id, token_hash, expires_at, max_uses, created_by
  ) values (
    p_league_id,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    p_expires_at,
    p_max_uses,
    v_user_id
  );

  return v_token;
end;
$$;

create or replace function api.join_league(p_token text)
returns table (league_id uuid, league_slug text, joined boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_invite private.league_invites%rowtype;
  v_season private.seasons%rowtype;
  v_entry_id uuid := gen_random_uuid();
  v_inserted integer := 0;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;

  select invite.* into v_invite
  from private.league_invites as invite
  where invite.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;

  if not found or v_invite.revoked_at is not null
    or v_invite.expires_at <= now() or v_invite.uses >= v_invite.max_uses then
    raise exception using errcode = '22023', message = 'Invite is invalid or expired.';
  end if;

  insert into private.profiles (id, display_name)
  values (
    v_user_id,
    left(split_part(coalesce((select auth.jwt()) ->> 'email', 'Member'), '@', 1), 60)
  )
  on conflict (id) do nothing;

  insert into private.league_memberships (league_id, user_id, role)
  values (v_invite.league_id, v_user_id, 'MEMBER')
  on conflict (league_id, user_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    update private.league_invites
    set uses = uses + 1
    where id = v_invite.id;

    select season.* into v_season
    from private.seasons as season
    where season.league_id = v_invite.league_id
      and season.lifecycle = 'DRAFT'
    order by season.created_at desc
    limit 1;

    if found then
      insert into private.season_entries (
        id, season_id, league_id, user_id, standing_tiebreak
      ) values (
        v_entry_id, v_season.id, v_season.league_id, v_user_id,
        encode(
          extensions.digest(v_season.roster_seed || 'standings' || v_entry_id::text, 'sha256'),
          'hex'
        )
      )
      on conflict (season_id, user_id) do nothing;
    end if;
  end if;

  return query
  select league.id, league.slug, v_inserted = 1
  from private.leagues as league
  where league.id = v_invite.league_id;
end;
$$;

revoke execute on function api.ensure_profile(text) from public, anon;
revoke execute on function api.create_league(text, text, text, integer, text, text, text, text, jsonb, text) from public, anon;
revoke execute on function api.create_league_invite(uuid, timestamptz, integer) from public, anon;
revoke execute on function api.join_league(text) from public, anon;
grant execute on function api.ensure_profile(text) to authenticated;
grant execute on function api.create_league(text, text, text, integer, text, text, text, text, jsonb, text) to authenticated;
grant execute on function api.create_league_invite(uuid, timestamptz, integer) to authenticated;
grant execute on function api.join_league(text) to authenticated;

create view api.my_profile
with (security_invoker = true)
as
select profile.id, profile.display_name, profile.avatar_url
from private.profiles as profile
where profile.id = (select auth.uid());

create view api.my_leagues
with (security_invoker = true)
as
select
  league.id,
  league.name,
  league.slug,
  membership.role,
  membership.joined_at
from private.league_memberships as membership
join private.leagues as league on league.id = membership.league_id
where membership.user_id = (select auth.uid());

create view api.league_members
with (security_invoker = true)
as
select
  membership.league_id,
  membership.user_id,
  profile.display_name,
  profile.avatar_url,
  membership.role,
  membership.joined_at
from private.league_memberships as membership
join private.profiles as profile on profile.id = membership.user_id;

revoke all on table api.my_profile from public, anon, authenticated;
revoke all on table api.my_leagues from public, anon, authenticated;
revoke all on table api.league_members from public, anon, authenticated;
grant select on table api.my_profile to authenticated;
grant select on table api.my_leagues to authenticated;
grant select on table api.league_members to authenticated;
