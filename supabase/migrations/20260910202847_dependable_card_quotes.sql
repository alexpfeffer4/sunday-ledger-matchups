-- A01 proposed operating contract. Disabled until separately approved rollout.
-- Provider source timestamps and immutable receipts are never rewritten.
create table private.odds_refresh_policy (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  daily_credit_limit integer not null default 300 check (daily_credit_limit >= 0),
  monthly_credit_limit integer not null default 1500 check (monthly_credit_limit >= 0),
  reserve_credits integer not null default 30 check (reserve_credits >= 0),
  usage_day date not null default (clock_timestamp() at time zone 'UTC')::date,
  usage_month date not null default date_trunc('month', clock_timestamp() at time zone 'UTC')::date,
  daily_credits integer not null default 0,
  monthly_credits integer not null default 0,
  requests_remaining integer,
  next_request_at timestamptz not null default '-infinity'
);
insert into private.odds_refresh_policy default values;

-- Evaluate Live confirmation after acquiring locks, rather than using the
-- transaction-start time returned by now(). Keep the canonical Simulation clock.
create function private.card_confirmation_time(p_season_id uuid)
returns timestamptz language sql volatile security definer set search_path = '' as $$
  select case when s.mode='LIVE' then clock_timestamp()
    else private.stage1_season_time(s.id) end
  from private.seasons s where s.id=p_season_id;
$$;
revoke all on function private.card_confirmation_time(uuid) from public,anon,authenticated;

create table private.live_quote_refreshes (
  week_id uuid primary key references private.season_weeks(id),
  lease_id uuid not null unique,
  actor_user_id uuid not null references auth.users(id),
  attempted_at timestamptz not null,
  lease_expires_at timestamptz not null,
  state text not null check (state in ('RUNNING', 'SUCCEEDED', 'FAILED')),
  fetched_at timestamptz,
  import_id uuid references private.live_odds_imports(id)
);
create index live_quote_refreshes_actor_idx on private.live_quote_refreshes(actor_user_id);
create index live_quote_refreshes_import_idx on private.live_quote_refreshes(import_id);

alter table private.live_quote_heads add column verified_import_id uuid references private.live_odds_imports(id);
create index live_quote_heads_verified_import_idx on private.live_quote_heads(verified_import_id);

-- A legacy commissioner import must not carry a previous fetch attestation
-- onto different terms. The coordinated transaction attaches its own evidence
-- only after the complete import and head update have succeeded.
create function private.invalidate_changed_quote_verification()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.market_snapshot_id is distinct from old.market_snapshot_id then
    new.verified_import_id := null;
  end if;
  return new;
end;
$$;
revoke all on function private.invalidate_changed_quote_verification() from public,anon,authenticated;
create trigger invalidate_changed_quote_verification before update of market_snapshot_id
  on private.live_quote_heads for each row execute function private.invalidate_changed_quote_verification();

create table private.live_card_quote_reviews (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references private.weekly_cards(id),
  actor_user_id uuid not null references auth.users(id),
  positions jsonb not null,
  reviewed_at timestamptz not null,
  expires_at timestamptz not null,
  fetched_at timestamptz not null
);
create index live_card_quote_reviews_card_actor_idx on private.live_card_quote_reviews(card_id, actor_user_id);
create index live_card_quote_reviews_actor_idx on private.live_card_quote_reviews(actor_user_id);
create table private.card_quote_review_acceptances (
  card_id uuid primary key references private.weekly_cards(id),
  review_id uuid not null unique references private.live_card_quote_reviews(id)
);

alter table private.odds_refresh_policy enable row level security;
alter table private.live_quote_refreshes enable row level security;
alter table private.live_card_quote_reviews enable row level security;
alter table private.card_quote_review_acceptances enable row level security;
revoke all on private.odds_refresh_policy, private.live_quote_refreshes,
  private.live_card_quote_reviews, private.card_quote_review_acceptances
  from public, anon, authenticated;
