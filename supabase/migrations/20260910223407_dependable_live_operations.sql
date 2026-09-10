-- A02/A10. Owner-selected checkpoint updates, not continuous live scoring.
-- No scheduler is installed or activated by this migration.
create table private.score_refresh_policy (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false
);
insert into private.score_refresh_policy default values;

create table private.provider_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('SCORES','ODDS')),
  league_id uuid references private.leagues(id),
  actor_user_id uuid references private.profiles(id),
  event_ids uuid[] not null default '{}',
  attempted_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '45 seconds',
  state text not null default 'RUNNING' check(state in ('RUNNING','SUCCEEDED','PARTIAL','FAILED')),
  response jsonb
);
create index provider_requests_kind_attempt_idx on private.provider_requests(kind,attempted_at desc);
create index provider_requests_league_idx on private.provider_requests(league_id);
create index provider_requests_actor_idx on private.provider_requests(actor_user_id);

create table private.live_score_checks (
  event_id uuid primary key references private.sports_events(id),
  attempted_at timestamptz,
  fetched_at timestamptz,
  source_updated_at timestamptz,
  first_final_at timestamptz,
  next_check_at timestamptz,
  failure_count integer not null default 0,
  state text not null default 'WAITING' check(state in ('WAITING','CHECKED','MISSING','FAILED','STOPPED'))
);
alter table private.score_refresh_policy enable row level security;
alter table private.provider_requests enable row level security;
alter table private.live_score_checks enable row level security;
revoke all on private.score_refresh_policy,private.provider_requests,private.live_score_checks from public,anon,authenticated;

-- Stage 1 remains the single shared provider budget. Calls reserve before HTTP;
-- a timeout never refunds an unknown charge and late responses cannot raise it.
create function private.reserve_provider_credits(p_cost integer) returns void
language plpgsql security definer set search_path='' as $$
declare p private.odds_refresh_policy%rowtype; t timestamptz;
begin
  select * into strict p from private.odds_refresh_policy for update;
  t:=clock_timestamp();
  if p_cost not in (2,3) then raise exception 'Invalid provider cost'; end if;
  if p.next_request_at>t then raise exception 'QUOTE_REFRESH_COOLDOWN'; end if;
  if p.usage_day<>(t at time zone 'UTC')::date then p.daily_credits:=0; end if;
  if p.usage_month<>date_trunc('month',t at time zone 'UTC')::date then p.monthly_credits:=0; end if;
  if p.daily_credits+p_cost>p.daily_credit_limit or p.monthly_credits+p_cost>p.monthly_credit_limit
    or (p.requests_remaining is not null and p.requests_remaining<p.reserve_credits+p_cost)
    then raise exception 'QUOTE_REFRESH_BUDGET'; end if;
  update private.odds_refresh_policy set daily_credits=p.daily_credits+p_cost,
    monthly_credits=p.monthly_credits+p_cost,requests_remaining=p.requests_remaining-p_cost,
    usage_day=(t at time zone 'UTC')::date,usage_month=date_trunc('month',t at time zone 'UTC')::date,
    next_request_at=t+interval '3 seconds' where singleton;
end;
$$;
revoke all on function private.reserve_provider_credits(integer) from public,anon,authenticated;

-- Pure checkpoint policy shared by scheduling and the read model. Missed earlier
-- checkpoints are skipped, never replayed in a burst. Stop before provider retention.
create function private.next_score_checkpoint(p_start timestamptz,p_now timestamptz,p_started boolean,p_final timestamptz)
returns timestamptz language sql immutable set search_path='' as $$
  select min(checkpoint) from (
    select p_start+make_interval(mins=>m) as checkpoint
    from unnest(case when p_final is not null then array[]::integer[]
      when p_started then array[240,270,300,360,720,1440,2880,3600]
      else array[2,7,17,240,270,300,360,720,1440,2880,3600] end) m
    union all select p_final+interval '6 hours' where p_final is not null
    union all select p_final+interval '23 hours' where p_final is not null
  ) checkpoints where checkpoint>p_now and checkpoint<=p_start+interval '60 hours';
