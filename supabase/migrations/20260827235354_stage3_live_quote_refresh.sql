-- Stage 3: retain every provider observation as an immutable ledger entry,
-- while keeping one explicit current-quote pointer per event/market/outcome.
-- Refreshes may change prices and lines, but never the published event set,
-- teams, kickoff times, or common lock.

create table private.live_quote_heads (
  event_id uuid not null,
  week_id uuid not null,
  league_id uuid not null,
  market_type text not null check (market_type in ('MONEYLINE', 'SPREAD', 'TOTAL')),
  outcome_key text not null,
  market_snapshot_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (event_id, market_type, outcome_key),
  foreign key (event_id, week_id, league_id)
    references private.sports_events (id, week_id, league_id) on delete cascade,
  foreign key (market_snapshot_id, event_id, week_id, league_id)
    references private.market_snapshots (id, event_id, week_id, league_id)
);

create index live_quote_heads_week_id_idx
  on private.live_quote_heads (week_id, event_id);

create index live_quote_heads_snapshot_fk_idx
  on private.live_quote_heads (market_snapshot_id, event_id, week_id, league_id);

alter table private.live_quote_heads enable row level security;
revoke all on table private.live_quote_heads from public, anon, authenticated;

create policy live_quote_heads_no_direct_access
on private.live_quote_heads for select to authenticated
using (false);

-- Backfill existing Live slates with the newest stored observation.
insert into private.live_quote_heads (
  event_id,
  week_id,
  league_id,
  market_type,
  outcome_key,
  market_snapshot_id
)
select distinct on (item.event_id, snapshot.market_type, snapshot.outcome_key)
  item.event_id,
  item.week_id,
  item.league_id,
  snapshot.market_type,
  snapshot.outcome_key,
  snapshot.id
from private.slate_items as item
join private.market_snapshots as snapshot on snapshot.id = item.market_snapshot_id
join private.season_weeks as week on week.id = item.week_id
join private.seasons as season on season.id = week.season_id
where season.mode = 'LIVE'
order by
  item.event_id,
  snapshot.market_type,
  snapshot.outcome_key,
  snapshot.observed_at desc,
  snapshot.created_at desc,
  snapshot.id desc;

create or replace function private.set_initial_live_quote_head()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot private.market_snapshots%rowtype;
begin
  if not exists (
    select 1
    from private.season_weeks as week
    join private.seasons as season on season.id = week.season_id
    where week.id = new.week_id
      and week.league_id = new.league_id
      and season.mode = 'LIVE'
  ) then
    return new;
  end if;

  select snapshot.* into strict v_snapshot
  from private.market_snapshots as snapshot
  where snapshot.id = new.market_snapshot_id;

  insert into private.live_quote_heads (
    event_id,
    week_id,
    league_id,
    market_type,
    outcome_key,
    market_snapshot_id
  ) values (
    new.event_id,
    new.week_id,
    new.league_id,
    v_snapshot.market_type,
    v_snapshot.outcome_key,
    new.market_snapshot_id
  ) on conflict (event_id, market_type, outcome_key) do nothing;

  return new;
end;
$$;

revoke execute on function private.set_initial_live_quote_head()
from public, anon, authenticated;

create trigger slate_items_set_initial_live_quote_head
after insert on private.slate_items
for each row execute function private.set_initial_live_quote_head();