create trigger live_card_quote_reviews_append_only before update or delete
  on private.live_card_quote_reviews for each row execute function private.reject_competitive_mutation();
create trigger card_quote_review_acceptances_append_only before update or delete
  on private.card_quote_review_acceptances for each row execute function private.reject_competitive_mutation();

-- Reuse the current, all-week import validation and quote-head implementation.
-- The originals remain commissioner-only. These private helpers are reachable
-- solely from the lease-bound service persistence RPC below.
do $migration$
declare v_definition text; v_name text; v_helper text;
begin
  foreach v_name in array array['store_live_odds_import', 'refresh_live_week_quotes'] loop
    v_helper := case v_name when 'store_live_odds_import' then 'store_member_quote_import' else 'refresh_member_quote_heads' end;
    select pg_get_functiondef((case v_name when 'store_live_odds_import'
      then 'api.store_live_odds_import(uuid,jsonb,text)' else 'api.refresh_live_week_quotes(uuid,uuid,text)' end)::regprocedure)
      into v_definition;
    if strpos(v_definition, 'v_user_id uuid := (select auth.uid());') = 0
      or strpos(v_definition, 'not private.is_league_commissioner(p_league_id)') = 0 then
      raise exception 'Quote helper baseline changed: %', v_name;
    end if;
    v_definition := replace(v_definition, 'api.' || v_name || '(', 'private.' || v_helper || '(p_actor_user_id uuid, ');
    v_definition := replace(v_definition, 'v_user_id uuid := (select auth.uid());', 'v_user_id uuid := p_actor_user_id;');
    v_definition := replace(v_definition, 'not private.is_league_commissioner(p_league_id)',
      'not exists (select 1 from private.league_memberships m where m.league_id = p_league_id and m.user_id = v_user_id)');
    execute v_definition;
  end loop;
end;
$migration$;
revoke all on function private.store_member_quote_import(uuid,uuid,jsonb,text),
  private.refresh_member_quote_heads(uuid,uuid,uuid,text) from public, anon, authenticated;

