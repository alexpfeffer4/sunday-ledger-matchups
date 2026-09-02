create table private.live_score_imports (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references private.seasons (id),
  week_id uuid not null references private.season_weeks (id),
  league_id uuid not null references private.leagues (id),
  source text not null default 'THE_ODDS_API'
    check (source = 'THE_ODDS_API'),
  fetched_at timestamptz not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null,
  imported_by uuid not null references private.profiles (id),
  created_at timestamptz not null default clock_timestamp(),
  unique (season_id, payload_hash)
);

create index live_score_imports_week_id_idx
  on private.live_score_imports (week_id, created_at desc);

create index live_score_imports_league_id_idx
  on private.live_score_imports (league_id, created_at desc);

create index live_score_imports_imported_by_idx
  on private.live_score_imports (imported_by);

alter table private.live_score_imports enable row level security;

revoke all on table private.live_score_imports from public, anon, authenticated;

create trigger live_score_imports_append_only
before update or delete on private.live_score_imports
for each row execute function private.reject_competitive_mutation();

alter table private.event_result_versions
  drop constraint event_result_versions_source_check;

alter table private.event_result_versions
  add constraint event_result_versions_source_check
  check (source in ('SIMULATION_FIXTURE', 'MANUAL_OBJECTIVE', 'THE_ODDS_API'));

do $$
declare
  v_definition text;
  v_old text := 'upper(p_source) not in (''SIMULATION_FIXTURE'', ''MANUAL_OBJECTIVE'')';
  v_new text := 'upper(p_source) not in (''SIMULATION_FIXTURE'', ''MANUAL_OBJECTIVE'', ''THE_ODDS_API'')';
  v_old_correction_guard text := 'v_week.correction_window_closes_at is null
      or private.stage1_season_time(v_event.season_id) >= v_week.correction_window_closes_at';
  v_new_correction_guard text := 'v_week.state = ''PROVISIONAL''
      and (
        v_week.correction_window_closes_at is null
        or private.stage1_season_time(v_event.season_id) >= v_week.correction_window_closes_at
      )';
begin
  select pg_get_functiondef(
    'api.record_stage1_result(uuid,text,integer,integer,text,text,text)'::regprocedure
  ) into strict v_definition;

  if strpos(v_definition, v_old) = 0 then
    raise exception 'record_stage1_result source guard changed unexpectedly';
  end if;
  if strpos(v_definition, v_old_correction_guard) = 0 then
    raise exception 'record_stage1_result correction guard changed unexpectedly';
  end if;

  execute replace(
    replace(v_definition, v_old, v_new),
    v_old_correction_guard,
    v_new_correction_guard
  );
end;
$$;

