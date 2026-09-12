-- Restore the existing untouched-draft deletion guard after the Phase 8B
-- archive table rename. No league data, competitive evidence, or rules change.
-- Preserve the existing private-helper boundary and all deletion conditions.

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
      select 1 from private.season_archive_versions as archive
      where archive.league_id = p_league_id
    )
    and not exists (
      select 1 from private.simulation_season_archives as archive
      where archive.league_id = p_league_id
    );
$$;

revoke all on function private.can_delete_empty_draft_league(uuid)
  from public, anon, authenticated;

