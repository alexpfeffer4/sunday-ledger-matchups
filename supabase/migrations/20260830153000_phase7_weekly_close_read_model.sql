-- Phase 7: one member-authorized, lineage-safe read model for weekly close,
-- active-season history, and factual rivalry records.
--
-- This migration is intentionally additive. It does not rewrite competitive
-- state and must be accepted separately before it is applied to a remote
-- environment.

create or replace function api.get_weekly_close_state(p_league_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_league private.leagues%rowtype;
  v_season private.seasons%rowtype;
  v_entry private.season_entries%rowtype;
  v_ruleset private.season_ruleset_snapshots%rowtype;
  v_roster_size integer;
  v_qualifier_count integer;
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

  select season.* into strict v_season
  from private.seasons as season
  where season.league_id = v_league.id
  order by season.created_at desc, season.id desc
  limit 1;

  select entry.* into strict v_entry
  from private.season_entries as entry
  where entry.season_id = v_season.id
    and entry.league_id = v_league.id
    and entry.user_id = v_user_id;

  select ruleset.* into strict v_ruleset
  from private.season_ruleset_snapshots as ruleset
  where ruleset.id = v_season.ruleset_snapshot_id;

  select count(*) into v_roster_size
  from private.season_entries as entry
  where entry.season_id = v_season.id
    and entry.league_id = v_league.id;

  if jsonb_typeof(v_ruleset.canonical_json -> 'playoffs') = 'object' then
    v_qualifier_count := case
      when v_roster_size <= nullif(
        v_ruleset.canonical_json #>> '{playoffs,smallLeagueMaximumSize}',
        ''
      )::integer then nullif(
        v_ruleset.canonical_json #>> '{playoffs,smallLeagueQualifiers}',
        ''
      )::integer
      else nullif(
        v_ruleset.canonical_json #>> '{playoffs,largeLeagueQualifiers}',
        ''
      )::integer
    end;
  end if;

  -- Every versioned competitive relation must have at most one terminal leaf
  -- per authoritative entity, and every supersession edge must stay within
  -- that entity. A split or cross-entity edge is an integrity stop, never an
  -- invitation to choose by timestamp or UUID.
  if exists (
    select 1
    from private.event_result_versions as child
    join private.event_result_versions as parent on parent.id = child.supersedes_id
    join private.sports_events as event on event.id = child.event_id
    where event.season_id = v_season.id
      and (
        parent.event_id <> child.event_id
        or parent.week_id <> child.week_id
        or parent.league_id <> child.league_id
      )
  ) or exists (
    select 1
    from private.event_result_versions as candidate
    join private.sports_events as event on event.id = candidate.event_id
    where event.season_id = v_season.id
      and not exists (
        select 1
        from private.event_result_versions as successor
        where successor.supersedes_id = candidate.id
      )
    group by candidate.event_id
    having count(*) > 1
  ) then
    raise exception using errcode = '55000', message = 'Competing official event results require commissioner resolution.';
  end if;

  if exists (
    select 1
    from private.weekly_score_versions as child
    join private.weekly_score_versions as parent on parent.id = child.supersedes_id
    join private.season_weeks as week on week.id = child.week_id
    where week.season_id = v_season.id
      and (
        parent.card_id <> child.card_id
        or parent.week_id <> child.week_id
        or parent.league_id <> child.league_id
        or parent.entry_id <> child.entry_id
      )
  ) or exists (
    select 1
    from private.weekly_score_versions as candidate
    join private.season_weeks as week on week.id = candidate.week_id
    where week.season_id = v_season.id
      and not exists (
        select 1
        from private.weekly_score_versions as successor
        where successor.supersedes_id = candidate.id
      )
    group by candidate.card_id
    having count(*) > 1
  ) then
    raise exception using errcode = '55000', message = 'Competing official weekly scores require commissioner resolution.';
  end if;

  if exists (
    select 1
    from private.matchup_result_versions as child
    join private.matchup_result_versions as parent on parent.id = child.supersedes_id
    join private.matchups as matchup on matchup.id = child.matchup_id
    where matchup.league_id = v_league.id
      and (
        parent.matchup_id <> child.matchup_id
        or parent.week_id <> child.week_id
        or parent.league_id <> child.league_id
      )
  ) or exists (
    select 1
    from private.matchup_result_versions as candidate
    join private.matchups as matchup on matchup.id = candidate.matchup_id
    where matchup.league_id = v_league.id
      and not exists (
        select 1
        from private.matchup_result_versions as successor
        where successor.supersedes_id = candidate.id
      )
    group by candidate.matchup_id
    having count(*) > 1
  ) then
    raise exception using errcode = '55000', message = 'Competing official matchup results require commissioner resolution.';
  end if;

  if exists (
    select 1
    from private.standings_snapshots as child
    join private.standings_snapshots as parent on parent.id = child.supersedes_id
    where child.season_id = v_season.id
      and (
        parent.season_id <> child.season_id
        or parent.week_id <> child.week_id
        or parent.league_id <> child.league_id
        or parent.through_week <> child.through_week
      )
  ) or exists (
    select 1
    from private.standings_snapshots as candidate
    where candidate.season_id = v_season.id
      and not exists (
        select 1
        from private.standings_snapshots as successor
        where successor.supersedes_id = candidate.id
      )
    group by candidate.season_id, candidate.through_week
    having count(*) > 1
  ) then
    raise exception using errcode = '55000', message = 'Competing official standings require commissioner resolution.';
  end if;

  return jsonb_build_object(
    'league', jsonb_build_object(
      'id', v_league.id,
      'name', v_league.name,
      'slug', v_league.slug,
      'mode', v_season.mode,
      'nflYear', v_season.nfl_year,
      'lifecycle', v_season.lifecycle
    ),
    'season', jsonb_build_object(
      'id', v_season.id,
      'regularSeasonWeeks', nullif(
        v_ruleset.canonical_json #>> '{schedule,regularSeasonWeeks}',
        ''
      )::integer,
      'correctionWindowHours', nullif(
        v_ruleset.canonical_json #>> '{settlement,correctionWindowHours}',
        ''
      )::integer,
      'qualifierCount', v_qualifier_count
    ),
    'viewer', (
      select jsonb_build_object(
        'entryId', v_entry.id,
        'displayName', profile.display_name
      )
      from private.profiles as profile
      where profile.id = v_user_id
    ),
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'entryId', entry.id,
          'userId', entry.user_id,
          'displayName', profile.display_name
        ) order by profile.display_name, entry.id
      )
      from private.season_entries as entry
      join private.profiles as profile on profile.id = entry.user_id
      where entry.season_id = v_season.id
        and entry.league_id = v_league.id
    ), '[]'::jsonb),
    'weeks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', week.id,
          'nflWeek', week.nfl_week,
          'scope', week.scope,
          'state', week.state,
          'correctionWindowClosesAt', week.correction_window_closes_at
        ) order by week.nfl_week, week.id
      )
      from private.season_weeks as week
      where week.season_id = v_season.id
        and week.league_id = v_league.id
    ), '[]'::jsonb),
    'matchups', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', matchup.id,
          'seasonId', matchup.season_id,
          'nflYear', matchup_season.nfl_year,
          'weekId', week.id,
          'nflWeek', week.nfl_week,
          'scope', matchup.scope,
          'displayOrder', matchup.display_order,
          'sideAEntryId', matchup.side_a_entry_id,
          'sideAUserId', side_a_entry.user_id,
          'sideBEntryId', matchup.side_b_entry_id,
          'sideBUserId', side_b_entry.user_id,
          'result', case when result.id is null then null else jsonb_build_object(
            'versionId', result.id,
            'supersedesVersionId', result.supersedes_id,
            'sideADecision', result.side_a_decision,
            'sideBDecision', result.side_b_decision,
            'sideAPointsForCenticredits', result.side_a_points_for_centicredits,
            'sideBPointsForCenticredits', result.side_b_points_for_centicredits,
            'status', result.status,
            'recordedAt', result.created_at
          ) end
        ) order by week.nfl_week, matchup.display_order, matchup.id
      )
      from private.matchups as matchup
      join private.season_weeks as week on week.id = matchup.week_id
      join private.seasons as matchup_season on matchup_season.id = matchup.season_id
      join private.season_entries as side_a_entry on side_a_entry.id = matchup.side_a_entry_id
      join private.season_entries as side_b_entry on side_b_entry.id = matchup.side_b_entry_id
      left join lateral (
        select candidate.*
        from private.matchup_result_versions as candidate
        where candidate.matchup_id = matchup.id
          and not exists (
            select 1
            from private.matchup_result_versions as successor
            where successor.supersedes_id = candidate.id
          )
        limit 1
      ) as result on true
      where matchup.league_id = v_league.id
    ), '[]'::jsonb),
    'standings', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'snapshotId', standings.id,
          'supersedesSnapshotId', standings.supersedes_id,
          'weekId', standings.week_id,
          'throughWeek', standings.through_week,
          'status', standings.status,
          'rows', standings.ordered_rows,
          'recordedAt', standings.created_at
        ) order by standings.through_week, standings.id
      )
      from private.standings_snapshots as standings
      where standings.season_id = v_season.id
        and standings.league_id = v_league.id
        and not exists (
          select 1
          from private.standings_snapshots as successor
          where successor.supersedes_id = standings.id
        )
    ), '[]'::jsonb),
    'corrections', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', correction.id,
          'weekId', correction.week_id,
          'nflWeek', week.nfl_week,
          'eventLabel', event.away_team || ' at ' || event.home_team,
          'reason', correction.reason,
          'actorName', actor.display_name,
          'correctedAt', correction.created_at,
          'beforeStandingsSnapshotId', correction.before_summary ->> 'standingsSnapshotId',
          'afterStandingsSnapshotId', correction.after_summary ->> 'standingsSnapshotId',
          'originalEvent', jsonb_build_object(
            'versionId', original.id,
            'status', original.status,
            'awayScore', original.away_score,
            'homeScore', original.home_score
          ),
          'correctedEvent', jsonb_build_object(
            'versionId', corrected.id,
            'status', corrected.status,
            'awayScore', corrected.away_score,
            'homeScore', corrected.home_score
          ),
          'effects', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'matchupId', affected.matchup_id,
                'before', case when prior.id is null then null else jsonb_build_object(
                  'versionId', prior.id,
                  'sideADecision', prior.side_a_decision,
                  'sideBDecision', prior.side_b_decision,
                  'sideAPointsForCenticredits', prior.side_a_points_for_centicredits,
                  'sideBPointsForCenticredits', prior.side_b_points_for_centicredits
                ) end,
                'after', jsonb_build_object(
                  'versionId', affected.id,
                  'sideADecision', affected.side_a_decision,
                  'sideBDecision', affected.side_b_decision,
                  'sideAPointsForCenticredits', affected.side_a_points_for_centicredits,
                  'sideBPointsForCenticredits', affected.side_b_points_for_centicredits
                )
              ) order by affected.matchup_id, affected.id
            )
            from private.matchup_result_versions as affected
            left join private.matchup_result_versions as prior
              on prior.id = affected.supersedes_id
            where affected.week_id = correction.week_id
              and affected.created_at >= corrected.created_at
              and affected.created_at <= correction.created_at
          ), '[]'::jsonb)
        ) order by correction.created_at, correction.id
      )
      from private.corrections as correction
      join private.season_weeks as week on week.id = correction.week_id
      join private.sports_events as event on event.id = correction.event_id
      join private.event_result_versions as original
        on original.id = correction.original_result_version_id
      join private.event_result_versions as corrected
        on corrected.id = correction.corrected_result_version_id
      join private.profiles as actor on actor.id = correction.actor_user_id
      where correction.league_id = v_league.id
    ), '[]'::jsonb),
    'playoffField', (
      select jsonb_build_object(
        'publicationId', publication.id,
        'qualifierCount', publication.expected_qualifier_count,
        'qualifiers', publication.qualifiers,
        'publishedAt', publication.published_at
      )
      from private.playoff_publications as publication
      where publication.season_id = v_season.id
        and publication.league_id = v_league.id
      limit 1
    )
  );
end;
$$;

revoke execute on function api.get_weekly_close_state(text) from public, anon;
grant execute on function api.get_weekly_close_state(text) to authenticated;