create or replace function api.import_live_scores(
  p_league_id uuid,
  p_import jsonb,
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
  v_week private.season_weeks%rowtype;
  v_event private.sports_events%rowtype;
  v_previous_result private.event_result_versions%rowtype;
  v_command private.command_receipts%rowtype;
  v_payload_event jsonb;
  v_fetched_at timestamptz;
  v_last_update timestamptz;
  v_away_score integer;
  v_home_score integer;
  v_completed boolean;
  v_payload_hash text;
  v_request_hash text;
  v_import_id uuid;
  v_event_count integer;
  v_live_count integer := 0;
  v_pending_count integer := 0;
  v_settled_count integer := 0;
  v_corrected_count integer := 0;
  v_unchanged_count integer := 0;
  v_response jsonb;
begin
  if v_user_id is null or not private.is_league_commissioner(p_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;
  if jsonb_typeof(p_import) <> 'object'
    or p_import ->> 'source' <> 'THE_ODDS_API'
    or jsonb_typeof(p_import -> 'events') <> 'array' then
    raise exception using errcode = '22023', message = 'The live score import envelope is invalid.';
  end if;

  begin
    v_fetched_at := (p_import ->> 'fetchedAt')::timestamptz;
  exception when others then
    raise exception using errcode = '22023', message = 'The live score fetch time is invalid.';
  end;

  if v_fetched_at < clock_timestamp() - interval '15 minutes'
    or v_fetched_at > clock_timestamp() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'The live score import is not fresh.';
  end if;

  v_event_count := jsonb_array_length(p_import -> 'events');
  if v_event_count not between 1 and 32 then
    raise exception using errcode = '22023', message = 'A live score import requires 1 through 32 events.';
  end if;
  if (
    select count(distinct item.value ->> 'externalEventId')
    from jsonb_array_elements(p_import -> 'events') as item(value)
  ) <> v_event_count then
    raise exception using errcode = '22023', message = 'The live score import contains duplicate events.';
  end if;

  select season.* into strict v_season
  from private.seasons as season
  where season.league_id = p_league_id
    and season.mode = 'LIVE'
    and season.lifecycle = 'REGULAR'
  order by season.created_at desc
  limit 1
  for update;

  select week.* into strict v_week
  from private.season_weeks as week
  where week.season_id = v_season.id
    and week.nfl_week = 1
  for update;

  if v_week.state not in ('LOCKED', 'PROVISIONAL') then
    raise exception using errcode = '55000', message = 'Live score imports require locked cards and an unfinalized week.';
  end if;

  if v_event_count <> (
    select count(*) from private.sports_events where week_id = v_week.id
  ) or exists (
    select 1
    from private.sports_events as event
    where event.week_id = v_week.id
      and not exists (
        select 1
        from jsonb_array_elements(p_import -> 'events') as item(value)
        where item.value ->> 'externalEventId' = event.fixture_event_key
      )
  ) then
    raise exception using errcode = '22023', message = 'The live score batch must match every published event.';
  end if;

  v_payload_hash := encode(
    extensions.digest(p_import::text, 'sha256'),
    'hex'
  );
  v_request_hash := encode(
    extensions.digest(p_league_id::text || ':' || v_payload_hash, 'sha256'),
    'hex'
  );

  select * into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'IMPORT_LIVE_SCORES'
    and command.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json;
  end if;

  insert into private.live_score_imports (
    season_id,
    week_id,
    league_id,
    fetched_at,
    payload_hash,
    payload,
    imported_by
  ) values (
    v_season.id,
    v_week.id,
    p_league_id,
    v_fetched_at,
    v_payload_hash,
    p_import,
    v_user_id
  )
  on conflict (season_id, payload_hash) do nothing
  returning id into v_import_id;

  if v_import_id is null then
    select score_import.id into strict v_import_id
    from private.live_score_imports as score_import
    where score_import.season_id = v_season.id
      and score_import.payload_hash = v_payload_hash;
  end if;

  for v_payload_event in
    select item.value
    from jsonb_array_elements(p_import -> 'events') as item(value)
    order by item.value ->> 'externalEventId'
  loop
    if jsonb_typeof(v_payload_event) <> 'object'
      or v_payload_event ->> 'source' <> 'THE_ODDS_API'
      or v_payload_event ->> 'sportKey' <> 'americanfootball_nfl'
      or jsonb_typeof(v_payload_event -> 'completed') <> 'boolean' then
      raise exception using errcode = '22023', message = 'A live score event is invalid.';
    end if;

    select event.* into strict v_event
    from private.sports_events as event
    where event.week_id = v_week.id
      and event.fixture_event_key = v_payload_event ->> 'externalEventId'
    for update;

    if v_payload_event ->> 'awayTeam' <> v_event.away_team
      or v_payload_event ->> 'homeTeam' <> v_event.home_team
      or (v_payload_event ->> 'scheduledStartAt')::timestamptz <> v_event.scheduled_start_at then
      raise exception using errcode = '22023', message = 'The provider changed a published event identity or kickoff.';
    end if;

    v_completed := (v_payload_event ->> 'completed')::boolean;
    begin
      v_away_score := (v_payload_event ->> 'awayScore')::integer;
      v_home_score := (v_payload_event ->> 'homeScore')::integer;
      v_last_update := (v_payload_event ->> 'lastUpdate')::timestamptz;
    exception when others then
      raise exception using errcode = '22023', message = 'A live score event contains invalid scores or update time.';
    end;

    if (v_away_score is null) <> (v_home_score is null)
      or v_away_score < 0
      or v_home_score < 0
      or (v_away_score is not null and v_last_update is null)
      or (v_completed and (v_away_score is null or v_last_update is null))
      or (v_last_update is not null and (
        v_last_update < v_event.scheduled_start_at - interval '6 hours'
        or v_last_update > v_fetched_at + interval '5 minutes'
      )) then
      raise exception using errcode = '22023', message = 'A live score event is internally inconsistent.';
    end if;

    if not v_completed and v_away_score is null then
      v_pending_count := v_pending_count + 1;
      continue;
    end if;

    update private.sports_events
    set
      state = case when state = 'SCHEDULED' then 'LIVE' else state end,
      actual_started_at = coalesce(actual_started_at, v_last_update)
    where id = v_event.id;

    if not v_completed then
      v_live_count := v_live_count + 1;
      continue;
    end if;

    select result.* into v_previous_result
    from private.event_result_versions as result
    where result.event_id = v_event.id
    order by result.version desc
    limit 1;

    if v_previous_result.id is not null
      and v_previous_result.status = 'FINAL'
      and v_previous_result.away_score = v_away_score
      and v_previous_result.home_score = v_home_score then
      v_unchanged_count := v_unchanged_count + 1;
      continue;
    end if;

    perform api.record_stage1_result(
      v_event.id,
      'FINAL',
      v_away_score,
      v_home_score,
      'The Odds API completed score observed at ' || v_last_update::text || '.',
      'THE_ODDS_API',
      'live-result:' || encode(
        extensions.digest(
          v_event.id::text || ':' || v_away_score::text || ':'
          || v_home_score::text || ':' || v_last_update::text,
          'sha256'
        ),
        'hex'
      )
    );

    if v_previous_result.id is null then
      v_settled_count := v_settled_count + 1;
    else
      v_corrected_count := v_corrected_count + 1;
    end if;
  end loop;

  v_response := jsonb_build_object(
    'importId', v_import_id,
    'eventCount', v_event_count,
    'pendingCount', v_pending_count,
    'liveCount', v_live_count,
    'settledCount', v_settled_count,
    'correctedCount', v_corrected_count,
    'unchangedCount', v_unchanged_count,
    'weekState', (select state from private.season_weeks where id = v_week.id)
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
    'IMPORT_LIVE_SCORES',
    p_idempotency_key,
    v_request_hash,
    v_response
  );

  return v_response;
end;
$$;

create or replace function api.correct_live_event_result(
  p_event_id uuid,
  p_status text,
  p_away_score integer,
  p_home_score integer,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_event private.sports_events%rowtype;
  v_season private.seasons%rowtype;
  v_previous private.event_result_versions%rowtype;
begin
  select event.* into strict v_event
  from private.sports_events as event
  where event.id = p_event_id
  for update;

  if v_user_id is null or not private.is_league_commissioner(v_event.league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;

  select season.* into strict v_season
  from private.seasons as season
  where season.id = v_event.season_id;

  if v_season.mode <> 'LIVE' then
    raise exception using errcode = '22023', message = 'Only Live seasons accept objective corrections.';
  end if;

  select result.* into strict v_previous
  from private.event_result_versions as result
  where result.event_id = p_event_id
  order by result.version desc
  limit 1;

  if char_length(btrim(p_reason)) not between 10 and 500 then
    raise exception using errcode = '22023', message = 'A visible correction reason of 10 through 500 characters is required.';
  end if;
  if upper(p_status) = v_previous.status
    and p_away_score is not distinct from v_previous.away_score
    and p_home_score is not distinct from v_previous.home_score then
    raise exception using errcode = '22023', message = 'A correction must change the recorded result.';
  end if;

  return api.record_stage1_result(
    p_event_id,
    p_status,
    p_away_score,
    p_home_score,
    p_reason,
    'MANUAL_OBJECTIVE',
    p_idempotency_key
  );
end;
$$;

create or replace function api.void_live_event_after_postponement_window(
  p_event_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_event private.sports_events%rowtype;
  v_season private.seasons%rowtype;
begin
  select event.* into strict v_event
  from private.sports_events as event
  where event.id = p_event_id
  for update;

  if v_user_id is null or not private.is_league_commissioner(v_event.league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;

  select season.* into strict v_season
  from private.seasons as season
  where season.id = v_event.season_id;

  if v_season.mode <> 'LIVE' then
    raise exception using errcode = '22023', message = 'Only Live seasons use the postponement window.';
  end if;
  if private.stage1_season_time(v_season.id) < v_event.scheduled_start_at + interval '48 hours' then
    raise exception using errcode = '55000', message = 'The 48-hour postponement window remains open.';
  end if;
  if exists (
    select 1 from private.event_result_versions where event_id = p_event_id
  ) then
    raise exception using errcode = '55000', message = 'The event already has a recorded result.';
  end if;

  return api.record_stage1_result(
    p_event_id,
    'VOID',
    null,
    null,
    p_reason,
    'MANUAL_OBJECTIVE',
    p_idempotency_key
  );
end;
$$;

create or replace function api.get_live_week_operations(p_league_slug text)
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
  v_week private.season_weeks%rowtype;
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
  where season.league_id = v_league.id and season.mode = 'LIVE'
  order by season.created_at desc
  limit 1;

  select week.* into v_week
  from private.season_weeks as week
  where week.season_id = v_season.id and week.nfl_week = 1;

  if v_week.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'weekState', v_week.state,
    'correctionWindowClosesAt', v_week.correction_window_closes_at,
    'latestImportAt', (
      select score_import.fetched_at
      from private.live_score_imports as score_import
      where score_import.week_id = v_week.id
      order by score_import.created_at desc, score_import.id desc
      limit 1
    ),
    'events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', event.id,
          'externalEventId', event.fixture_event_key,
          'awayTeam', event.away_team,
          'homeTeam', event.home_team,
          'scheduledStartAt', event.scheduled_start_at,
          'state', event.state,
          'canVoidAfterPostponement',
            result.id is null
            and private.stage1_season_time(v_season.id) >= event.scheduled_start_at + interval '48 hours',
          'correctionCount', (
            select count(*) from private.corrections as correction
            where correction.event_id = event.id
          ),
          'result', case when result.id is null then null else jsonb_build_object(
            'id', result.id,
            'version', result.version,
            'status', result.status,
            'awayScore', result.away_score,
            'homeScore', result.home_score,
            'source', result.source,
            'reason', result.reason,
            'recordedAt', result.created_at
          ) end
        ) order by event.scheduled_start_at, event.id
      )
      from private.sports_events as event
      left join lateral (
        select candidate.*
        from private.event_result_versions as candidate
        where candidate.event_id = event.id
        order by candidate.version desc
        limit 1
      ) as result on true
      where event.week_id = v_week.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function api.import_live_scores(uuid, jsonb, text) from public, anon;
revoke all on function api.correct_live_event_result(uuid, text, integer, integer, text, text) from public, anon;
revoke all on function api.void_live_event_after_postponement_window(uuid, text, text) from public, anon;
revoke all on function api.get_live_week_operations(text) from public, anon;

grant execute on function api.import_live_scores(uuid, jsonb, text) to authenticated;
grant execute on function api.correct_live_event_result(uuid, text, integer, integer, text, text) to authenticated;
grant execute on function api.void_live_event_after_postponement_window(uuid, text, text) to authenticated;
grant execute on function api.get_live_week_operations(text) to authenticated;
