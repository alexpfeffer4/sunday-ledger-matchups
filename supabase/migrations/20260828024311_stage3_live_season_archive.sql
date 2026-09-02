-- Stage 3: publish the terminal Live-season archive only after Week 17 is
-- final. The archive is derived from immutable competitive records; callers
-- do not submit a champion, score, standing, or history payload.

create table private.live_season_archives (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null unique,
  league_id uuid not null,
  ruleset_snapshot_id uuid not null references private.season_ruleset_snapshots (id),
  schedule_publication_id uuid not null references private.schedule_publications (id),
  playoff_publication_id uuid not null references private.playoff_publications (id),
  championship_result_version_id uuid not null
    references private.matchup_result_versions (id),
  third_place_result_version_id uuid not null
    references private.matchup_result_versions (id),
  champion_entry_id uuid not null,
  runner_up_entry_id uuid not null,
  third_place_entry_id uuid,
  third_place_tied boolean not null,
  archive_hash text not null unique check (archive_hash ~ '^[0-9a-f]{64}$'),
  archive_json jsonb not null check (jsonb_typeof(archive_json) = 'object'),
  published_by uuid not null references private.profiles (id),
  published_at timestamptz not null default clock_timestamp(),
  foreign key (season_id, league_id)
    references private.seasons (id, league_id),
  foreign key (schedule_publication_id, season_id, league_id)
    references private.schedule_publications (id, season_id, league_id),
  foreign key (playoff_publication_id, season_id, league_id)
    references private.playoff_publications (id, season_id, league_id),
  foreign key (champion_entry_id, season_id, league_id)
    references private.season_entries (id, season_id, league_id),
  foreign key (runner_up_entry_id, season_id, league_id)
    references private.season_entries (id, season_id, league_id),
  foreign key (third_place_entry_id, season_id, league_id)
    references private.season_entries (id, season_id, league_id),
  unique (id, season_id, league_id),
  check (champion_entry_id <> runner_up_entry_id),
  check (
    (third_place_tied and third_place_entry_id is null)
    or (not third_place_tied and third_place_entry_id is not null)
  )
);

create index live_season_archives_league_published_idx
  on private.live_season_archives (league_id, published_at desc);
create index live_season_archives_ruleset_fk_idx
  on private.live_season_archives (ruleset_snapshot_id);
create index live_season_archives_schedule_fk_idx
  on private.live_season_archives (schedule_publication_id, season_id, league_id);
create index live_season_archives_playoff_fk_idx
  on private.live_season_archives (playoff_publication_id, season_id, league_id);
create index live_season_archives_championship_result_fk_idx
  on private.live_season_archives (championship_result_version_id);
create index live_season_archives_third_place_result_fk_idx
  on private.live_season_archives (third_place_result_version_id);
create index live_season_archives_champion_fk_idx
  on private.live_season_archives (champion_entry_id, season_id, league_id);
create index live_season_archives_runner_up_fk_idx
  on private.live_season_archives (runner_up_entry_id, season_id, league_id);
create index live_season_archives_third_place_fk_idx
  on private.live_season_archives (third_place_entry_id, season_id, league_id)
  where third_place_entry_id is not null;
create index live_season_archives_published_by_fk_idx
  on private.live_season_archives (published_by);

alter table private.live_season_archives enable row level security;

create policy live_season_archives_select_member
on private.live_season_archives for select to authenticated
using ((select private.is_league_member(league_id)));

revoke all on table private.live_season_archives
from public, anon, authenticated;
grant select on table private.live_season_archives to authenticated;

create trigger live_season_archives_append_only
before update or delete on private.live_season_archives
for each row execute function private.reject_competitive_mutation();

create or replace function private.live_archive_standings(p_rows jsonb)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    standing.value || jsonb_build_object(
      'playoffEligible', (standing.value ->> 'attendanceMisses')::integer < 3
    ) order by standing.ordinality
  ), '[]'::jsonb)
  from jsonb_array_elements(p_rows) with ordinality as standing(value, ordinality);