create or replace function api.refresh_live_week_quotes(
  p_league_id uuid,
  p_import_id uuid,
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
  v_slate private.slates%rowtype;
  v_import private.live_odds_imports%rowtype;
  v_command private.command_receipts%rowtype;
  v_event private.sports_events%rowtype;
  v_current_snapshot private.market_snapshots%rowtype;
  v_request_hash text;
  v_event_json jsonb;
  v_market_json jsonb;
  v_import_event_ids text[];
  v_slate_event_ids text[];
  v_snapshot_id uuid;
  v_payload_hash text;
  v_line_milli integer;
  v_now timestamptz;
  v_refreshed_count integer := 0;
  v_response jsonb;
begin
  if v_user_id is null or not private.is_league_commissioner(p_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;
  if p_import_id is null or char_length(p_idempotency_key) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'Quote refresh request is invalid.';
  end if;

  v_request_hash := encode(
    extensions.digest(p_league_id::text || ':' || p_import_id::text, 'sha256'),
    'hex'
  );

  select command.* into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'REFRESH_LIVE_WEEK_QUOTES'
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

  if v_season.mode <> 'LIVE' or v_season.lifecycle not in ('DRAFT', 'REGULAR') then
    raise exception using errcode = '22023', message = 'An active Live season is required.';
  end if;

  select week.* into strict v_week
  from private.season_weeks as week
  where week.season_id = v_season.id and week.nfl_week = 1
  for update;

  if v_week.state not in ('PLANNED', 'OPEN') then
    raise exception using errcode = '55000', message = 'Quotes can refresh only before the weekly lock.';
  end if;
  v_now := private.stage1_season_time(v_season.id);
  if v_now >= v_week.common_lock_at then
    raise exception using errcode = '55000', message = 'The published slate has reached common lock.';
  end if;

  select slate.* into strict v_slate
  from private.slates as slate
  where slate.week_id = v_week.id and slate.version = 1
  for update;

  select odds_import.* into strict v_import
  from private.live_odds_imports as odds_import
  where odds_import.id = p_import_id
    and odds_import.season_id = v_season.id
    and odds_import.league_id = p_league_id;

  select array_agg(event.fixture_event_key order by event.fixture_event_key)
  into v_slate_event_ids
  from private.sports_events as event
  where event.week_id = v_week.id;

  select array_agg(provider_event.value ->> 'externalEventId' order by provider_event.value ->> 'externalEventId')
  into v_import_event_ids
  from jsonb_array_elements(v_import.normalized_json -> 'events') as provider_event(value);

  if v_slate_event_ids is null or v_import_event_ids is null
    or v_slate_event_ids <> v_import_event_ids then
    raise exception using errcode = '22023', message = 'A quote refresh must contain exactly the published event set.';
  end if;

  for v_event_json in
    select provider_event.value
    from jsonb_array_elements(v_import.normalized_json -> 'events') as provider_event(value)
    order by provider_event.value ->> 'externalEventId'
  loop
    select event.* into strict v_event
    from private.sports_events as event
    where event.week_id = v_week.id
      and event.fixture_event_key = v_event_json ->> 'externalEventId';

    if v_event.away_team <> v_event_json ->> 'awayTeam'
      or v_event.home_team <> v_event_json ->> 'homeTeam'
      or v_event.scheduled_start_at <> (v_event_json ->> 'scheduledStartAt')::timestamptz then
      raise exception using errcode = '22023', message = 'A quote refresh cannot change a published event.';
    end if;

    for v_market_json in
      select provider_market.value
      from jsonb_array_elements(v_event_json -> 'markets') as provider_market(value)
      order by provider_market.value ->> 'marketType', provider_market.value ->> 'outcomeKey'
    loop
      v_line_milli := case
        when jsonb_typeof(v_market_json -> 'lineMilli') = 'null' then null
        else (v_market_json ->> 'lineMilli')::integer
      end;
      v_payload_hash := encode(
        extensions.digest(
          (v_event_json ->> 'externalEventId') || ':' || v_market_json::text,
          'sha256'
        ),
        'hex'
      );

      select snapshot.* into v_current_snapshot
      from private.live_quote_heads as head
      join private.market_snapshots as snapshot on snapshot.id = head.market_snapshot_id
      where head.event_id = v_event.id
        and head.market_type = upper(v_market_json ->> 'marketType')
        and head.outcome_key = upper(v_market_json ->> 'outcomeKey')
      for update of head;

      if found and v_current_snapshot.observed_at > (v_market_json ->> 'observedAt')::timestamptz then
        raise exception using errcode = '22023', message = 'A quote refresh cannot move an observation backward.';
      end if;

      select snapshot.id into v_snapshot_id
      from private.market_snapshots as snapshot
      where snapshot.event_id = v_event.id
        and snapshot.book_key = lower(v_market_json ->> 'sourceBook')
        and snapshot.market_type = upper(v_market_json ->> 'marketType')
        and snapshot.outcome_key = upper(v_market_json ->> 'outcomeKey')
        and snapshot.line_milli is not distinct from v_line_milli
        and snapshot.payload_hash = v_payload_hash;

      if not found then
        v_snapshot_id := gen_random_uuid();
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
          v_event.id,
          v_week.id,
          p_league_id,
          lower(v_market_json ->> 'sourceBook'),
          upper(v_market_json ->> 'marketType'),
          upper(v_market_json ->> 'outcomeKey'),
          v_market_json ->> 'proposition',
          v_line_milli,
          (v_market_json ->> 'americanOdds')::integer,
          'HEALTHY',
          (v_market_json ->> 'observedAt')::timestamptz,
          v_payload_hash
        );
      end if;

      insert into private.slate_items (
        slate_id,
        event_id,
        market_snapshot_id,
        week_id,
        league_id
      ) values (
        v_slate.id,
        v_event.id,
        v_snapshot_id,
        v_week.id,
        p_league_id
      ) on conflict (slate_id, market_snapshot_id) do nothing;

      insert into private.live_quote_heads (
        event_id,
        week_id,
        league_id,
        market_type,
        outcome_key,
        market_snapshot_id
      ) values (
        v_event.id,
        v_week.id,
        p_league_id,
        upper(v_market_json ->> 'marketType'),
        upper(v_market_json ->> 'outcomeKey'),
        v_snapshot_id
      )
      on conflict (event_id, market_type, outcome_key) do update
      set market_snapshot_id = excluded.market_snapshot_id,
          updated_at = clock_timestamp();

      v_refreshed_count := v_refreshed_count + 1;
    end loop;
  end loop;

  if v_refreshed_count <> cardinality(v_slate_event_ids) * 6 or (
    select count(*)
    from private.live_quote_heads as head
    where head.week_id = v_week.id
  ) <> cardinality(v_slate_event_ids) * 6 then
    raise exception using errcode = '22023', message = 'The refreshed quote set is incomplete.';
  end if;

  v_response := jsonb_build_object(
    'leagueId', p_league_id,
    'seasonId', v_season.id,
    'weekId', v_week.id,
    'slateId', v_slate.id,
    'importId', v_import.id,
    'eventCount', cardinality(v_slate_event_ids),
    'marketCount', v_refreshed_count,
    'refreshedAt', v_now,
    'commonLockAt', v_week.common_lock_at
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
    'REFRESH_LIVE_WEEK_QUOTES',
    p_idempotency_key,
    v_request_hash,
    v_response
  );

  return v_response;
end;
$$;

revoke execute on function api.refresh_live_week_quotes(uuid, uuid, text)
from public, anon;
grant execute on function api.refresh_live_week_quotes(uuid, uuid, text)
to authenticated;

create or replace function api.get_live_quote_heads(p_league_slug text)
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
  where season.league_id = v_league.id
  order by season.created_at desc
  limit 1;

  if v_season.mode <> 'LIVE' then
    return '[]'::jsonb;
  end if;

  select week.* into v_week
  from private.season_weeks as week
  where week.season_id = v_season.id and week.nfl_week = 1;

  if v_week.id is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'eventId', event.id,
        'markets', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', snapshot.id,
              'marketType', snapshot.market_type,
              'outcomeKey', snapshot.outcome_key,
              'proposition', snapshot.proposition,
              'lineMilli', snapshot.line_milli,
              'americanOdds', snapshot.american_odds,
              'qualityStatus', snapshot.quality_status,
              'observedAt', snapshot.observed_at,
              'payloadHash', snapshot.payload_hash,
              'maximumStakeCredits', case
                when snapshot.american_odds < -200 then 750 else 1000
              end
            ) order by snapshot.market_type, snapshot.outcome_key
          )
          from private.live_quote_heads as head
          join private.market_snapshots as snapshot on snapshot.id = head.market_snapshot_id
          where head.event_id = event.id and head.week_id = v_week.id
        ), '[]'::jsonb)
      ) order by event.scheduled_start_at, event.id
    )
    from private.sports_events as event
    where event.week_id = v_week.id
  ), '[]'::jsonb);
end;
$$;

revoke execute on function api.get_live_quote_heads(text) from public, anon;
grant execute on function api.get_live_quote_heads(text) to authenticated;

create or replace function private.enforce_live_current_quote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from private.season_weeks as week
    join private.seasons as season on season.id = week.season_id
    where week.id = new.week_id
      and week.league_id = new.league_id
      and season.mode = 'LIVE'
  ) and not exists (
    select 1
    from private.live_quote_heads as head
    where head.event_id = new.event_id
      and head.week_id = new.week_id
      and head.league_id = new.league_id
      and head.market_type = new.market_type
      and head.outcome_key = new.outcome_key
      and head.market_snapshot_id = new.market_snapshot_id
  ) then
    raise exception using errcode = '40001', message = 'QUOTE_CHANGED';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_live_current_quote() from public, anon, authenticated;

create trigger position_receipts_enforce_live_current_quote
before insert on private.position_receipts
for each row execute function private.enforce_live_current_quote();
