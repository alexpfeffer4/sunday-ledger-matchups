-- Stage 2: immutable, member-scoped full-season Simulation archives.
-- The archive is a completed projection produced by the same deterministic
-- weekly domain rules as the interactive vertical slice. Base data remains in
-- the private schema; the Data API exposes only guarded commands.

-- Stage 1 deliberately stopped Simulation rosters at eight. Stage 2 supports
-- every ruleset-approved even roster size, while archive publication itself
-- enforces evenness and the four-member minimum.
create or replace function private.guard_stage1_roster_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season private.seasons%rowtype;
  v_member_count integer;
begin
  perform 1
  from private.leagues
  where id = new.league_id
  for update;

  select season.* into v_season
  from private.seasons as season
  where season.league_id = new.league_id
  order by season.created_at desc
  limit 1;

  if v_season.id is null then
    return new;
  end if;
  if v_season.lifecycle <> 'DRAFT' then
    raise exception using errcode = '55000', message = 'The season roster is locked.';
  end if;

  if v_season.mode = 'SIMULATION' then
    select count(*) into v_member_count
    from private.league_memberships
    where league_id = new.league_id;

    if v_member_count >= 16 then
      raise exception using errcode = '22023', message = 'Simulation rosters support at most 16 members.';
    end if;
  end if;

  return new;
end;
$$;

create table private.simulation_season_archives (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null unique,
  league_id uuid not null,
  ruleset_snapshot_id uuid not null references private.season_ruleset_snapshots (id),
  roster_size integer not null check (
    roster_size between 4 and 16 and roster_size % 2 = 0
  ),
  regular_season_weeks integer not null default 14
    check (regular_season_weeks = 14),
  schedule_output_hash text not null check (schedule_output_hash ~ '^[0-9a-f]{64}$'),
  archive_hash text not null unique check (archive_hash ~ '^[0-9a-f]{64}$'),
  archive_json jsonb not null check (jsonb_typeof(archive_json) = 'object'),
  champion_entry_id uuid not null,
  published_by uuid not null references private.profiles (id),
  published_at timestamptz not null default clock_timestamp(),
  foreign key (season_id, league_id)
    references private.seasons (id, league_id),
  foreign key (champion_entry_id, season_id, league_id)
    references private.season_entries (id, season_id, league_id),
  unique (id, season_id, league_id)
);

create index simulation_season_archives_league_id_idx
  on private.simulation_season_archives (league_id, published_at desc);

create index simulation_season_archives_ruleset_snapshot_id_idx
  on private.simulation_season_archives (ruleset_snapshot_id);

create index simulation_season_archives_champion_entry_id_idx
  on private.simulation_season_archives (champion_entry_id, season_id, league_id);

create index simulation_season_archives_published_by_idx
  on private.simulation_season_archives (published_by);

alter table private.simulation_season_archives enable row level security;

create policy simulation_season_archives_select_member
on private.simulation_season_archives for select
to authenticated
using ((select private.is_league_member(league_id)));

revoke all on table private.simulation_season_archives from anon, authenticated;
grant select on table private.simulation_season_archives to authenticated;

create trigger simulation_season_archives_append_only
before update or delete on private.simulation_season_archives
for each row execute function private.reject_competitive_mutation();