$$;
revoke all on function private.next_score_checkpoint(timestamptz,timestamptz,boolean,timestamptz) from public,anon,authenticated;

-- Extract the existing result engine once; all callers, including canonical
-- Simulation, continue through this same implementation. No new scoring engine.
do $migration$
declare d text;
begin
  d:=pg_get_functiondef('api.record_stage1_result(uuid,text,integer,integer,text,text,text)'::regprocedure);
  if strpos(d,'v_user_id uuid := (select auth.uid());')=0 or strpos(d,'not private.is_league_commissioner(v_event.league_id)')=0 then
    raise exception 'Unexpected result engine baseline'; end if;
  d:=replace(d,'api.record_stage1_result(', 'private.record_stage1_result_as(p_actor_user_id uuid, ');
  d:=replace(d,'v_user_id uuid := (select auth.uid());','v_user_id uuid := p_actor_user_id;');
  d:=replace(d,'not private.is_league_commissioner(v_event.league_id)',
    '(case when v_user_id=(select auth.uid()) then not private.is_league_commissioner(v_event.league_id) else not exists(select 1 from private.league_memberships m join private.seasons s on s.league_id=m.league_id where m.league_id=v_event.league_id and m.user_id=v_user_id and m.role=''COMMISSIONER'' and s.id=v_event.season_id and s.mode=''LIVE'') end)');
  execute d;
end;
$migration$;
revoke all on function private.record_stage1_result_as(uuid,uuid,text,integer,integer,text,text,text) from public,anon,authenticated;
create or replace function api.record_stage1_result(p_event_id uuid,p_status text,p_away_score integer,p_home_score integer,p_reason text,p_source text,p_idempotency_key text)
returns jsonb language sql security definer set search_path='' as $$
  select private.record_stage1_result_as((select auth.uid()),p_event_id,p_status,p_away_score,p_home_score,p_reason,p_source,p_idempotency_key);
$$;

-- Allow a validated subset of the immutable published slate. A missing old game
-- must never discard new finals on another date. Raw payloads stay private.
do $migration$
declare d text; old_guard text;
begin
  d:=pg_get_functiondef('api.import_live_scores(uuid,jsonb,text)'::regprocedure);
  old_guard:=substring(d from strpos(d,'  if v_event_count <> (') for strpos(d,'  v_payload_hash :=')-strpos(d,'  if v_event_count <> ('));
  if old_guard is null or strpos(old_guard,'The live score batch must match every published event.')=0 or strpos(d,'v_user_id uuid := (select auth.uid());')=0 then raise exception 'Unexpected score importer baseline'; end if;
  d:=replace(d,old_guard,$guard$
  if exists(select 1 from jsonb_array_elements(p_import->'events') item
    where not exists(select 1 from private.sports_events e where e.week_id=v_week.id and e.fixture_event_key=item->>'externalEventId')) then
    raise exception using errcode='22023',message='The live score batch must match published events.';
  end if;
$guard$);
  d:=replace(d,'api.import_live_scores(', 'private.import_live_scores_as(p_actor_user_id uuid, ');
  d:=replace(d,'v_user_id uuid := (select auth.uid());','v_user_id uuid := p_actor_user_id;');
  d:=replace(d,'not private.is_league_commissioner(p_league_id)',
    'not exists(select 1 from private.league_memberships where league_id=p_league_id and user_id=v_user_id and role=''COMMISSIONER'')');
  d:=replace(d,'perform api.record_stage1_result(', 'perform private.record_stage1_result_as(v_user_id, ');
  d:=replace(d,'v_last_update < v_event.scheduled_start_at - interval ''6 hours''','v_last_update < v_event.scheduled_start_at');
  d:=replace(d,'v_last_update > v_fetched_at + interval ''5 minutes''','v_last_update > v_fetched_at');
  d:=replace(d,'    if not v_completed and v_away_score is null then', $evidence$
    -- Out-of-order data cannot regress an event or masquerade as a fresh score.
    if exists(select 1 from private.live_score_checks c where c.event_id=v_event.id
      and (c.source_updated_at>v_last_update or (c.source_updated_at is not null and v_last_update is null))) then
      v_unchanged_count:=v_unchanged_count+1;
      continue;
    end if;
    insert into private.live_score_checks(event_id,fetched_at,source_updated_at,state)
      values(v_event.id,v_fetched_at,v_last_update,'CHECKED')
      on conflict(event_id) do update set fetched_at=excluded.fetched_at,
        source_updated_at=excluded.source_updated_at,state='CHECKED',failure_count=0;

    if not v_completed and v_away_score is null then$evidence$);
  execute d;