$$;

create or replace function private.live_archive_card(p_card_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'entryId', card.entry_id,
    'compliance', score.compliance,
    'allocatedCredits', coalesce((
      select sum(receipt.stake_credits)::integer
      from private.position_receipts as receipt
      where receipt.card_id = card.id
    ), 0),
    'scoreCenticredits', score.score_centicredits,
    'receipts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', receipt.id,
          'receiptHash', receipt.receipt_hash,
          'eventId', receipt.event_id,
          'marketType', receipt.market_type,
          'selection', upper(receipt.outcome_key),
          'americanOdds', receipt.american_odds,
          'lineMilli', receipt.line_milli,
          'stakeCredits', receipt.stake_credits,
          'outcome', settlement.outcome,
          'returnedCenticredits', settlement.returned_centicredits
        ) order by receipt.accepted_at, receipt.id
      )
      from private.position_receipts as receipt
      left join lateral (
        select candidate.*
        from private.settlement_versions as candidate
        where candidate.receipt_id = receipt.id
        order by candidate.created_at desc, candidate.id desc
        limit 1
      ) as settlement on true
      where receipt.card_id = card.id
    ), '[]'::jsonb)
  )
  from private.weekly_cards as card
  join lateral (
    select candidate.*
    from private.weekly_score_versions as candidate
    where candidate.card_id = card.id and candidate.status = 'FINAL'
    order by candidate.created_at desc, candidate.id desc
    limit 1
  ) as score on true
  where card.id = p_card_id;
$$;

