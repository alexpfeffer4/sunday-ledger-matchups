-- Stage 3: publish a reviewed provider import as an immutable eligible-event
-- slate. This intentionally does not lock the roster, publish the schedule,
-- open cards, or grant credits. Those competitive actions remain gated on an
-- even roster of 4--16 members.

create or replace function api.publish_live_week_slate(
  p_league_id uuid,
  p_import_id uuid,
  p_external_event_ids text[],
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
  v_import private.live_odds_imports%rowtype;
  v_command private.command_receipts%rowtype;
  v_week_id uuid := gen_random_uuid();
  v_slate_id uuid := gen_random_uuid();
  v_selected_event_ids text[];
  v_selected_count integer;
  v_available_count integer;
  v_request_hash text;
  v_published_at timestamptz := clock_timestamp();
  v_first_kickoff_at timestamptz;
  v_common_lock_at timestamptz;
  v_event_json jsonb;
  v_market_json jsonb;
  v_event_id uuid;
  v_snapshot_id uuid;
  v_line_milli integer;
  v_response jsonb;
begin
  if v_user_id is null or not private.is_league_commissioner(p_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;
  if char_length(p_idempotency_key) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'Idempotency key is invalid.';
  end if;
  if p_import_id is null
    or p_external_event_ids is null
    or cardinality(p_external_event_ids) not between 1 and 32 then
    raise exception using errcode = '22023', message = 'Select between one and 32 imported events.';
  end if;

  select array_agg(btrim(event_id) order by btrim(event_id))
  into v_selected_event_ids
  from unnest(p_external_event_ids) as selected(event_id);

  if exists (
    select 1
    from unnest(v_selected_event_ids) as selected(event_id)
    where selected.event_id = ''
  ) or (
    select count(*) from unnest(v_selected_event_ids)
  ) <> (
    select count(distinct event_id) from unnest(v_selected_event_ids) as selected(event_id)
  ) then
    raise exception using errcode = '22023', message = 'Selected event identifiers must be unique and non-empty.';
  end if;

  v_request_hash := encode(
    extensions.digest(
      p_league_id::text || ':' || p_import_id::text || ':'
      || array_to_string(v_selected_event_ids, ','),
      'sha256'
    ),
    'hex'
  );

  select command.* into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'PUBLISH_LIVE_WEEK_SLATE'
    and command.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json;
  end if;

  select season.* into strict v_season
  from private.seasons as season
  where season.league_id = p_league_id
  order by season.created_at desc
  limit 1
  for update;

  if v_season.mode <> 'LIVE' or v_season.lifecycle <> 'DRAFT' then
    raise exception using errcode = '22023', message = 'A Draft Live season is required.';
  end if;
  if exists (
    select 1 from private.season_weeks as week where week.season_id = v_season.id
  ) then
    raise exception using errcode = '55000', message = 'A weekly slate is already published for this season.';
  end if;

  select odds_import.* into strict v_import
  from private.live_odds_imports as odds_import
  where odds_import.id = p_import_id
    and odds_import.season_id = v_season.id
    and odds_import.league_id = p_league_id;

  if exists (
    select 1
    from private.live_odds_imports as newer_import
    where newer_import.season_id = v_season.id
      and (newer_import.created_at, newer_import.id) > (v_import.created_at, v_import.id)
  ) then
    raise exception using errcode = '40001', message = 'A newer reviewed import is available.';
  end if;

  select count(*) into v_available_count
  from jsonb_array_elements(v_import.normalized_json -> 'events') as provider_event(value)
  where provider_event.value ->> 'externalEventId' = any(v_selected_event_ids);

  v_selected_count := cardinality(v_selected_event_ids);
  if v_available_count <> v_selected_count then
    raise exception using errcode = '22023', message = 'Every selected event must belong to the reviewed import.';
  end if;

  select min((provider_event.value ->> 'scheduledStartAt')::timestamptz)
  into v_first_kickoff_at
  from jsonb_array_elements(v_import.normalized_json -> 'events') as provider_event(value)
  where provider_event.value ->> 'externalEventId' = any(v_selected_event_ids);

  v_common_lock_at := v_first_kickoff_at - interval '5 minutes';
  if v_common_lock_at <= v_published_at then
    raise exception using errcode = '22023', message = 'The selected slate has already reached common lock.';
  end if;

  insert into private.season_weeks (
    id,
    season_id,
    league_id,
    nfl_week,
    scope,
    state,
    opens_at,
    common_lock_at
  ) values (
    v_week_id,
    v_season.id,
    p_league_id,
    1,
    'REGULAR',
    'PLANNED',
    v_published_at,
    v_common_lock_at
  );

  insert into private.slates (
    id,
    week_id,
    season_id,
    league_id,
    version,
    fixture_id,
    common_lock_at,
    published_at
  ) values (
    v_slate_id,
    v_week_id,
    v_season.id,
    p_league_id,
    1,
    'live-import:' || v_import.id::text,
    v_common_lock_at,
    v_published_at
  );

  for v_event_json in
    select provider_event.value
    from jsonb_array_elements(v_import.normalized_json -> 'events') as provider_event(value)
    where provider_event.value ->> 'externalEventId' = any(v_selected_event_ids)
    order by (provider_event.value ->> 'scheduledStartAt')::timestamptz,
      provider_event.value ->> 'externalEventId'
  loop
    v_event_id := gen_random_uuid();
    insert into private.sports_events (
      id,
      week_id,
      season_id,
      league_id,
      fixture_event_key,
      away_team,
      home_team,
      scheduled_start_at,
      provider_health
    ) values (
      v_event_id,
      v_week_id,
      v_season.id,
      p_league_id,
      v_event_json ->> 'externalEventId',
      v_event_json ->> 'awayTeam',
      v_event_json ->> 'homeTeam',
      (v_event_json ->> 'scheduledStartAt')::timestamptz,
      'HEALTHY'
    );

    for v_market_json in
      select provider_market.value
      from jsonb_array_elements(v_event_json -> 'markets') as provider_market(value)
      order by provider_market.value ->> 'marketType', provider_market.value ->> 'outcomeKey'
    loop
      v_snapshot_id := gen_random_uuid();
      v_line_milli := case
        when jsonb_typeof(v_market_json -> 'lineMilli') = 'null' then null
        else (v_market_json ->> 'lineMilli')::integer
      end;

      insert into private.market_snapshots (
        id,
        event_id,
        week_id,
        league_id,
        book_key,
        market_type,
        outcome_key,
        proposition,
        line_milli,
        american_odds,
        quality_status,
        observed_at,
        payload_hash
      ) values (
        v_snapshot_id,
        v_event_id,
        v_week_id,
        p_league_id,
        lower(v_market_json ->> 'sourceBook'),
        upper(v_market_json ->> 'marketType'),
        upper(v_market_json ->> 'outcomeKey'),
        v_market_json ->> 'proposition',
        v_line_milli,
        (v_market_json ->> 'americanOdds')::integer,
        'HEALTHY',
        (v_market_json ->> 'observedAt')::timestamptz,
        encode(
          extensions.digest(
            (v_event_json ->> 'externalEventId') || ':' || v_market_json::text,
            'sha256'
          ),
          'hex'
        )
      );

      insert into private.slate_items (
        slate_id,
        event_id,
        market_snapshot_id,
        week_id,
        league_id
      ) values (
        v_slate_id,
        v_event_id,
        v_snapshot_id,
        v_week_id,
        p_league_id
      );
    end loop;
  end loop;

  if (
    select count(*) from private.sports_events as event where event.week_id = v_week_id
  ) <> v_selected_count or (
    select count(*) from private.slate_items as item where item.week_id = v_week_id
  ) <> v_selected_count * 6 then
    raise exception using errcode = '22023', message = 'The published slate is incomplete.';
  end if;

  v_response := jsonb_build_object(
    'leagueId', p_league_id,
    'seasonId', v_season.id,
    'weekId', v_week_id,
    'slateId', v_slate_id,
    'importId', v_import.id,
    'eventCount', v_selected_count,
    'marketCount', v_selected_count * 6,
    'commonLockAt', v_common_lock_at,
    'publishedAt', v_published_at,
    'weekState', 'PLANNED',
    'cardsOpened', false
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
    'PUBLISH_LIVE_WEEK_SLATE',
    p_idempotency_key,
    v_request_hash,
    v_response
  );

  return v_response;
end;
$$;

revoke execute on function api.publish_live_week_slate(uuid, uuid, text[], text)
from public, anon;
grant execute on function api.publish_live_week_slate(uuid, uuid, text[], text)
to authenticated;