end;
$migration$;
revoke all on function private.import_live_scores_as(uuid,uuid,jsonb,text) from public,anon,authenticated;
create or replace function api.import_live_scores(p_league_id uuid,p_import jsonb,p_idempotency_key text)
returns jsonb language sql security definer set search_path='' as $$
  select private.import_live_scores_as((select auth.uid()),p_league_id,p_import,p_idempotency_key);
$$;

create function api.claim_provider_odds_request(p_league_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare id uuid;
begin
  if (select auth.uid()) is null or not private.is_league_commissioner(p_league_id)
    or not exists(select 1 from private.seasons where league_id=p_league_id and mode='LIVE' and lifecycle<>'FINAL')
    or exists(select 1 from private.owner_rehearsals where league_id=p_league_id) then
    raise exception using errcode='42501',message='A Live-league commissioner is required.'; end if;
  perform 1 from private.odds_refresh_policy for update;
  if exists(select 1 from private.provider_requests where kind='ODDS' and league_id=p_league_id
    and attempted_at>clock_timestamp()-interval '60 seconds') then raise exception 'QUOTE_REFRESH_COOLDOWN'; end if;
  perform private.reserve_provider_credits(3);
  insert into private.provider_requests(kind,league_id,actor_user_id) values('ODDS',p_league_id,(select auth.uid())) returning provider_requests.id into id;
  return id;
end;
$$;
revoke all on function api.claim_provider_odds_request(uuid) from public,anon;
grant execute on function api.claim_provider_odds_request(uuid) to authenticated;

create function private.due_score_events(p_league_id uuid,p_manual boolean)
returns table(event_id uuid) language sql volatile security definer set search_path='' as $$
    select e.id as event_id from private.sports_events e
    join private.season_weeks w on w.id=e.week_id
    join private.seasons s on s.id=e.season_id
    left join private.live_score_checks c on c.event_id=e.id
    where s.mode='LIVE' and s.lifecycle<>'FINAL' and w.state in ('LOCKED','PROVISIONAL')
      and (w.correction_window_closes_at is null or clock_timestamp()<w.correction_window_closes_at)
      and w.nfl_week=(select max(ww.nfl_week) from private.season_weeks ww where ww.season_id=s.id)
      and not exists(select 1 from private.owner_rehearsals r where r.league_id=s.league_id)
      and (p_league_id is null or s.league_id=p_league_id)
      and e.state<>'VOID' and e.scheduled_start_at<=clock_timestamp() and clock_timestamp()<=e.scheduled_start_at+interval '60 hours'
      and (p_manual or (coalesce(c.next_check_at,e.scheduled_start_at+interval '2 minutes')<=clock_timestamp()
        and coalesce(c.state,'WAITING')<>'STOPPED'))
    order by coalesce(c.next_check_at,e.scheduled_start_at),e.id limit 128;
$$;
revoke all on function private.due_score_events(uuid,boolean) from public,anon,authenticated;

-- NULL league is reserved for the authenticated server job. Commissioners may
-- explicitly request a catch-up for their own week, with the same lease/budget.
create function private.claim_score_refresh(p_league_id uuid,p_manual boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ids uuid[]; external_ids jsonb; lease uuid; t timestamptz:=clock_timestamp();
begin
  perform 1 from private.odds_refresh_policy for update;
  if not p_manual and not exists(select 1 from private.score_refresh_policy where enabled) then
    return jsonb_build_object('status','DISABLED'); end if;
  if exists(select 1 from private.provider_requests where kind='SCORES' and
    ((state='RUNNING' and expires_at>t) or attempted_at>t-interval '60 seconds')) then
    return jsonb_build_object('status','BUSY'); end if;
  select array_agg(event_id) into ids from private.due_score_events(p_league_id,p_manual);
  if ids is null then return jsonb_build_object('status','IDLE'); end if;
  -- Bound each request to 32 unique games; several leagues can share them.
  select jsonb_agg(k order by k) into external_ids from
    (select distinct fixture_event_key k from private.sports_events where id=any(ids) order by k limit 32) keys;
  select array_agg(e.id) into ids from private.sports_events e where e.id=any(ids)
    and external_ids ? e.fixture_event_key;
  perform private.reserve_provider_credits(2);
  insert into private.provider_requests(kind,league_id,actor_user_id,event_ids)
    values('SCORES',p_league_id,case when p_manual then (select auth.uid()) else null end,ids)
    returning id into lease;
  insert into private.live_score_checks(event_id,attempted_at,next_check_at)
    select e.id,t,t+interval '5 minutes' from private.sports_events e where e.id=any(ids)
    on conflict(event_id) do update set attempted_at=t;
  return jsonb_build_object('status','CLAIMED','leaseId',lease,'eventIds',external_ids);
end;
$$;
revoke all on function private.claim_score_refresh(uuid,boolean) from public,anon,authenticated;
create function api.claim_scheduled_score_refresh() returns jsonb language sql security definer set search_path='' as $$
  select private.claim_score_refresh(null,false);
$$;
revoke all on function api.claim_scheduled_score_refresh() from public,anon,authenticated;
grant execute on function api.claim_scheduled_score_refresh() to service_role;
create function api.claim_live_score_refresh(p_league_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or not private.is_league_commissioner(p_league_id)
    or not exists(select 1 from private.seasons where league_id=p_league_id and mode='LIVE')
    or exists(select 1 from private.owner_rehearsals where league_id=p_league_id) then
    raise exception using errcode='42501',message='A Live-league commissioner is required.'; end if;
  return private.claim_score_refresh(p_league_id,true);
end;
$$;
revoke all on function api.claim_live_score_refresh(uuid) from public,anon;
grant execute on function api.claim_live_score_refresh(uuid) to authenticated;

create function api.complete_provider_request(p_request_id uuid,p_import jsonb,p_requests_remaining integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.provider_requests%rowtype; w record; e record; batch jsonb;
  receipt jsonb; checked integer:=0; t timestamptz; next_at timestamptz; final_at timestamptz;
begin
  perform 1 from private.odds_refresh_policy for update;
  select * into r from private.provider_requests where id=p_request_id for update;
  if r.id is null then raise exception 'PROVIDER_LEASE_INVALID'; end if;
  if r.state<>'RUNNING' then return r.response; end if;
  t:=clock_timestamp();
  if p_requests_remaining>=0 then update private.odds_refresh_policy
    set requests_remaining=least(coalesce(requests_remaining,p_requests_remaining),p_requests_remaining) where singleton; end if;
  if r.expires_at<=t then p_import:=null; end if;
  if r.kind='ODDS' then
    receipt:=jsonb_build_object('status',case when p_import is null then 'FAILED' else 'SUCCEEDED' end);
  else
    if r.actor_user_id is null and not exists(select 1 from private.score_refresh_policy where enabled) then p_import:=null; end if;
    if p_import is not null then
      if p_import->>'source' is distinct from 'THE_ODDS_API' or jsonb_typeof(p_import->'events') is distinct from 'array'
        or (p_import->>'fetchedAt')::timestamptz is null
        or (p_import->>'fetchedAt')::timestamptz<r.attempted_at or (p_import->>'fetchedAt')::timestamptz>t
        or exists(select 1 from jsonb_array_elements(p_import->'events') item where not exists(
          select 1 from private.sports_events where id=any(r.event_ids) and fixture_event_key=item->>'externalEventId')) then
        raise exception 'PROVIDER_BATCH_INVALID'; end if;
      for w in select distinct sw.id,sw.league_id,sw.season_id from private.season_weeks sw
        join private.sports_events se on se.week_id=sw.id where se.id=any(r.event_ids) order by sw.season_id,sw.id
      loop
        -- One failed/closed week cannot discard another league's final capture.
        begin
          perform 1 from private.seasons where id=w.season_id for update;
          perform 1 from private.season_weeks where id=w.id for update;
          select jsonb_agg(item) into batch from jsonb_array_elements(p_import->'events') item
            where exists(select 1 from private.sports_events where id=any(r.event_ids) and week_id=w.id and fixture_event_key=item->>'externalEventId');
          if batch is not null then
            receipt:=private.import_live_scores_as((select user_id from private.league_memberships where league_id=w.league_id and role='COMMISSIONER' limit 1),
              w.league_id,jsonb_build_object('source','THE_ODDS_API','fetchedAt',p_import->>'fetchedAt','events',batch),'score-check:'||r.id::text||':'||w.id::text);
            checked:=checked+(select count(*) from private.live_score_checks c join private.sports_events se on se.id=c.event_id where se.week_id=w.id and se.id=any(r.event_ids) and c.fetched_at>=r.attempted_at);
          end if;
        exception when others then
          -- Deliberately no exception text, provider payload, or participant data in job output.
          null;
        end;
      end loop;
    end if;
    for e in select se.*,c.fetched_at,c.source_updated_at,c.first_final_at,c.failure_count from private.sports_events se
      join private.live_score_checks c on c.event_id=se.id where se.id=any(r.event_ids)
    loop
      if e.fetched_at>=r.attempted_at then
        final_at:=case when e.state in ('FINAL','CORRECTED') then coalesce(e.first_final_at,t) else null end;
        next_at:=private.next_score_checkpoint(e.scheduled_start_at,t,e.actual_started_at is not null,final_at);
        update private.live_score_checks set first_final_at=final_at,next_check_at=next_at,
          failure_count=0,state=case when next_at is null then 'STOPPED' else 'CHECKED' end where event_id=e.id;
      else
        -- Bounded outage retries: 5m, 15m, then next remaining checkpoint.
        next_at:=case when e.failure_count=0 then t+interval '5 minutes'
          when e.failure_count=1 then t+interval '15 minutes'
          else private.next_score_checkpoint(e.scheduled_start_at,t,e.actual_started_at is not null,e.first_final_at) end;
        if next_at>e.scheduled_start_at+interval '60 hours' then next_at:=null; end if;
        update private.live_score_checks set next_check_at=next_at,failure_count=failure_count+1,
          state=case when next_at is null then 'STOPPED' when p_import is null then 'FAILED' else 'MISSING' end where event_id=e.id;
      end if;
    end loop;
    receipt:=jsonb_build_object('status',case when checked=cardinality(r.event_ids) then 'SUCCEEDED' when checked>0 then 'PARTIAL' else 'FAILED' end,'eventCount',checked);
  end if;
  update private.provider_requests set state=receipt->>'status',response=receipt where id=r.id;
  return receipt;
end;
$$;
revoke all on function api.complete_provider_request(uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function api.complete_provider_request(uuid,jsonb,integer) to service_role;

-- Add public event/check timing only to the existing authorized league read.
do $migration$
declare d text;
begin
  d:=pg_get_functiondef('api.get_live_week_operations(text)'::regprocedure);
  if strpos(d,'''state'', event.state,')=0 then raise exception 'Unexpected operations projection'; end if;
  d:=replace(d,'''state'', event.state,',$fields$
          'state', event.state,
          'scoreCheck', (select jsonb_build_object('attemptedAt',c.attempted_at,'fetchedAt',c.fetched_at,
            'sourceUpdatedAt',c.source_updated_at,'nextCheckAt',c.next_check_at,'state',c.state)
            from private.live_score_checks c where c.event_id=event.id),
$fields$);
  d:=replace(d,'''weekState'', v_week.state,', '''automationEnabled'',(select enabled from private.score_refresh_policy),''weekState'', v_week.state,');
  execute d;
end;
$migration$;
notify pgrst,'reload schema';