create or replace function private.live_archive_matchup(
  p_matchup_id uuid,
  p_playoff_publication_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_matchup private.matchups%rowtype;
  v_week private.season_weeks%rowtype;
  v_round private.playoff_round_publications%rowtype;
  v_result private.matchup_result_versions%rowtype;
  v_side_a_card_id uuid;
  v_side_b_card_id uuid;
  v_side_a_complete boolean;
  v_side_b_complete boolean;
  v_winner_id uuid;
  v_advancement_reason text;
  v_label text;
  v_outcome jsonb;
begin
  select matchup.* into strict v_matchup
  from private.matchups as matchup
  where matchup.id = p_matchup_id;

  select week.* into strict v_week
  from private.season_weeks as week
  where week.id = v_matchup.week_id;

  select result.* into strict v_result
  from private.matchup_result_versions as result
  where result.matchup_id = v_matchup.id and result.status = 'FINAL'
  order by result.created_at desc, result.id desc
  limit 1;

  select card.id into strict v_side_a_card_id
  from private.weekly_cards as card
  where card.week_id = v_week.id and card.entry_id = v_matchup.side_a_entry_id;
  select card.id into strict v_side_b_card_id
  from private.weekly_cards as card
  where card.week_id = v_week.id and card.entry_id = v_matchup.side_b_entry_id;

  select score.is_complete into strict v_side_a_complete
  from private.weekly_score_versions as score
  where score.id = v_result.side_a_score_version_id;
  select score.is_complete into strict v_side_b_complete
  from private.weekly_score_versions as score
  where score.id = v_result.side_b_score_version_id;

  if v_matchup.scope = 'PLAYOFF' then
    v_outcome := private.final_playoff_matchup_outcome(
      v_matchup.id,
      p_playoff_publication_id
    );
    v_winner_id := (v_outcome #>> '{winner,entryId}')::uuid;
    v_advancement_reason := case
      when not v_side_a_complete or not v_side_b_complete then 'INCOMPLETE'
      when v_result.side_a_decision = 'WIN' or v_result.side_b_decision = 'WIN'
        then 'SCORE'
      else 'HIGHER_SEED_TIEBREAK'
    end;
  else
    v_winner_id := case
      when v_result.side_a_decision = 'WIN' then v_matchup.side_a_entry_id
      when v_result.side_b_decision = 'WIN' then v_matchup.side_b_entry_id
      else null
    end;
    v_advancement_reason := null;
  end if;

  if v_matchup.playoff_round_publication_id is not null then
    select round.* into strict v_round
    from private.playoff_round_publications as round
    where round.id = v_matchup.playoff_round_publication_id;
    v_label := v_round.matchups_json #>> array[
      (v_matchup.display_order - 1)::text,
      'label'
    ];
  else
    v_label := 'Week ' || v_week.nfl_week::text
      || ' · Matchup ' || v_matchup.display_order::text;
  end if;

  return jsonb_build_object(
    'id', v_matchup.id,
    'week', v_week.nfl_week,
    'scope', v_matchup.scope,
    'label', v_label,
    'sideAEntryId', v_matchup.side_a_entry_id,
    'sideBEntryId', v_matchup.side_b_entry_id,
    'sideAScoreCenticredits', v_result.side_a_points_for_centicredits,
    'sideBScoreCenticredits', v_result.side_b_points_for_centicredits,
    'sideADecision', v_result.side_a_decision,
    'sideBDecision', v_result.side_b_decision,
    'winnerEntryId', v_winner_id,
    'advancementReason', v_advancement_reason,
    'resultVersionId', v_result.id,
    'cards', jsonb_build_array(
      private.live_archive_card(v_side_a_card_id),
      private.live_archive_card(v_side_b_card_id)
    )
  );
end;
$$;

create or replace function private.build_live_season_archive(
  p_season_id uuid,
  p_published_at timestamptz
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_season private.seasons%rowtype;
  v_league private.leagues%rowtype;
  v_ruleset private.season_ruleset_snapshots%rowtype;
  v_schedule private.schedule_publications%rowtype;
  v_playoffs private.playoff_publications%rowtype;
  v_week17_round private.playoff_round_publications%rowtype;
  v_championship private.matchups%rowtype;
  v_third_place private.matchups%rowtype;
  v_championship_outcome jsonb;
  v_third_place_result private.matchup_result_versions%rowtype;
  v_champion_id uuid;
  v_runner_up_id uuid;
  v_third_place_id uuid;
  v_third_place_tied boolean;
  v_members jsonb;
  v_schedule_matchups jsonb;
  v_regular_weeks jsonb;
  v_playoff_games jsonb;
  v_week18_games jsonb;
begin
  select season.* into strict v_season
  from private.seasons as season where season.id = p_season_id;
  select league.* into strict v_league
  from private.leagues as league where league.id = v_season.league_id;
  select ruleset.* into strict v_ruleset
  from private.season_ruleset_snapshots as ruleset
  where ruleset.id = v_season.ruleset_snapshot_id;
  select publication.* into strict v_schedule
  from private.schedule_publications as publication
  where publication.season_id = v_season.id
  order by publication.version desc limit 1;
  select publication.* into strict v_playoffs
  from private.playoff_publications as publication
  where publication.season_id = v_season.id;
  select round.* into strict v_week17_round
  from private.playoff_round_publications as round
  where round.playoff_publication_id = v_playoffs.id and round.nfl_week = 17;

  select matchup.* into strict v_championship
  from private.matchups as matchup
  where matchup.playoff_round_publication_id = v_week17_round.id
    and matchup.scope = 'PLAYOFF';
  select matchup.* into strict v_third_place
  from private.matchups as matchup
  where matchup.playoff_round_publication_id = v_week17_round.id
    and matchup.scope = 'PLACEMENT';

  v_championship_outcome := private.final_playoff_matchup_outcome(
    v_championship.id,
    v_playoffs.id
  );
  v_champion_id := (v_championship_outcome #>> '{winner,entryId}')::uuid;
  v_runner_up_id := (v_championship_outcome #>> '{loser,entryId}')::uuid;

  select result.* into strict v_third_place_result
  from private.matchup_result_versions as result
  where result.matchup_id = v_third_place.id and result.status = 'FINAL'
  order by result.created_at desc, result.id desc limit 1;
  v_third_place_id := case
    when v_third_place_result.side_a_decision = 'WIN'
      then v_third_place.side_a_entry_id
    when v_third_place_result.side_b_decision = 'WIN'
      then v_third_place.side_b_entry_id
    else null
  end;
  v_third_place_tied := v_third_place_id is null;

  select jsonb_agg(jsonb_build_object(
    'entryId', entry.id,
    'displayName', profile.display_name,
    'initials', upper(left(regexp_replace(profile.display_name, '[^[:alnum:]]', '', 'g'), 2)),
    'deterministicTiebreak', entry.standing_tiebreak
  ) order by profile.display_name, entry.id)
  into v_members
  from private.season_entries as entry
  join private.profiles as profile on profile.id = entry.user_id
  where entry.season_id = v_season.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'week', week.nfl_week,
    'sideAEntryId', matchup.side_a_entry_id,
    'sideBEntryId', matchup.side_b_entry_id
  ) order by week.nfl_week, matchup.display_order), '[]'::jsonb)
  into v_schedule_matchups
  from private.matchups as matchup
  join private.season_weeks as week on week.id = matchup.week_id
  where matchup.season_id = v_season.id and matchup.scope = 'REGULAR';

  select coalesce(jsonb_agg(jsonb_build_object(
    'week', week.nfl_week,
    'matchups', (
      select coalesce(jsonb_agg(
        private.live_archive_matchup(matchup.id, v_playoffs.id)
        order by matchup.display_order
      ), '[]'::jsonb)
      from private.matchups as matchup where matchup.week_id = week.id
    ),
    'standings', (
      select private.live_archive_standings(snapshot.ordered_rows)
      from private.standings_snapshots as snapshot
      where snapshot.week_id = week.id and snapshot.status = 'FINAL'
      order by snapshot.created_at desc, snapshot.id desc limit 1
    )
  ) order by week.nfl_week), '[]'::jsonb)
  into v_regular_weeks
  from private.season_weeks as week
  where week.season_id = v_season.id
    and week.scope = 'REGULAR'
    and week.nfl_week between 1 and 14;

  select coalesce(jsonb_agg(
    private.live_archive_matchup(matchup.id, v_playoffs.id)
    order by week.nfl_week, matchup.display_order
  ), '[]'::jsonb)
  into v_playoff_games
  from private.matchups as matchup
  join private.season_weeks as week on week.id = matchup.week_id
  where matchup.season_id = v_season.id and week.nfl_week between 15 and 17;

  select coalesce(jsonb_agg(
    private.live_archive_matchup(matchup.id, v_playoffs.id)
    order by matchup.display_order
  ), '[]'::jsonb)
  into v_week18_games
  from private.matchups as matchup
  join private.season_weeks as week on week.id = matchup.week_id
  where matchup.season_id = v_season.id and week.nfl_week = 18;

  return jsonb_build_object(
    'schemaVersion', 1,
    'mode', 'LIVE',
    'seasonLabel', v_league.name,
    'nflYear', v_season.nfl_year,
    'generatedAt', p_published_at,
    'ruleset', jsonb_build_object(
      'id', v_ruleset.ruleset_id,
      'version', v_ruleset.ruleset_version,
      'playoffIneligibilityAtMisses', 3
    ),
    'members', v_members,
    'schedule', jsonb_build_object(
      'algorithmVersion', v_schedule.algorithm_version,
      'seed', v_schedule.seed,
      'orderedEntryIds', to_jsonb(v_schedule.ordered_entry_ids),
      'matchups', v_schedule_matchups,
      'outputHash', v_schedule.output_hash
    ),
    'regularSeason', jsonb_build_object(
      'weeks', v_regular_weeks,
      'finalStandings', private.live_archive_standings(v_playoffs.standings_json)
    ),
    'playoffs', jsonb_build_object(
      'qualifierCount', v_playoffs.expected_qualifier_count,
      'qualifiers', (
        select jsonb_agg(jsonb_build_object(
          'entryId', qualifier.value ->> 'entryId',
          'qualificationSeed', (qualifier.value ->> 'qualificationSeed')::integer
        ) order by (qualifier.value ->> 'qualificationSeed')::integer)
        from jsonb_array_elements(v_playoffs.qualifiers) as qualifier(value)
      ),
      'games', v_playoff_games,
      'championEntryId', v_champion_id,
      'runnerUpEntryId', v_runner_up_id,
      'thirdPlaceEntryId', v_third_place_id,
      'thirdPlaceTied', v_third_place_tied
    ),
    'week18', v_week18_games,
    'integrity', jsonb_build_object(
      'rulesetSnapshotId', v_ruleset.id,
      'schedulePublicationId', v_schedule.id,
      'playoffPublicationId', v_playoffs.id,
      'championshipResultVersionId', v_championship_outcome ->> 'resultVersionId',
      'thirdPlaceResultVersionId', v_third_place_result.id,
      'positionReceiptCount', (
        select count(*) from private.position_receipts as receipt
        join private.weekly_cards as card on card.id = receipt.card_id
        where card.season_id = v_season.id
      ),
      'correctionCount', (
        select count(*) from private.corrections as correction
        join private.season_weeks as week on week.id = correction.week_id
        where week.season_id = v_season.id
      )
    )
  );
end;
$$;

revoke execute on function private.live_archive_standings(jsonb)
from public, anon, authenticated;
revoke execute on function private.live_archive_card(uuid)
from public, anon, authenticated;
revoke execute on function private.live_archive_matchup(uuid, uuid)
from public, anon, authenticated;
revoke execute on function private.build_live_season_archive(uuid, timestamptz)
from public, anon, authenticated;

create or replace function api.publish_live_season_archive(
  p_league_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_season private.seasons%rowtype;
  v_week17 private.season_weeks%rowtype;
  v_schedule private.schedule_publications%rowtype;
  v_playoffs private.playoff_publications%rowtype;
  v_round private.playoff_round_publications%rowtype;
  v_championship private.matchups%rowtype;
  v_third_place private.matchups%rowtype;
  v_championship_result private.matchup_result_versions%rowtype;
  v_third_place_result private.matchup_result_versions%rowtype;
  v_outcome jsonb;
  v_archive private.live_season_archives%rowtype;
  v_command private.command_receipts%rowtype;
  v_request_hash text;
  v_archive_json jsonb;
  v_archive_hash text;
  v_published_at timestamptz := clock_timestamp();
  v_champion_id uuid;
  v_runner_up_id uuid;
  v_third_place_id uuid;
  v_third_place_tied boolean;
  v_response jsonb;
begin
  if v_user_id is null or not private.is_league_commissioner(p_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;
  if char_length(p_idempotency_key) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'Idempotency key is invalid.';
  end if;

  select season.* into strict v_season
  from private.seasons as season
  where season.league_id = p_league_id
    and season.mode = 'LIVE'
    and season.lifecycle in ('PLAYOFFS', 'FINAL')
  order by season.created_at desc limit 1 for update;

  v_request_hash := encode(extensions.digest(
    p_league_id::text || ':' || v_season.id::text || ':LIVE_SEASON_ARCHIVE',
    'sha256'
  ), 'hex');

  select command.* into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'PUBLISH_LIVE_SEASON_ARCHIVE'
    and command.idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json;
  end if;

  select archive.* into v_archive
  from private.live_season_archives as archive
  where archive.season_id = v_season.id;
  if found then
    v_response := jsonb_build_object(
      'archiveId', v_archive.id,
      'seasonId', v_archive.season_id,
      'leagueId', v_archive.league_id,
      'lifecycle', 'FINAL',
      'archiveHash', v_archive.archive_hash,
      'championEntryId', v_archive.champion_entry_id,
      'runnerUpEntryId', v_archive.runner_up_entry_id,
      'thirdPlaceEntryId', v_archive.third_place_entry_id,
      'thirdPlaceTied', v_archive.third_place_tied,
      'publishedAt', v_archive.published_at
    );
    insert into private.command_receipts (
      league_id, actor_user_id, command_name, idempotency_key,
      request_hash, response_json
    ) values (
      p_league_id, v_user_id, 'PUBLISH_LIVE_SEASON_ARCHIVE',
      p_idempotency_key, v_request_hash, v_response
    );
    return v_response;
  end if;

  if v_season.lifecycle <> 'PLAYOFFS' then
    raise exception using errcode = '55000', message = 'A final Live season is missing its immutable archive.';
  end if;

  select week.* into strict v_week17
  from private.season_weeks as week
  where week.season_id = v_season.id and week.nfl_week = 17;
  if v_week17.scope <> 'PLAYOFF' or v_week17.state <> 'FINAL' then
    raise exception using errcode = '55000', message = 'Week 17 must be final before the season archive can publish.';
  end if;
  if (select count(*) from private.season_weeks as week
      where week.season_id = v_season.id and week.scope = 'REGULAR'
        and week.nfl_week between 1 and 14 and week.state = 'FINAL') <> 14 then
    raise exception using errcode = '55000', message = 'All 14 regular-season weeks must be final before archival.';
  end if;
  if (select count(*) from private.playoff_round_publications as round
      join private.season_weeks as week on week.id = round.week_id
      where round.season_id = v_season.id and week.state = 'FINAL') <> 3 then
    raise exception using errcode = '55000', message = 'All three postseason rounds must be final before archival.';
  end if;
  if exists (
    select 1
    from private.matchups as matchup
    where matchup.season_id = v_season.id
      and not exists (
        select 1 from private.matchup_result_versions as result
        where result.matchup_id = matchup.id and result.status = 'FINAL'
      )
  ) then
    raise exception using errcode = '55000', message = 'Every published matchup requires a final result before archival.';
  end if;
  if exists (
    select 1
    from private.matchups as matchup
    cross join lateral (values (matchup.side_a_entry_id), (matchup.side_b_entry_id))
      as participant(entry_id)
    where matchup.season_id = v_season.id
      and not exists (
        select 1
        from private.weekly_cards as card
        join private.weekly_score_versions as score on score.card_id = card.id
        where card.week_id = matchup.week_id
          and card.entry_id = participant.entry_id
          and score.status = 'FINAL'
      )
  ) then
    raise exception using errcode = '55000', message = 'Every matchup participant requires a final weekly score before archival.';
  end if;
  if exists (
    select 1
    from private.position_receipts as receipt
    join private.weekly_cards as card on card.id = receipt.card_id
    where card.season_id = v_season.id
      and not exists (
        select 1 from private.settlement_versions as settlement
        where settlement.receipt_id = receipt.id
      )
  ) then
    raise exception using errcode = '55000', message = 'Every accepted receipt requires settlement before archival.';
  end if;

  select publication.* into strict v_schedule
  from private.schedule_publications as publication
  where publication.season_id = v_season.id
  order by publication.version desc limit 1;
  select publication.* into strict v_playoffs
  from private.playoff_publications as publication
  where publication.season_id = v_season.id;
  select round.* into strict v_round
  from private.playoff_round_publications as round
  where round.playoff_publication_id = v_playoffs.id and round.nfl_week = 17;
  select matchup.* into strict v_championship
  from private.matchups as matchup
  where matchup.playoff_round_publication_id = v_round.id
    and matchup.scope = 'PLAYOFF';
  select matchup.* into strict v_third_place
  from private.matchups as matchup
  where matchup.playoff_round_publication_id = v_round.id
    and matchup.scope = 'PLACEMENT';
  select result.* into strict v_championship_result
  from private.matchup_result_versions as result
  where result.matchup_id = v_championship.id and result.status = 'FINAL'
  order by result.created_at desc, result.id desc limit 1;
  select result.* into strict v_third_place_result
  from private.matchup_result_versions as result
  where result.matchup_id = v_third_place.id and result.status = 'FINAL'
  order by result.created_at desc, result.id desc limit 1;

  v_outcome := private.final_playoff_matchup_outcome(v_championship.id, v_playoffs.id);
  v_champion_id := (v_outcome #>> '{winner,entryId}')::uuid;
  v_runner_up_id := (v_outcome #>> '{loser,entryId}')::uuid;
  v_third_place_id := case
    when v_third_place_result.side_a_decision = 'WIN'
      then v_third_place.side_a_entry_id
    when v_third_place_result.side_b_decision = 'WIN'
      then v_third_place.side_b_entry_id
    else null
  end;
  v_third_place_tied := v_third_place_id is null;

  v_archive_json := private.build_live_season_archive(v_season.id, v_published_at);
  if jsonb_array_length(v_archive_json #> '{regularSeason,weeks}') <> 14
    or jsonb_array_length(v_archive_json #> '{regularSeason,finalStandings}')
      <> (select count(*) from private.season_entries where season_id = v_season.id)
    or jsonb_array_length(v_archive_json #> '{playoffs,games}') < 6 then
    raise exception using errcode = '55000', message = 'The derived season archive is incomplete.';
  end if;
  v_archive_hash := encode(extensions.digest(v_archive_json::text, 'sha256'), 'hex');

  insert into private.live_season_archives (
    season_id, league_id, ruleset_snapshot_id, schedule_publication_id,
    playoff_publication_id, championship_result_version_id,
    third_place_result_version_id, champion_entry_id, runner_up_entry_id,
    third_place_entry_id, third_place_tied, archive_hash, archive_json,
    published_by, published_at
  ) values (
    v_season.id, p_league_id, v_season.ruleset_snapshot_id, v_schedule.id,
    v_playoffs.id, v_championship_result.id, v_third_place_result.id,
    v_champion_id, v_runner_up_id, v_third_place_id, v_third_place_tied,
    v_archive_hash, v_archive_json, v_user_id, v_published_at
  ) returning * into v_archive;

  update private.seasons set lifecycle = 'FINAL'
  where id = v_season.id and lifecycle = 'PLAYOFFS';

  v_response := jsonb_build_object(
    'archiveId', v_archive.id,
    'seasonId', v_archive.season_id,
    'leagueId', v_archive.league_id,
    'lifecycle', 'FINAL',
    'archiveHash', v_archive.archive_hash,
    'championEntryId', v_archive.champion_entry_id,
    'runnerUpEntryId', v_archive.runner_up_entry_id,
    'thirdPlaceEntryId', v_archive.third_place_entry_id,
    'thirdPlaceTied', v_archive.third_place_tied,
    'publishedAt', v_archive.published_at
  );
  insert into private.command_receipts (
    league_id, actor_user_id, command_name, idempotency_key,
    request_hash, response_json
  ) values (
    p_league_id, v_user_id, 'PUBLISH_LIVE_SEASON_ARCHIVE',
    p_idempotency_key, v_request_hash, v_response
  );
  return v_response;
end;
$$;

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
  v_simulation jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;
  select league.* into strict v_league
  from private.leagues as league where league.slug = lower(p_league_slug);
  if not private.is_league_member(v_league.id) then
    raise exception using errcode = '42501', message = 'League membership required.';
  end if;

  select archive.* into v_live_archive
  from private.live_season_archives as archive
  where archive.league_id = v_league.id
  order by archive.published_at desc, archive.id desc limit 1;
  if found then
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
  end if;

  v_simulation := api.get_simulation_season_archive(p_league_slug);
  return v_simulation;
end;
$$;

revoke all on function api.publish_live_season_archive(uuid, text)
from public, anon;
grant execute on function api.publish_live_season_archive(uuid, text)
to authenticated;
revoke all on function api.get_season_archive(text) from public, anon;
grant execute on function api.get_season_archive(text) to authenticated;