create function api.claim_live_quote_refresh(p_league_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_policy private.odds_refresh_policy%rowtype;
  v_week private.season_weeks%rowtype;
  v_previous private.live_quote_refreshes%rowtype;
  v_now timestamptz;
  v_lease uuid := gen_random_uuid();
  v_events jsonb;
begin
  if v_user is null or not private.is_league_member(p_league_id) then
    raise exception using errcode = '42501', message = 'League membership required.';
  end if;
  select * into strict v_policy from private.odds_refresh_policy for update;
  if not v_policy.enabled then return jsonb_build_object('status', 'DISABLED'); end if;
  select w.* into v_week from private.season_weeks w
  join private.seasons s on s.id = w.season_id
  where s.league_id = p_league_id and s.mode = 'LIVE'
    and s.lifecycle in ('DRAFT', 'ROSTER_LOCKED', 'REGULAR', 'PLAYOFFS', 'CHAMPION_FINAL', 'WEEK_18_EXHIBITION')
    and not exists (select 1 from private.owner_rehearsals r where r.league_id = p_league_id)
  order by s.created_at desc, w.nfl_week desc limit 1 for update of w;
  v_now := clock_timestamp();
  if v_week.id is null or v_week.state not in ('PLANNED','OPEN') or v_now >= v_week.common_lock_at
    or (v_week.state='PLANNED' and not private.is_league_commissioner(p_league_id))
    or (v_week.state='OPEN' and v_now < v_week.opens_at) then
    raise exception using errcode = '55000', message = 'The current card is not open.';
  end if;
  if not private.is_league_commissioner(p_league_id) and not exists (
    select 1 from private.weekly_cards c where c.week_id = v_week.id and c.owner_user_id = v_user
      and not exists (select 1 from private.position_receipts r where r.card_id = c.id)
  ) then raise exception using errcode = '42501', message = 'An unsealed member card is required.'; end if;
  select * into v_previous from private.live_quote_refreshes where week_id = v_week.id for update;
  if v_previous.state = 'SUCCEEDED' and v_previous.fetched_at >= v_now - interval '60 seconds' then
    return jsonb_build_object('status', 'CACHED');
  end if;
  if v_previous.state = 'RUNNING' and v_previous.lease_expires_at > v_now then
    raise exception using errcode = '55000', message = 'QUOTE_REFRESH_BUSY';
  end if;
  if v_previous.attempted_at > v_now - interval '60 seconds' or v_policy.next_request_at > v_now then
    raise exception using errcode = '55000', message = 'QUOTE_REFRESH_COOLDOWN';
  end if;
  if v_policy.usage_day <> (v_now at time zone 'UTC')::date then v_policy.daily_credits := 0; end if;
  if v_policy.usage_month <> date_trunc('month', v_now at time zone 'UTC')::date then v_policy.monthly_credits := 0; end if;
  if v_policy.daily_credits + 3 > v_policy.daily_credit_limit
    or v_policy.monthly_credits + 3 > v_policy.monthly_credit_limit
    or (v_policy.requests_remaining is not null and v_policy.requests_remaining < v_policy.reserve_credits + 3) then
    raise exception using errcode = '55000', message = 'QUOTE_REFRESH_BUDGET';
  end if;
  select jsonb_agg(e.fixture_event_key order by e.fixture_event_key) into v_events
    from private.sports_events e where e.week_id = v_week.id;
  if v_events is null or jsonb_array_length(v_events) not between 1 and 32 then
    raise exception using errcode = '55000', message = 'The published slate is not available.';
  end if;
  update private.odds_refresh_policy set
    daily_credits = v_policy.daily_credits + 3, monthly_credits = v_policy.monthly_credits + 3,
    requests_remaining = v_policy.requests_remaining - 3,
    usage_day = (v_now at time zone 'UTC')::date,
    usage_month = date_trunc('month', v_now at time zone 'UTC')::date,
    next_request_at = v_now + interval '3 seconds'
    where singleton;
  insert into private.live_quote_refreshes(week_id,lease_id,actor_user_id,attempted_at,lease_expires_at,state)
    values(v_week.id,v_lease,v_user,v_now,v_now + interval '45 seconds','RUNNING')
    on conflict(week_id) do update set lease_id=excluded.lease_id,actor_user_id=excluded.actor_user_id,
      attempted_at=excluded.attempted_at,lease_expires_at=excluded.lease_expires_at,state='RUNNING',fetched_at=null,import_id=null;
  return jsonb_build_object('status','CLAIMED','leaseId',v_lease,'eventIds',v_events);
end;
$$;
revoke all on function api.claim_live_quote_refresh(uuid) from public, anon;
grant execute on function api.claim_live_quote_refresh(uuid) to authenticated;

create function api.complete_live_quote_refresh(p_lease_id uuid, p_import jsonb, p_requests_remaining integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_refresh private.live_quote_refreshes%rowtype;
  v_week private.season_weeks%rowtype;
  v_import_id uuid;
  v_result jsonb;
  v_now timestamptz;
  v_fetched timestamptz;
begin
  -- No caller-controlled actor, league, event set, or role is accepted here.
  perform 1 from private.odds_refresh_policy where enabled for update;
  if not found then raise exception 'QUOTE_REFRESH_DISABLED'; end if;
  select * into v_refresh from private.live_quote_refreshes where lease_id = p_lease_id;
  if v_refresh.week_id is null then raise exception 'QUOTE_REFRESH_LEASE_INVALID'; end if;
  -- Match the existing import's season -> week locking order.
  perform 1 from private.seasons s join private.season_weeks w on w.season_id=s.id
    where w.id=v_refresh.week_id and s.mode='LIVE' for update of s;
  select * into strict v_week from private.season_weeks where id=v_refresh.week_id for update;
  select * into strict v_refresh from private.live_quote_refreshes where lease_id=p_lease_id for update;
  if v_refresh.state = 'SUCCEEDED' then return jsonb_build_object('replayed',true); end if;
  v_now := clock_timestamp();
  if v_refresh.state <> 'RUNNING' or v_refresh.lease_expires_at <= v_now then raise exception 'QUOTE_REFRESH_LEASE_INVALID'; end if;
  if p_requests_remaining is not null and p_requests_remaining >= 0 then
    update private.odds_refresh_policy set requests_remaining=least(coalesce(requests_remaining,p_requests_remaining),p_requests_remaining)
      where singleton;
  end if;
  if p_import is null or p_import = 'null'::jsonb then
    update private.live_quote_refreshes set state='FAILED' where lease_id=p_lease_id;
    return jsonb_build_object('status','FAILED');
  end if;
  if v_week.state not in ('PLANNED','OPEN') or v_now >= v_week.common_lock_at then raise exception 'The current card is not open.'; end if;
  v_fetched := (p_import->>'fetchedAt')::timestamptz;
  if v_fetched is null or v_fetched < v_refresh.attempted_at or v_fetched > v_now
    or v_fetched < v_now - interval '30 seconds' then raise exception 'QUOTE_FETCH_INVALID'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_import->'events') e,
      jsonb_array_elements(e->'markets') m
    where (m->>'observedAt')::timestamptz > v_fetched
      or (m->>'observedAt')::timestamptz < v_now - interval '10 minutes'
  ) then raise exception 'QUOTE_SOURCE_STALE'; end if;
  v_result := private.store_member_quote_import(v_refresh.actor_user_id,v_week.league_id,p_import,'quote-store:'||p_lease_id::text);
  v_import_id := (v_result->>'importId')::uuid;
  v_result := private.refresh_member_quote_heads(v_refresh.actor_user_id,v_week.league_id,v_import_id,'quote-heads:'||p_lease_id::text);
  update private.live_quote_heads set verified_import_id=v_import_id where week_id=v_week.id;
  update private.live_quote_refreshes set state='SUCCEEDED',fetched_at=v_fetched,import_id=v_import_id where lease_id=p_lease_id;
  return v_result;
