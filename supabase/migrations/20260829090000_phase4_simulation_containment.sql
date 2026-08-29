-- Phase 4: contain the caller-authored Simulation archive shortcut.
-- Existing rows remain unchanged. Only the untrusted publication/read paths
-- are retired; the unified archive read model continues to serve Live history.

revoke all on function api.publish_simulation_season_archive(uuid, jsonb, text)
from public, anon, authenticated;
revoke all on function api.get_simulation_season_archive(text)
from public, anon, authenticated;
revoke all on table private.simulation_season_archives
from anon, authenticated;

comment on function api.publish_simulation_season_archive(uuid, jsonb, text) is
  'Retired by Phase 4. Caller-authored archives cannot publish trusted Simulation history.';
comment on function api.get_simulation_season_archive(text) is
  'Retired by Phase 4. Arbitrary legacy Simulation archives remain stored but hidden.';

create or replace function api.get_season_archive(p_league_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_league private.leagues%rowtype;
  v_live_archive private.live_season_archives%rowtype;
  v_viewer_entry_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;

  select league.* into strict v_league
  from private.leagues as league
  where league.slug = lower(p_league_slug);

  if not private.is_league_member(v_league.id) then
    raise exception using errcode = '42501', message = 'League membership required.';
  end if;

  select archive.* into v_live_archive
  from private.live_season_archives as archive
  where archive.league_id = v_league.id
  order by archive.published_at desc, archive.id desc
  limit 1;

  if not found then
    return null;
  end if;

  select entry.id into strict v_viewer_entry_id
  from private.season_entries as entry
  where entry.season_id = v_live_archive.season_id
    and entry.user_id = v_user_id;

  return v_live_archive.archive_json || jsonb_build_object(
    'viewerEntryId', v_viewer_entry_id,
    'archiveId', v_live_archive.id,
    'archiveHash', v_live_archive.archive_hash,
    'publishedAt', v_live_archive.published_at
  );
end;
$$;

revoke all on function api.get_season_archive(text) from public, anon;
grant execute on function api.get_season_archive(text) to authenticated;
