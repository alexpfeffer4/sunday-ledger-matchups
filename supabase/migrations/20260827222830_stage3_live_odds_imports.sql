create table private.live_odds_imports (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  league_id uuid not null,
  source text not null check (source = 'THE_ODDS_API'),
  sport_key text not null check (sport_key = 'americanfootball_nfl'),
  fetched_at timestamptz not null,
  normalized_json jsonb not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  event_count integer not null check (event_count between 1 and 32),
  imported_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (season_id, league_id)
    references private.seasons (id, league_id) on delete cascade,
  foreign key (league_id, imported_by)
    references private.league_memberships (league_id, user_id),
  unique (season_id, payload_hash)
);

create index live_odds_imports_league_created_idx
  on private.live_odds_imports (league_id, created_at desc);

create index live_odds_imports_imported_by_idx
  on private.live_odds_imports (imported_by, league_id);

alter table private.live_odds_imports enable row level security;

create policy live_odds_imports_select_commissioner
on private.live_odds_imports for select to authenticated
using ((select private.is_league_commissioner(league_id)));

revoke all on table private.live_odds_imports from public, anon, authenticated;
grant select on table private.live_odds_imports to authenticated;

create trigger live_odds_imports_append_only
before update or delete on private.live_odds_imports
for each row execute function private.reject_competitive_mutation();