create or replace function api.publish_simulation_season_archive(
  p_league_id uuid,
  p_archive_json jsonb,
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
  v_command private.command_receipts%rowtype;
  v_member_count integer;
  v_archive_member_count integer;
  v_archive_hash text;
  v_request_hash text;
  v_archive_id uuid := gen_random_uuid();
  v_champion_entry_id uuid;
  v_schedule_output_hash text;
  v_week jsonb;
  v_week_number integer;
  v_week_matchup_count integer;
  v_week_participant_count integer;
  v_response jsonb;
begin
  if v_user_id is null or not private.is_league_commissioner(p_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;
  if char_length(p_idempotency_key) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'Idempotency key is invalid.';
  end if;
  if jsonb_typeof(p_archive_json) <> 'object' then
    raise exception using errcode = '22023', message = 'The season archive must be a JSON object.';
  end if;

  perform 1
  from private.leagues
  where id = p_league_id
  for update;

  select season.* into strict v_season
  from private.seasons as season
  where season.league_id = p_league_id
  order by season.created_at desc
  limit 1
  for update;

  v_archive_hash := encode(
    extensions.digest(p_archive_json::text, 'sha256'),
    'hex'
  );
  v_request_hash := encode(
    extensions.digest(p_league_id::text || ':' || v_archive_hash, 'sha256'),
    'hex'
  );

  select * into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'PUBLISH_SIMULATION_SEASON_ARCHIVE'
    and command.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json;
  end if;

  if v_season.mode <> 'SIMULATION' then
    raise exception using errcode = '22023', message = 'Only Simulation seasons can publish a simulated archive.';
  end if;
  if v_season.lifecycle <> 'DRAFT' then
    raise exception using errcode = '55000', message = 'A simulation archive must publish before interactive play begins.';
  end if;

  select count(*) into v_member_count
  from private.season_entries
  where season_id = v_season.id;

  if v_member_count < 4 or v_member_count > 16 or v_member_count % 2 <> 0 then
    raise exception using
      errcode = '22023',
      message = 'A simulation archive requires an even roster from 4 through 16.';
  end if;

  if (p_archive_json ->> 'schemaVersion')::integer <> 1
    or p_archive_json ->> 'mode' <> 'SIMULATION'
    or (p_archive_json ->> 'nflYear')::integer <> v_season.nfl_year
    or (p_archive_json #>> '{ruleset,id}') is distinct from (
      select snapshot.ruleset_id
      from private.season_ruleset_snapshots as snapshot
      where snapshot.id = v_season.ruleset_snapshot_id
    ) then
    raise exception using errcode = '22023', message = 'The archive identity does not match the frozen Simulation season.';
  end if;

  if jsonb_typeof(p_archive_json -> 'members') <> 'array'
    or jsonb_array_length(p_archive_json -> 'members') <> v_member_count then
    raise exception using errcode = '22023', message = 'The archive roster does not match the season roster.';
  end if;

  select count(distinct (member ->> 'entryId')::uuid)
  into v_archive_member_count
  from jsonb_array_elements(p_archive_json -> 'members') as member;

  if v_archive_member_count <> v_member_count or exists (
    select 1
    from jsonb_array_elements(p_archive_json -> 'members') as member
    where not exists (
      select 1
      from private.season_entries as entry
      where entry.season_id = v_season.id
        and entry.id = (member ->> 'entryId')::uuid
    )
  ) then
    raise exception using errcode = '22023', message = 'The archive contains an unknown or duplicate season entry.';
  end if;

  if jsonb_typeof(p_archive_json #> '{regularSeason,weeks}') <> 'array'
    or jsonb_array_length(p_archive_json #> '{regularSeason,weeks}') <> 14
    or jsonb_typeof(p_archive_json #> '{regularSeason,finalStandings}') <> 'array'
    or jsonb_array_length(p_archive_json #> '{regularSeason,finalStandings}') <> v_member_count
    or jsonb_typeof(p_archive_json #> '{schedule,matchups}') <> 'array'
    or jsonb_array_length(p_archive_json #> '{schedule,matchups}') <> (v_member_count / 2) * 14 then
    raise exception using errcode = '22023', message = 'The archive does not contain a complete 14-week regular season.';
  end if;

  for v_week in
    select value
    from jsonb_array_elements(p_archive_json #> '{regularSeason,weeks}')
  loop
    v_week_number := (v_week ->> 'week')::integer;
    if v_week_number not between 1 and 14
      or jsonb_typeof(v_week -> 'matchups') <> 'array' then
      raise exception using errcode = '22023', message = 'A regular-season week is invalid.';
    end if;

    select
      count(*),
      count(distinct participant.entry_id)
    into v_week_matchup_count, v_week_participant_count
    from jsonb_array_elements(v_week -> 'matchups') as matchup
    cross join lateral (
      values
        ((matchup ->> 'sideAEntryId')::uuid),
        ((matchup ->> 'sideBEntryId')::uuid)
    ) as participant(entry_id);

    if v_week_matchup_count <> v_member_count
      or v_week_participant_count <> v_member_count
      or exists (
        select 1
        from jsonb_array_elements(v_week -> 'matchups') as matchup
        cross join lateral (
          values
            ((matchup ->> 'sideAEntryId')::uuid),
            ((matchup ->> 'sideBEntryId')::uuid)
        ) as participant(entry_id)
        where not exists (
          select 1
          from private.season_entries as entry
          where entry.season_id = v_season.id
            and entry.id = participant.entry_id
        )
      ) then
      raise exception using errcode = '22023', message = 'Every member must appear exactly once in each regular-season week.';
    end if;
  end loop;

  if (
    select count(distinct (week ->> 'week')::integer)
    from jsonb_array_elements(p_archive_json #> '{regularSeason,weeks}') as week
  ) <> 14 then
    raise exception using errcode = '22023', message = 'Regular-season week numbers must be unique.';
  end if;

  v_schedule_output_hash := p_archive_json #>> '{schedule,outputHash}';
  if v_schedule_output_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'The schedule output hash is invalid.';
  end if;

  v_champion_entry_id := (p_archive_json #>> '{playoffs,championEntryId}')::uuid;
  if not exists (
    select 1
    from private.season_entries as entry
    where entry.id = v_champion_entry_id
      and entry.season_id = v_season.id
  ) then
    raise exception using errcode = '22023', message = 'The archive champion is not a season entry.';
  end if;

  insert into private.simulation_season_archives (
    id,
    season_id,
    league_id,
    ruleset_snapshot_id,
    roster_size,
    schedule_output_hash,
    archive_hash,
    archive_json,
    champion_entry_id,
    published_by
  ) values (
    v_archive_id,
    v_season.id,
    p_league_id,
    v_season.ruleset_snapshot_id,
    v_member_count,
    v_schedule_output_hash,
    v_archive_hash,
    p_archive_json,
    v_champion_entry_id,
    v_user_id
  );

  update private.season_ruleset_snapshots
  set frozen_at = coalesce(frozen_at, clock_timestamp())
  where id = v_season.ruleset_snapshot_id;

  update private.seasons
  set
    roster_locked_at = coalesce(roster_locked_at, clock_timestamp()),
    lifecycle = 'FINAL'
  where id = v_season.id;

  v_response := jsonb_build_object(
    'archiveId', v_archive_id,
    'archiveHash', v_archive_hash,
    'seasonId', v_season.id,
    'rosterSize', v_member_count,
    'championEntryId', v_champion_entry_id,
    'state', 'FINAL'
  );

  insert into private.command_receipts (
    league_id,
    actor_user_id,
    command_name,
    idempotency_key,
    request_hash,
    response_json
  ) values (
    p_league_id,
    v_user_id,
    'PUBLISH_SIMULATION_SEASON_ARCHIVE',
    p_idempotency_key,
    v_request_hash,
    v_response
  );

  return v_response;
end;
$$;

create or replace function api.get_simulation_season_archive(p_league_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_league_id uuid;
  v_season_id uuid;
  v_viewer_entry_id uuid;
  v_archive jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;

  select league.id into strict v_league_id
  from private.leagues as league
  where league.slug = lower(p_league_slug);

  if not private.is_league_member(v_league_id) then
    raise exception using errcode = '42501', message = 'League membership required.';
  end if;

  select archive.archive_json, archive.season_id
  into v_archive, v_season_id
  from private.simulation_season_archives as archive
  where archive.league_id = v_league_id
  order by archive.published_at desc, archive.id desc
  limit 1;

  if v_archive is null then
    return null;
  end if;

  select entry.id into strict v_viewer_entry_id
  from private.season_entries as entry
  where entry.season_id = v_season_id
    and entry.user_id = v_user_id;

  return jsonb_set(
    v_archive,
    '{viewerEntryId}',
    to_jsonb(v_viewer_entry_id::text),
    true
  );
end;
$$;

revoke execute on function api.publish_simulation_season_archive(uuid, jsonb, text)
  from public, anon;
revoke execute on function api.get_simulation_season_archive(text)
  from public, anon;
grant execute on function api.publish_simulation_season_archive(uuid, jsonb, text)
  to authenticated;
grant execute on function api.get_simulation_season_archive(text)
  to authenticated;
