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
  on conflict on constraint league_memberships_pkey do nothing;
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