create or replace function api.store_live_odds_import(
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
  v_command private.command_receipts%rowtype;
  v_import private.live_odds_imports%rowtype;
  v_request_hash text;
  v_payload_hash text;
  v_fetched_at timestamptz;
  v_event_count integer;
  v_event jsonb;
  v_market jsonb;
  v_external_event_id text;
  v_event_ids text[] := array[]::text[];
  v_market_type text;
  v_outcome_key text;
  v_combinations text[];
  v_observed_at timestamptz;
  v_response jsonb;
  v_expected_combinations constant text[] := array[
    'MONEYLINE:AWAY',
    'MONEYLINE:HOME',
    'SPREAD:AWAY',
    'SPREAD:HOME',
    'TOTAL:OVER',
    'TOTAL:UNDER'
  ];
begin
  if v_user_id is null or not private.is_league_commissioner(p_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;
  if char_length(p_idempotency_key) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'Idempotency key is invalid.';
  end if;

  v_request_hash := encode(
    extensions.digest(p_league_id::text || ':' || p_import::text, 'sha256'),
    'hex'
  );

  select command.* into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'STORE_LIVE_ODDS_IMPORT'
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

  if v_season.mode <> 'LIVE' or v_season.lifecycle = 'FINAL' then
    raise exception using errcode = '22023', message = 'A non-final Live season is required.';
  end if;
  if jsonb_typeof(p_import) <> 'object'
    or p_import ->> 'source' <> 'THE_ODDS_API'
    or jsonb_typeof(p_import -> 'events') <> 'array' then
    raise exception using errcode = '22023', message = 'The live odds import envelope is invalid.';
  end if;

  begin
    v_fetched_at := (p_import ->> 'fetchedAt')::timestamptz;
  exception when others then
    raise exception using errcode = '22023', message = 'The provider fetch time is invalid.';
  end;
  if v_fetched_at is null then
    raise exception using errcode = '22023', message = 'The provider fetch time is invalid.';
  end if;
  if v_fetched_at > now() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'The provider fetch time is in the future.';
  end if;

  v_event_count := jsonb_array_length(p_import -> 'events');
  if v_event_count not between 1 and 32 then
    raise exception using errcode = '22023', message = 'The live odds event count is invalid.';
  end if;

  for v_event in select value from jsonb_array_elements(p_import -> 'events')
  loop
    v_external_event_id := btrim(coalesce(v_event ->> 'externalEventId', ''));
    if jsonb_typeof(v_event) <> 'object'
      or v_event ->> 'source' <> 'THE_ODDS_API'
      or v_event ->> 'sportKey' <> 'americanfootball_nfl'
      or v_external_event_id = ''
      or btrim(coalesce(v_event ->> 'awayTeam', '')) = ''
      or btrim(coalesce(v_event ->> 'homeTeam', '')) = ''
      or v_event ->> 'awayTeam' = v_event ->> 'homeTeam'
      or jsonb_typeof(v_event -> 'markets') <> 'array'
      or jsonb_array_length(v_event -> 'markets') <> 6 then
      raise exception using errcode = '22023', message = 'A provider event is invalid or incomplete.';
    end if;
    if array_position(v_event_ids, v_external_event_id) is not null then
      raise exception using errcode = '22023', message = 'The provider returned a duplicate event.';
    end if;
    v_event_ids := array_append(v_event_ids, v_external_event_id);

    if btrim(coalesce(v_event ->> 'scheduledStartAt', '')) = '' then
      raise exception using errcode = '22023', message = 'A provider kickoff time is invalid.';
    end if;
    begin
      perform (v_event ->> 'scheduledStartAt')::timestamptz;
    exception when others then
      raise exception using errcode = '22023', message = 'A provider kickoff time is invalid.';
    end;

    select array_agg(combination order by combination)
    into v_combinations
    from (
      select distinct
        upper(market ->> 'marketType') || ':' || upper(market ->> 'outcomeKey') as combination
      from jsonb_array_elements(v_event -> 'markets') as market
    ) as combinations;
    if v_combinations <> v_expected_combinations then
      raise exception using errcode = '22023', message = 'A provider event does not contain the complete main-market set.';
    end if;

    for v_market in select value from jsonb_array_elements(v_event -> 'markets')
    loop
      v_market_type := upper(coalesce(v_market ->> 'marketType', ''));
      v_outcome_key := upper(coalesce(v_market ->> 'outcomeKey', ''));
      if jsonb_typeof(v_market) <> 'object'
        or lower(coalesce(v_market ->> 'sourceBook', '')) <> 'draftkings'
        or btrim(coalesce(v_market ->> 'proposition', '')) = ''
        or coalesce(jsonb_typeof(v_market -> 'americanOdds'), 'missing') <> 'number'
        or (v_market ->> 'americanOdds') !~ '^-?[0-9]+$'
        or (v_market ->> 'americanOdds')::integer = 0 then
        raise exception using errcode = '22023', message = 'A provider market observation is invalid.';
      end if;
      if v_market_type = 'MONEYLINE'
        and coalesce(jsonb_typeof(v_market -> 'lineMilli'), 'missing') <> 'null' then
        raise exception using errcode = '22023', message = 'Moneyline observations cannot include a line.';
      end if;
      if v_market_type in ('SPREAD', 'TOTAL')
        and (
          coalesce(jsonb_typeof(v_market -> 'lineMilli'), 'missing') <> 'number'
          or (v_market ->> 'lineMilli') !~ '^-?[0-9]+$'
        ) then
        raise exception using errcode = '22023', message = 'Spread and total observations require integer milli-lines.';
      end if;
      if btrim(coalesce(v_market ->> 'observedAt', '')) = '' then
        raise exception using errcode = '22023', message = 'A provider observation time is invalid.';
      end if;
      begin
        v_observed_at := (v_market ->> 'observedAt')::timestamptz;
      exception when others then
        raise exception using errcode = '22023', message = 'A provider observation time is invalid.';
      end;
      if v_observed_at > now() + interval '5 minutes' then
        raise exception using errcode = '22023', message = 'A provider observation time is in the future.';
      end if;
    end loop;
  end loop;

  v_payload_hash := encode(extensions.digest(p_import::text, 'sha256'), 'hex');

  insert into private.live_odds_imports (
    season_id,
    league_id,
    source,
    sport_key,
    fetched_at,
    normalized_json,
    payload_hash,
    event_count,
    imported_by
  ) values (
    v_season.id,
    p_league_id,
    'THE_ODDS_API',
    'americanfootball_nfl',
    v_fetched_at,
    p_import,
    v_payload_hash,
    v_event_count,
    v_user_id
  )
  on conflict (season_id, payload_hash) do nothing
  returning * into v_import;

  if not found then
    select odds_import.* into strict v_import
    from private.live_odds_imports as odds_import
    where odds_import.season_id = v_season.id
      and odds_import.payload_hash = v_payload_hash;
  end if;

  v_response := jsonb_build_object(
    'importId', v_import.id,
    'payloadHash', v_import.payload_hash,
    'eventCount', v_import.event_count,
    'fetchedAt', v_import.fetched_at,
    'importedAt', v_import.created_at
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
    'STORE_LIVE_ODDS_IMPORT',
    p_idempotency_key,
    v_request_hash,
    v_response
  );

  return v_response;
end;
$$;

create or replace function api.get_live_odds_import(p_league_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_league_id uuid;
  v_season private.seasons%rowtype;
  v_import private.live_odds_imports%rowtype;
begin
  select league.id into strict v_league_id
  from private.leagues as league
  where league.slug = lower(btrim(p_league_slug));

  if v_user_id is null or not private.is_league_commissioner(v_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;

  select season.* into strict v_season
  from private.seasons as season
  where season.league_id = v_league_id
  order by season.created_at desc
  limit 1;

  if v_season.mode <> 'LIVE' then
    return null;
  end if;

  select odds_import.* into v_import
  from private.live_odds_imports as odds_import
  where odds_import.season_id = v_season.id
  order by odds_import.created_at desc, odds_import.id desc
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'importId', v_import.id,
    'source', v_import.source,
    'fetchedAt', v_import.fetched_at,
    'importedAt', v_import.created_at,
    'eventCount', v_import.event_count,
    'payloadHash', v_import.payload_hash,
    'events', v_import.normalized_json -> 'events'
  );
end;
$$;

revoke execute on function api.store_live_odds_import(uuid, jsonb, text) from public, anon;
revoke execute on function api.get_live_odds_import(text) from public, anon;
grant execute on function api.store_live_odds_import(uuid, jsonb, text) to authenticated;
grant execute on function api.get_live_odds_import(text) to authenticated;