end;
$$;
revoke all on function api.complete_live_quote_refresh(uuid,jsonb,integer) from public, anon, authenticated;
grant execute on function api.complete_live_quote_refresh(uuid,jsonb,integer) to service_role;

create function api.review_live_card_quotes(p_league_slug text, p_positions jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_week private.season_weeks%rowtype;
  v_card private.weekly_cards%rowtype;
  v_now timestamptz;
  v_positions jsonb;
  v_fetched timestamptz;
  v_id uuid;
begin
  if v_user is null then raise exception using errcode='42501', message='Authentication required.'; end if;
  if not exists(select 1 from private.odds_refresh_policy where enabled) then raise exception 'QUOTE_REFRESH_DISABLED'; end if;
  if p_positions is null or jsonb_typeof(p_positions)<>'array' or jsonb_array_length(p_positions) not between 1 and 20 then raise exception 'Invalid card draft.'; end if;
  select w.* into v_week from private.leagues l
    join private.league_memberships m on m.league_id=l.id and m.user_id=v_user
    join private.seasons s on s.league_id=l.id and s.mode='LIVE'
    join private.season_weeks w on w.season_id=s.id
    where l.slug=lower(p_league_slug)
    order by s.created_at desc,w.nfl_week desc limit 1 for update of w;
  v_now := clock_timestamp();
  if v_week.id is null or v_week.state<>'OPEN' or v_now<v_week.opens_at or v_now>=v_week.common_lock_at then raise exception 'The current card is not open.'; end if;
  select * into strict v_card from private.weekly_cards where week_id=v_week.id and owner_user_id=v_user;
  if exists(select 1 from private.position_receipts where card_id=v_card.id) then raise exception 'Card already sealed.'; end if;
  select jsonb_agg(jsonb_build_object('marketSnapshotId',current.id,'payloadHash',current.payload_hash,
    'stakeCredits',item.value->'stakeCredits') order by item.ordinality), min(i.fetched_at)
    into v_positions,v_fetched
    from jsonb_array_elements(p_positions) with ordinality item(value,ordinality)
    join private.market_snapshots old on old.id=(item.value->>'marketSnapshotId')::uuid and old.week_id=v_week.id
    join private.live_quote_heads h on h.event_id=old.event_id and h.market_type=old.market_type and h.outcome_key=old.outcome_key
    join private.market_snapshots current on current.id=h.market_snapshot_id
    join private.live_odds_imports i on i.id=h.verified_import_id
    where current.quality_status='HEALTHY' and current.observed_at<=v_now
      and current.observed_at>=v_now-interval '10 minutes'
      and i.fetched_at<=v_now and i.fetched_at>=v_now-interval '120 seconds';
  if v_positions is null or jsonb_array_length(v_positions)<>jsonb_array_length(p_positions) then raise exception 'QUOTE_SOURCE_STALE'; end if;
  -- Stable replay of an unchanged, still-valid review bounds storage as well.
  select id into v_id from private.live_card_quote_reviews where card_id=v_card.id
    and actor_user_id=v_user and positions=v_positions and expires_at>v_now+interval '5 seconds'
    order by reviewed_at desc limit 1;
  if v_id is null then
    insert into private.live_card_quote_reviews(card_id,actor_user_id,positions,reviewed_at,expires_at,fetched_at)
      values(v_card.id,v_user,v_positions,v_now,least(v_now+interval '30 seconds',v_week.common_lock_at),v_fetched)
      returning id into v_id;
  end if;
  return (select jsonb_build_object('reviewId',r.id,'reviewedAt',r.reviewed_at,'expiresAt',r.expires_at,
    'fetchedAt',r.fetched_at,'quotes',api.get_live_quote_heads(p_league_slug))
    from private.live_card_quote_reviews r where r.id=v_id);
end;
$$;
revoke all on function api.review_live_card_quotes(text,jsonb) from public,anon;
grant execute on function api.review_live_card_quotes(text,jsonb) to authenticated;

create function private.assert_live_card_quote_review(p_card_id uuid,p_actor uuid,p_positions jsonb,p_now timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_review private.live_card_quote_reviews%rowtype; v_positions jsonb;
begin
  if not exists(select 1 from private.odds_refresh_policy where enabled) then raise exception 'QUOTE_REFRESH_DISABLED'; end if;
  select jsonb_agg(value-'reviewId' order by ordinality) into v_positions
    from jsonb_array_elements(p_positions) with ordinality item(value,ordinality);
  select * into v_review from private.live_card_quote_reviews
    where id=(p_positions->0->>'reviewId')::uuid and card_id=p_card_id and actor_user_id=p_actor;
  if v_review.id is null or v_review.positions<>v_positions then raise exception 'QUOTE_REVIEW_REQUIRED'; end if;
  if v_review.reviewed_at>p_now or v_review.expires_at<=p_now then raise exception 'QUOTE_REVIEW_EXPIRED'; end if;
  if exists(
    select 1 from jsonb_array_elements(v_positions) item
    join private.market_snapshots m on m.id=(item->>'marketSnapshotId')::uuid
    join private.sports_events e on e.id=m.event_id
    left join private.live_quote_heads h on h.market_snapshot_id=m.id
    left join private.live_odds_imports i on i.id=h.verified_import_id
    where e.state<>'SCHEDULED' or e.actual_started_at is not null or e.scheduled_start_at<=p_now
      or h.market_snapshot_id is null or i.fetched_at is null or i.fetched_at>p_now
      or i.fetched_at<p_now-interval '120 seconds' or m.observed_at>p_now
      or m.observed_at<p_now-interval '10 minutes'
  ) then raise exception 'QUOTE_CHANGED'; end if;
  return v_review.id;
end;
$$;
revoke all on function private.assert_live_card_quote_review(uuid,uuid,jsonb,timestamptz) from public,anon,authenticated;

-- One acceptance engine and one immutable receipt path. Legacy Simulation and
-- disabled Live retain the existing two-minute source check. New Live reviews
-- require all three independent clocks and exact reviewed content.
do $migration$
declare v_definition text;
begin
  select pg_get_functiondef('private.accept_authoritative_card_for_actor(uuid,text,jsonb,text)'::regprocedure) into v_definition;
  if strpos(v_definition,'v_response jsonb;')=0 then raise exception 'Acceptance baseline changed'; end if;
  v_definition := replace(v_definition,'v_response jsonb;','v_response jsonb; v_quote_review_id uuid;');
  if strpos(v_definition, 'if v_snapshot.observed_at > v_now')=0 then raise exception 'Acceptance freshness baseline changed'; end if;
  v_definition := replace(v_definition, '  select coalesce(sum(receipt.stake_credits), 0), count(*)',
    '  if v_season.mode = ''LIVE'' and ((p_positions->0->>''reviewId'') is not null or exists(select 1 from private.odds_refresh_policy where enabled)) then
      v_quote_review_id := private.assert_live_card_quote_review(v_card.id,v_user_id,p_positions,v_now);
    end if;
    select coalesce(sum(receipt.stake_credits), 0), count(*)');
  v_definition := replace(v_definition, 'if v_snapshot.observed_at > v_now
      or v_snapshot.observed_at < v_now - interval ''2 minutes'' then',
    'if v_quote_review_id is null and (v_snapshot.observed_at > v_now
      or v_snapshot.observed_at < v_now - interval ''2 minutes'') then');
  v_definition := replace(v_definition, '  v_now := private.stage1_season_time(v_season.id);',
    '  select command.* into v_command from private.command_receipts command
      where command.actor_user_id=v_user_id and command.command_name=''ACCEPT_STAGE1_CARD''
        and command.idempotency_key=p_idempotency_key;
      if found then
        if v_command.request_hash<>v_request_hash then raise exception using errcode=''22000'', message=''Idempotency key was reused with a different request.''; end if;
        return v_command.response_json || jsonb_build_object(''replayed'',true);
      end if;
      v_now := private.card_confirmation_time(v_season.id);');
  v_definition := replace(v_definition, '  update private.slates',
    '  if v_quote_review_id is not null then
      insert into private.card_quote_review_acceptances(card_id,review_id) values(v_card.id,v_quote_review_id);
    end if;
    update private.slates');
  execute v_definition;
end;
$migration$;

-- Roster opening uses the same verified fetch contract when activated, so an
-- unchanged-but-aged provider market does not block the setup prerequisite.
do $migration$
declare v_definition text; v_old text := 'and snapshot.observed_at >= v_now - interval ''2 minutes''';
begin
  select pg_get_functiondef('api.lock_live_roster_and_open_week(uuid,text)'::regprocedure) into v_definition;
  if strpos(v_definition,v_old)=0 then raise exception 'Roster freshness baseline changed'; end if;
  v_definition := replace(v_definition,'v_now := private.stage1_season_time(v_season.id);',
    'v_now := private.card_confirmation_time(v_season.id);');
  v_definition := replace(v_definition,v_old,
    'and (((v_season.mode<>''LIVE'' or not exists(select 1 from private.odds_refresh_policy where enabled)) and snapshot.observed_at >= v_now - interval ''2 minutes'')
      or (v_season.mode=''LIVE'' and exists(select 1 from private.odds_refresh_policy where enabled)
        and snapshot.observed_at >= v_now - interval ''10 minutes''
        and exists(select 1 from private.live_odds_imports i where i.id=head.verified_import_id
          and i.fetched_at<=v_now and i.fetched_at>=v_now-interval ''120 seconds'')))');
  execute v_definition;
end;
$migration$;

grant usage on schema api to service_role;
