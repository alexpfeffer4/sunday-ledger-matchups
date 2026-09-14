-- Public bookmaker coverage is shared; participant drafts/reviews remain private.
-- Installation keeps the existing enabled flag, caps, usage and provider balance.
alter table private.odds_refresh_policy
 add column prop_daily_credits integer not null default 0,
 add column prop_monthly_credits integer not null default 0,
 add column protected_core_daily_credits integer not null default 30 check(protected_core_daily_credits>=0),
 add column protected_core_monthly_credits integer not null default 150 check(protected_core_monthly_credits>=0),
 add column provider_cycle_verified_at timestamptz,
 add column provider_used_high_water integer;
create table private.shared_quote_requests (
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('MAIN','PROPS')),
 event_ids text[] not null check(cardinality(event_ids) between 1 and 32),
 families text[] not null,
 state text not null default 'PLANNED' check(state in ('PLANNED','RUNNING','SUCCEEDED','FAILED')),
 created_at timestamptz not null default clock_timestamp(),
 attempted_at timestamptz, expires_at timestamptz,
 reserved_cost integer not null default 0, charged_cost integer,
 fetched_at timestamptz, payload jsonb,
 requests_remaining integer, requests_used integer,
 check((kind='MAIN' and families=array['MAIN']::text[]) or
   (kind='PROPS' and cardinality(event_ids)=1 and cardinality(families) between 1 and 3
     and families <@ array['player_pass_yds','player_rush_yds','player_reception_yds']::text[]))
);
create table private.shared_quote_coverage (
 external_event_id text not null, family text not null,
 request_id uuid not null references private.shared_quote_requests(id),
 latest_successful_request_id uuid references private.shared_quote_requests(id),
 primary key(external_event_id,family)
);
create index shared_quote_coverage_request_idx on private.shared_quote_coverage(request_id);
create index shared_quote_coverage_success_idx on private.shared_quote_coverage(latest_successful_request_id);
create table private.member_quote_plans (
 id uuid primary key default gen_random_uuid(), actor_user_id uuid not null references auth.users(id),
 week_id uuid not null references private.season_weeks(id), request_ids uuid[] not null,
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '95 seconds'
);
create index member_quote_plans_actor_idx on private.member_quote_plans(actor_user_id);
create index member_quote_plans_week_idx on private.member_quote_plans(week_id);
alter table private.shared_quote_requests enable row level security;
alter table private.shared_quote_coverage enable row level security;
alter table private.member_quote_plans enable row level security;
revoke all on private.shared_quote_requests,private.shared_quote_coverage,private.member_quote_plans from public,anon,authenticated;
alter table private.live_quote_heads add column verified_request_id uuid references private.shared_quote_requests(id);
create index live_quote_heads_verified_request_idx on private.live_quote_heads(verified_request_id);

create or replace function private.invalidate_changed_quote_verification()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.market_snapshot_id is distinct from old.market_snapshot_id then
   new.verified_import_id:=null; new.verified_request_id:=null;
 end if; return new;
end;
$$;

-- Each HTTP request independently reserves its upper-bound cost immediately
-- before launch. Unknown/charged failures retain the reservation. Core spend
-- consumes its protected reserve; optional props cannot consume what remains.
create function private.reserve_selective_quote_credits(p_cost integer,p_props boolean)
returns void language plpgsql security definer set search_path='' as $$
declare p private.odds_refresh_policy%rowtype; t timestamptz:=clock_timestamp(); d date; m date;
begin
 if p_cost not between 1 and 3 then raise exception 'Invalid provider cost'; end if;
 select * into strict p from private.odds_refresh_policy for update;
 if p_props and not p.enabled then raise exception 'QUOTE_REFRESH_DISABLED'; end if;
 if p.next_request_at>t then raise exception 'QUOTE_REFRESH_COOLDOWN'; end if;
 d:=(t at time zone 'UTC')::date; m:=date_trunc('month',t at time zone 'UTC')::date;
 if p.usage_day<>d then p.daily_credits:=0; p.prop_daily_credits:=0; end if;
 if p.usage_month<>m then p.monthly_credits:=0; p.prop_monthly_credits:=0; end if;
 if p.daily_credits+p_cost>p.daily_credit_limit
  or p.monthly_credits+p_cost>p.monthly_credit_limit
  or (p.requests_remaining is not null and p.requests_remaining<p.reserve_credits+p_cost)
  or (p_props and (
    p.daily_credits+p_cost+greatest(0,p.protected_core_daily_credits-(p.daily_credits-p.prop_daily_credits))>p.daily_credit_limit
    or p.monthly_credits+p_cost+greatest(0,p.protected_core_monthly_credits-(p.monthly_credits-p.prop_monthly_credits))>p.monthly_credit_limit
    or (p.requests_remaining is not null and p.requests_remaining<p.reserve_credits+p_cost+
      greatest(0,p.protected_core_daily_credits-(p.daily_credits-p.prop_daily_credits)))))
 then raise exception 'QUOTE_REFRESH_BUDGET'; end if;
 update private.odds_refresh_policy set daily_credits=p.daily_credits+p_cost,monthly_credits=p.monthly_credits+p_cost,
  prop_daily_credits=p.prop_daily_credits+case when p_props then p_cost else 0 end,
  prop_monthly_credits=p.prop_monthly_credits+case when p_props then p_cost else 0 end,
  usage_day=d,usage_month=m,requests_remaining=p.requests_remaining-p_cost,next_request_at=t+interval '3 seconds' where singleton;
end;
$$;
revoke all on function private.reserve_selective_quote_credits(integer,boolean) from public,anon,authenticated;

-- Preserve other provider authorities while making their core accounting share
-- the same day/month reset and reservation implementation.
create or replace function private.reserve_provider_credits(p_cost integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_cost not in (2,3) then raise exception 'Invalid provider cost'; end if;
 perform private.reserve_selective_quote_credits(p_cost,false);
end;
$$;

create function api.plan_live_quote_refresh(p_league_id uuid,p_positions jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=(select auth.uid()); w private.season_weeks%rowtype; t timestamptz;
 ids uuid[]:='{}'; requested uuid[]; main_events text[]:='{}'; missing text[]; families text[];
 r record; c record; id_new uuid; plan_id uuid; q private.shared_quote_requests%rowtype; menu_refresh boolean:=false; menu_event uuid;
begin
 if u is null or not private.is_league_member(p_league_id) then raise exception using errcode='42501',message='League membership required.'; end if;
 -- The global policy lock serializes overlapping coverage claims across leagues.
 perform 1 from private.odds_refresh_policy where enabled for update;
 if not found then return jsonb_build_object('status','DISABLED'); end if;
 select week.* into w from private.season_weeks week join private.seasons s on s.id=week.season_id
  where s.league_id=p_league_id and s.mode='LIVE'
   and s.lifecycle in ('DRAFT','ROSTER_LOCKED','REGULAR','PLAYOFFS','CHAMPION_FINAL','WEEK_18_EXHIBITION')
   and not exists(select 1 from private.owner_rehearsals x where x.league_id=p_league_id)
  order by s.created_at desc,week.nfl_week desc limit 1;
 t:=clock_timestamp();
 if w.id is null or t>=private.week_entry_closes_at(w.id)
  or (w.state='PLANNED' and not private.is_league_commissioner(p_league_id))
  or (w.state<>'PLANNED' and (t<w.opens_at or w.state not in ('OPEN','LOCKED','PROVISIONAL')))
  or (not private.is_rolling_week(w.id) and w.state not in ('PLANNED','OPEN')) then raise exception 'The current card is not open.'; end if;
 if not private.is_league_commissioner(p_league_id) and not exists(select 1 from private.weekly_cards card
  where card.week_id=w.id and card.owner_user_id=u
   and ((private.is_rolling_week(w.id) and private.rolling_card_can_submit(card.id))
    or (not private.is_rolling_week(w.id) and not exists(select 1 from private.position_receipts x where x.card_id=card.id))))
 then raise exception using errcode='42501',message='An eligible member card is required.'; end if;
 if jsonb_typeof(p_positions)='object' and p_positions->>'playerMenu'='true' then
  menu_event:=(p_positions->>'eventId')::uuid;
  if menu_event is null and not private.is_league_commissioner(p_league_id) then raise exception using errcode='42501',message='Commissioner membership required.'; end if;
  if menu_event is not null and not exists(select 1 from private.sports_events where id=menu_event and week_id=w.id and private.event_accepts_entries(id)) then raise exception 'QUOTE_SELECTION_UNAVAILABLE'; end if;
  menu_refresh:=true;
 elsif p_positions is not null then
  if jsonb_typeof(p_positions)<>'array' or jsonb_array_length(p_positions) not between 1 and 20 then raise exception 'Invalid card draft.'; end if;
  select array_agg((p->>'marketSnapshotId')::uuid) into requested from jsonb_array_elements(p_positions) p;
  if (select count(*) from private.market_snapshots s where s.id=any(requested) and s.week_id=w.id
    and private.event_accepts_entries(s.event_id)
    and (s.subject_id is null or private.prop_snapshot_allowed(s.event_id,s.subject_id,s.statistic,s.period))
    and exists(select 1 from private.slate_items i where i.market_snapshot_id=s.id and private.is_effective_slate_item(i.id)))<>cardinality(requested)
  then raise exception 'QUOTE_SELECTION_UNAVAILABLE'; end if;
 end if;
 -- Main-only operation retains one bulk request for all still-open games.
 if not menu_refresh and (requested is null or exists(select 1 from private.market_snapshots where id=any(requested) and subject_id is null)) then
  for r in select e.fixture_event_key from private.sports_events e where e.week_id=w.id
   and (not private.is_rolling_week(w.id) or private.event_accepts_entries(e.id))
   and exists(select 1 from private.slate_items i where i.event_id=e.id and private.is_effective_slate_item(i.id)) order by e.fixture_event_key loop
   select req.* into q from private.shared_quote_coverage cov join private.shared_quote_requests req on req.id=cov.request_id
    where cov.external_event_id=r.fixture_event_key and cov.family='MAIN';
   if q.id is not null and ((q.state='SUCCEEDED' and q.fetched_at>=t-interval '60 seconds'
      and not exists(select 1 from jsonb_array_elements(q.payload->'events') ev cross join jsonb_array_elements(ev->'markets') market
        where (market->>'observedAt')::timestamptz<t-interval '10 minutes'))
      or (q.state='RUNNING' and q.expires_at>t) or (q.state='PLANNED' and q.created_at>t-interval '90 seconds')) then ids:=array_append(ids,q.id);
   else main_events:=array_append(main_events,r.fixture_event_key); end if;
  end loop;
  if cardinality(main_events)>0 then
   insert into private.shared_quote_requests(kind,event_ids,families) values('MAIN',main_events,array['MAIN']) returning id into id_new;
   insert into private.shared_quote_coverage select e,'MAIN',id_new from unnest(main_events) e
    on conflict(external_event_id,family) do update set request_id=excluded.request_id;
   ids:=array_append(ids,id_new);
  end if;
 end if;
 for r in select e.fixture_event_key,array_agg(distinct case s.statistic when 'PASSING_YARDS' then 'player_pass_yds'
   when 'RUSHING_YARDS' then 'player_rush_yds' when 'RECEIVING_YARDS' then 'player_reception_yds' end) families
  from (select s.event_id,s.statistic from private.market_snapshots s where s.id=any(requested) and s.subject_id is not null
    union select m.event_id,m.statistic from private.week_player_menu m where menu_refresh and m.week_id=w.id
      and (menu_event is null or m.event_id=menu_event) and m.subject_id is not null and private.prop_snapshot_allowed(m.event_id,m.subject_id,m.statistic,m.period)
      and private.event_accepts_entries(m.event_id)) s join private.sports_events e on e.id=s.event_id
  group by e.fixture_event_key order by e.fixture_event_key loop
  missing:='{}';
  for c in select unnest(r.families) family loop
   select req.* into q from private.shared_quote_coverage cov join private.shared_quote_requests req on req.id=cov.request_id
    where cov.external_event_id=r.fixture_event_key and cov.family=c.family;
   if q.id is not null and ((q.state='SUCCEEDED' and q.fetched_at>=t-interval '60 seconds'
      and not exists(select 1 from jsonb_array_elements(q.payload->'events') ev cross join jsonb_array_elements(ev->'markets') market
        where (market->>'observedAt')::timestamptz<t-interval '10 minutes'))
    or (q.state='RUNNING' and q.expires_at>t) or (q.state='PLANNED' and q.created_at>t-interval '90 seconds')) then ids:=array_append(ids,q.id);
   else missing:=array_append(missing,c.family); end if;
  end loop;
  if cardinality(missing)>0 then
   insert into private.shared_quote_requests(kind,event_ids,families) values('PROPS',array[r.fixture_event_key],missing) returning id into id_new;
   insert into private.shared_quote_coverage select r.fixture_event_key,f,id_new from unnest(missing) f
    on conflict(external_event_id,family) do update set request_id=excluded.request_id;
   ids:=array_append(ids,id_new);
  end if;
 end loop;
 select array_agg(distinct i) into ids from unnest(ids) i;
 -- Twenty positions can select all16 games plus main lines:17 network requests.
 -- Cached main coverage may be fragmented into16 requests and prop families into48.
 -- Cached row count is distinct from the maximum17 new network requests.
 if ids is null or cardinality(ids)>64 then raise exception 'QUOTE_REQUEST_PLAN_INVALID'; end if;
 insert into private.member_quote_plans(actor_user_id,week_id,request_ids) values(u,w.id,ids) returning id into plan_id;
 return jsonb_build_object('status','PLANNED','planId',plan_id,'requestIds',ids);
end;
$$;
revoke all on function api.plan_live_quote_refresh(uuid,jsonb) from public,anon;
grant execute on function api.plan_live_quote_refresh(uuid,jsonb) to authenticated;

create function api.claim_shared_quote_request(p_plan_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.member_quote_plans%rowtype; r private.shared_quote_requests%rowtype; t timestamptz; delay integer;
begin
 perform 1 from private.odds_refresh_policy where enabled for update;
 if not found then return jsonb_build_object('status','DISABLED'); end if;
 select * into strict p from private.member_quote_plans where id=p_plan_id;
 if not p_request_id=any(p.request_ids) or p.expires_at<=clock_timestamp()
  or not exists(select 1 from private.league_memberships m join private.season_weeks w on w.league_id=m.league_id
    where w.id=p.week_id and m.user_id=p.actor_user_id) then raise exception 'QUOTE_REFRESH_LEASE_INVALID'; end if;
 select * into strict r from private.shared_quote_requests where id=p_request_id;
 perform 1 from private.shared_quote_coverage cov where cov.external_event_id=any(r.event_ids) and cov.family=any(r.families)
  order by cov.external_event_id,cov.family for update;
 select * into strict r from private.shared_quote_requests where id=p_request_id for update;
 t:=clock_timestamp();
 if r.state='SUCCEEDED'  and r.fetched_at>=t-interval '120 seconds' then return jsonb_build_object('status','CACHED'); end if;
 if r.state='RUNNING' and r.expires_at>t then return jsonb_build_object('status','WAIT','retryAfterMs',250); end if;
 if r.state<>'PLANNED' then raise exception 'QUOTE_REFRESH_LEASE_INVALID'; end if;
 select greatest(0,ceil(extract(epoch from next_request_at-t)*1000))::integer into delay from private.odds_refresh_policy;
 if delay>0 then return jsonb_build_object('status','WAIT','retryAfterMs',least(delay,3000)); end if;
 perform private.reserve_selective_quote_credits(case when r.kind='MAIN' then 3 else cardinality(r.families) end,r.kind='PROPS');
 update private.shared_quote_requests set state='RUNNING',attempted_at=t,expires_at=t+interval '25 seconds',
  reserved_cost=case when kind='MAIN' then 3 else cardinality(families) end where id=r.id;
 return jsonb_build_object('status','CLAIMED','kind',r.kind,'requestId',r.id,'eventIds',r.event_ids,'families',r.families);
end;
$$;
revoke all on function api.claim_shared_quote_request(uuid,uuid) from public,anon,authenticated;
grant execute on function api.claim_shared_quote_request(uuid,uuid) to service_role;

create function api.complete_shared_quote_request(p_request_id uuid,p_import jsonb,p_usage jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.shared_quote_requests%rowtype; t timestamptz; fetched timestamptz; e jsonb; m jsonb;
 remain integer; used integer; charged integer; extra integer; keys text[]; families text[];
begin
 perform 1 from private.odds_refresh_policy for update;
 select * into strict r from private.shared_quote_requests where id=p_request_id;
 perform 1 from private.shared_quote_coverage cov where cov.external_event_id=any(r.event_ids) and cov.family=any(r.families)
  order by cov.external_event_id,cov.family for update;
 select * into strict r from private.shared_quote_requests where id=p_request_id for update;
 t:=clock_timestamp();
 if r.state='SUCCEEDED' then return jsonb_build_object('status','SUCCEEDED','replayed',true); end if;
 if r.state<>'RUNNING' then raise exception 'QUOTE_REFRESH_LEASE_INVALID'; end if;
 remain:=(p_usage->>'remaining')::integer; used:=(p_usage->>'used')::integer; charged:=(p_usage->>'last')::integer;
 if coalesce(remain,0)<0 or coalesce(used,0)<0 or coalesce(charged,0)<0 then raise exception 'Invalid provider usage'; end if;
 extra:=greatest(0,coalesce(charged,r.reserved_cost)-r.reserved_cost);
 update private.odds_refresh_policy set
  requests_remaining=case when remain is null then requests_remaining-extra else least(coalesce(requests_remaining,remain)-extra,remain) end,
  provider_used_high_water=greatest(provider_used_high_water,used),
  daily_credits=daily_credits+extra,monthly_credits=monthly_credits+extra,
  prop_daily_credits=prop_daily_credits+case when r.kind='PROPS' then extra else 0 end,
  prop_monthly_credits=prop_monthly_credits+case when r.kind='PROPS' then extra else 0 end where singleton;
 if p_import is null or p_import='null'::jsonb or r.expires_at<=t then
  update private.shared_quote_requests set state='FAILED',requests_remaining=remain,requests_used=used,
   charged_cost=greatest(r.reserved_cost,coalesce(charged,0)) where id=r.id;
  return jsonb_build_object('status','FAILED');
 end if;
 fetched:=(p_import->>'fetchedAt')::timestamptz;
 if p_import->>'source'<>'THE_ODDS_API' or fetched is null or fetched<r.attempted_at or fetched>t or fetched<t-interval '20 seconds'
  or jsonb_typeof(p_import->'events')<>'array' then raise exception 'QUOTE_FETCH_INVALID'; end if;
 select array_agg(x->>'externalEventId' order by x->>'externalEventId') into keys from jsonb_array_elements(p_import->'events') x;
 if keys is distinct from (select array_agg(x order by x) from unnest(r.event_ids) x) then raise exception 'QUOTE_REFRESH_EVENT_SET_CHANGED'; end if;
 for e in select value from jsonb_array_elements(p_import->'events') loop
  if e->>'source'<>'THE_ODDS_API' or e->>'sportKey'<>'americanfootball_nfl' or nullif(e->>'homeTeam','') is null
   or nullif(e->>'awayTeam','') is null or (e->>'scheduledStartAt')::timestamptz is null or jsonb_typeof(e->'markets')<>'array'
  then raise exception 'QUOTE_FETCH_INVALID'; end if;
  if r.kind='MAIN' then
   select array_agg((x->>'marketType')||':'||(x->>'outcomeKey') order by (x->>'marketType')||':'||(x->>'outcomeKey')) into keys
    from jsonb_array_elements(e->'markets') x;
   if keys is distinct from array['MONEYLINE:AWAY','MONEYLINE:HOME','SPREAD:AWAY','SPREAD:HOME','TOTAL:OVER','TOTAL:UNDER']
    or exists(select 1 from jsonb_array_elements(e->'markets') x where x ? 'externalPlayerId' or x ? 'subjectId')
   then raise exception 'MAIN_QUOTE_SET_INCOMPLETE'; end if;
  else
   select array_agg(x order by x) into families from jsonb_array_elements_text(e->'requestedFamilies') x;
   if families is distinct from (select array_agg(x order by x) from unnest(r.families) x) then raise exception 'QUOTE_COVERAGE_CHANGED'; end if;
   if exists(select 1 from jsonb_array_elements(e->'markets') x group by x->>'externalPlayerId',x->>'statistic'
     having count(*)<>2 or count(distinct x->>'outcomeKey')<>2 or count(distinct x->>'lineMilli')<>1)
   then raise exception 'PROP_QUOTE_PAIR_INVALID'; end if;
  end if;
  for m in select value from jsonb_array_elements(e->'markets') loop
   if m->>'sourceBook'<>'draftkings' or nullif(m->>'proposition','') is null or (m->>'americanOdds')::integer is null
    or (m->>'americanOdds')::integer=0 or (m->>'observedAt')::timestamptz is null
    or (m->>'observedAt')::timestamptz>fetched or (m->>'observedAt')::timestamptz<t-interval '10 minutes'
    or (m->>'marketType'<>'MONEYLINE' and (m->>'lineMilli')::integer is null)
    or (m->>'marketType'='MONEYLINE' and m->>'lineMilli' is not null)
   then raise exception 'QUOTE_SOURCE_STALE'; end if;
   if r.kind='PROPS' and (m->>'period'<>'FULL_GAME' or m->>'outcomeKey' not in ('OVER','UNDER')
    or nullif(m->>'externalPlayerId','') is null or m->>'marketType'<>'PLAYER_'||(m->>'statistic')
    or not (case m->>'statistic' when 'PASSING_YARDS' then 'player_pass_yds' when 'RUSHING_YARDS' then 'player_rush_yds'
      when 'RECEIVING_YARDS' then 'player_reception_yds' else 'INVALID' end)=any(r.families)) then raise exception 'QUOTE_COVERAGE_CHANGED'; end if;
  end loop;
 end loop;
 update private.shared_quote_requests set state='SUCCEEDED',payload=p_import,fetched_at=fetched,
  requests_remaining=remain,requests_used=used,charged_cost=greatest(r.reserved_cost,coalesce(charged,0)) where id=r.id;
 update private.shared_quote_coverage cov set latest_successful_request_id=r.id
  where cov.external_event_id=any(r.event_ids) and cov.family=any(r.families)
   and (cov.latest_successful_request_id is null or
    (select older.fetched_at from private.shared_quote_requests older where older.id=cov.latest_successful_request_id)<=fetched);
 return jsonb_build_object('status','SUCCEEDED');
end;
$$;
revoke all on function api.complete_shared_quote_request(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function api.complete_shared_quote_request(uuid,jsonb,jsonb) to service_role;

-- Apply public data to an authorized week's own immutable snapshots. This step
-- rechecks time and published event identity, but never accepts a member bet.
create function api.apply_live_quote_plan(p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=(select auth.uid()); p private.member_quote_plans%rowtype; w private.season_weeks%rowtype;
 r private.shared_quote_requests%rowtype; e private.sports_events%rowtype; src jsonb; m jsonb;
 subject uuid; label text; team text; mapped integer; snapshot_id uuid; snapshot_hash text; v_slate_id uuid;
 current private.market_snapshots%rowtype; t timestamptz; n integer:=0; imported_subjects uuid[];
begin
 select * into p from private.member_quote_plans where id=p_plan_id and actor_user_id=u;
 if u is null or p.id is null or not exists(select 1 from private.league_memberships lm join private.season_weeks sw on sw.league_id=lm.league_id
  where sw.id=p.week_id and lm.user_id=u) then raise exception using errcode='42501',message='League membership required.'; end if;
 perform 1 from private.seasons s join private.season_weeks sw on sw.season_id=s.id where sw.id=p.week_id and s.mode='LIVE' for update of s;
 select * into strict w from private.season_weeks where id=p.week_id for update;
 t:=clock_timestamp();
 if p.expires_at<=t or t>=private.week_entry_closes_at(w.id) then raise exception 'QUOTE_REFRESH_LEASE_INVALID'; end if;
 if exists(select 1 from unnest(p.request_ids) requested_id(id) left join private.shared_quote_requests req on req.id=requested_id.id
  where req.state is distinct from 'SUCCEEDED' or req.fetched_at<t-interval '120 seconds' or req.fetched_at>t) then raise exception 'QUOTE_SOURCE_STALE'; end if;
 select sl.id into strict v_slate_id from private.slates sl where sl.week_id=w.id
  and exists(select 1 from private.slate_items i where i.slate_id=sl.id and private.is_effective_slate_item(i.id)) order by sl.version desc limit 1;
 for r in select req.* from private.shared_quote_requests req where req.id=any(p.request_ids) order by req.fetched_at,req.id loop
  for src in select value from jsonb_array_elements(r.payload->'events') loop
   select ev.* into e from private.sports_events ev where ev.week_id=w.id and ev.fixture_event_key=src->>'externalEventId' for update;
   if e.id is null then continue; end if; -- A cached public bulk response may also contain other leagues' published games.
   if e.away_team<>src->>'awayTeam' or e.home_team<>src->>'homeTeam' or e.scheduled_start_at<>(src->>'scheduledStartAt')::timestamptz then raise exception 'EVENT_IDENTITY_CHANGED'; end if;
   if not private.event_accepts_entries(e.id) then continue; end if;
   for m in select value from jsonb_array_elements(src->'markets') loop
    if exists(select 1 from private.shared_quote_coverage cov join private.shared_quote_requests newer on newer.id=cov.latest_successful_request_id
     where cov.external_event_id=e.fixture_event_key and cov.family=case when r.kind='MAIN' then 'MAIN' else
      case m->>'statistic' when 'PASSING_YARDS' then 'player_pass_yds' when 'RUSHING_YARDS' then 'player_rush_yds' when 'RECEIVING_YARDS' then 'player_reception_yds' end end
     and newer.state='SUCCEEDED' and newer.id<>r.id and newer.fetched_at>=r.fetched_at) then continue; end if;
    subject:=null; label:=null; team:=null;
    if r.kind='PROPS' then
     select count(*),(array_agg(map.subject_id))[1],(array_agg(ps.display_name))[1],(array_agg(map.team))[1]
      into mapped,subject,label,team from private.player_provider_mappings map join private.player_subjects ps on ps.id=map.subject_id
      where map.provider='THE_ODDS_API' and map.external_event_id=e.fixture_event_key and map.external_player_id=m->>'externalPlayerId'
       and map.team in(e.away_team,e.home_team) and map.game_date=(e.scheduled_start_at at time zone 'America/New_York')::date
       and map.result_path_verified;
     if mapped<>1 or not private.prop_snapshot_allowed(e.id,subject,m->>'statistic',m->>'period') then continue; end if;
    end if;
    select s.* into current from private.live_quote_heads h join private.market_snapshots s on s.id=h.market_snapshot_id
     where h.event_id=e.id and h.market_type=m->>'marketType' and h.outcome_key=m->>'outcomeKey'
      and h.subject_id is not distinct from subject;
    if current.id is not null and current.observed_at>(m->>'observedAt')::timestamptz then continue; end if;
    if (m->>'observedAt')::timestamptz<t-interval '10 minutes' then raise exception 'QUOTE_SOURCE_STALE'; end if;
    snapshot_hash:=encode(extensions.digest(e.fixture_event_key||':'||m::text||coalesce(':'||subject::text,''),'sha256'),'hex');
    select s.id into snapshot_id from private.market_snapshots s where s.event_id=e.id and s.payload_hash=snapshot_hash
     and s.subject_id is not distinct from subject limit 1;
    if snapshot_id is null then
     insert into private.market_snapshots(event_id,week_id,league_id,book_key,market_type,outcome_key,proposition,line_milli,
      american_odds,quality_status,observed_at,payload_hash,subject_id,subject_label,subject_team,statistic,period)
     values(e.id,w.id,w.league_id,'draftkings',m->>'marketType',m->>'outcomeKey',m->>'proposition',(m->>'lineMilli')::integer,
      (m->>'americanOdds')::integer,'HEALTHY',(m->>'observedAt')::timestamptz,snapshot_hash,subject,label,team,m->>'statistic',m->>'period') returning id into snapshot_id;
    end if;
    insert into private.slate_items(slate_id,event_id,market_snapshot_id,week_id,league_id)
     values(v_slate_id,e.id,snapshot_id,w.id,w.league_id) on conflict(slate_id,market_snapshot_id) do nothing;
    if subject is null then
     insert into private.live_quote_heads(event_id,week_id,league_id,market_type,outcome_key,market_snapshot_id)
      values(e.id,w.id,w.league_id,m->>'marketType',m->>'outcomeKey',snapshot_id)
      on conflict(event_id,market_type,outcome_key) where subject_id is null do update set market_snapshot_id=excluded.market_snapshot_id,updated_at=t;
    else
     insert into private.live_quote_heads(event_id,week_id,league_id,market_type,outcome_key,market_snapshot_id,subject_id,statistic,period)
      values(e.id,w.id,w.league_id,m->>'marketType',m->>'outcomeKey',snapshot_id,subject,m->>'statistic',m->>'period')
      on conflict(event_id,subject_id,statistic,period,outcome_key) where subject_id is not null do update set market_snapshot_id=excluded.market_snapshot_id,updated_at=t;
    end if;
    -- Trigger invalidates old proof; attach only this exact successfully fetched head.
    update private.live_quote_heads set verified_request_id=r.id,verified_import_id=null where market_snapshot_id=snapshot_id;
    n:=n+1;
   end loop;
   if r.kind='PROPS' then
    -- Successful empty/partial coverage removes previously offered missing subjects.
    -- Failed network requests cannot claim suspension or freshness.
    delete from private.live_quote_heads h where h.event_id=e.id and h.subject_id is not null
     and (case h.statistic when 'PASSING_YARDS' then 'player_pass_yds' when 'RUSHING_YARDS' then 'player_rush_yds' when 'RECEIVING_YARDS' then 'player_reception_yds' end)=any(r.families)
     and not exists(select 1 from private.shared_quote_requests newer where newer.id=h.verified_request_id and newer.fetched_at>r.fetched_at)
     and not exists(select 1 from private.market_snapshots snap where snap.id=h.market_snapshot_id and snap.observed_at>r.fetched_at)
     and not exists(select 1 from jsonb_array_elements(src->'markets') offer join private.player_provider_mappings map
       on map.external_player_id=offer->>'externalPlayerId' and map.provider='THE_ODDS_API' and map.external_event_id=e.fixture_event_key
       and map.team in(e.away_team,e.home_team) and map.game_date=(e.scheduled_start_at at time zone 'America/New_York')::date and map.result_path_verified
       where map.subject_id=h.subject_id and offer->>'statistic'=h.statistic and offer->>'outcomeKey'=h.outcome_key);
   end if;
  end loop;
 end loop;
 return jsonb_build_object('status','REFRESHED','quoteCount',n);
end;
$$;
revoke all on function api.apply_live_quote_plan(uuid) from public,anon;
grant execute on function api.apply_live_quote_plan(uuid) to authenticated;

-- Review and final proof use matching subject identity and exact fetched coverage.
-- No source timestamp is refreshed. The original30s proof and120s/10m checks stay.
do $coverage$
declare d text;
begin
 d:=pg_get_functiondef('api.review_live_card_quotes(text,jsonb)'::regprocedure);
 if strpos(d,'h.outcome_key=old.outcome_key')=0 then raise exception 'Review quote join changed'; end if;
 d:=replace(d,'h.outcome_key=old.outcome_key','h.outcome_key=old.outcome_key and h.subject_id is not distinct from old.subject_id and h.statistic is not distinct from old.statistic and h.period is not distinct from old.period');
 d:=replace(d,'join private.live_odds_imports i on i.id=h.verified_import_id','left join private.live_odds_imports i on i.id=h.verified_import_id left join private.shared_quote_requests qr on qr.id=h.verified_request_id and qr.state=''SUCCEEDED''');
 d:=replace(d,'i.fetched_at','coalesce(qr.fetched_at,i.fetched_at)');
 execute d;
 d:=pg_get_functiondef('private.assert_live_card_quote_review(uuid,uuid,jsonb,timestamptz)'::regprocedure);
 d:=replace(d,'left join private.live_odds_imports i on i.id=h.verified_import_id','left join private.live_odds_imports i on i.id=h.verified_import_id left join private.shared_quote_requests qr on qr.id=h.verified_request_id and qr.state=''SUCCEEDED''');
 d:=replace(d,'i.fetched_at','coalesce(qr.fetched_at,i.fetched_at)');
 execute d;
 d:=pg_get_functiondef('api.complete_live_quote_refresh(uuid,jsonb,integer)'::regprocedure);
 if strpos(d,'where h.week_id=v_week.id')=0 then raise exception 'Legacy quote attestation changed'; end if;
 d:=replace(d,'where h.week_id=v_week.id','where h.week_id=v_week.id and h.subject_id is null and h.market_type in (''MONEYLINE'',''SPREAD'',''TOTAL'')');
 execute d;
end;
$coverage$;


create function api.plan_player_menu_quotes(p_league_id uuid,p_event_id uuid default null) returns jsonb
language sql volatile security definer set search_path='' as $$
 select api.plan_live_quote_refresh(p_league_id,jsonb_build_object('playerMenu',true,'eventId',p_event_id));
$$;
revoke all on function api.plan_player_menu_quotes(uuid,uuid) from public,anon;
grant execute on function api.plan_player_menu_quotes(uuid,uuid) to authenticated;

-- Prepared 20K entitlement configuration. Explicit service-only release step;
-- merely installing the migration never raises current Production caps.
alter table private.odds_refresh_policy add column provider_cycle_id text,
 add column provider_entitlement_credits integer;
create table private.odds_budget_configuration_evidence (
 id uuid primary key default gen_random_uuid(),verified_at timestamptz not null,
 provider_cycle_id text not null,entitlement_credits integer not null,remaining integer not null,used integer not null,
 configured_at timestamptz not null default clock_timestamp()
);
alter table private.odds_budget_configuration_evidence enable row level security;
revoke all on private.odds_budget_configuration_evidence from public,anon,authenticated;
create trigger odds_budget_configuration_evidence_append_only before update or delete on private.odds_budget_configuration_evidence
 for each row execute function private.reject_competitive_mutation();
create function api.configure_player_prop_odds_budget(p_verified_entitlement jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p private.odds_refresh_policy%rowtype; credits integer; remaining integer; used integer; cycle text; observed timestamptz;
begin
 credits:=(p_verified_entitlement->>'entitlementCredits')::integer;
 remaining:=(p_verified_entitlement->>'remaining')::integer; used:=(p_verified_entitlement->>'used')::integer;
 cycle:=p_verified_entitlement->>'cycleId'; observed:=(p_verified_entitlement->>'observedAt')::timestamptz;
 if credits is null or credits<20000 or remaining is null or remaining<30 or used is null or used<0
  or remaining::bigint+used::bigint>credits or nullif(cycle,'') is null or char_length(cycle)>120
  or observed is null or observed>clock_timestamp() or observed<clock_timestamp()-interval '10 minutes'
 then raise exception 'ODDS_ENTITLEMENT_NOT_VERIFIED'; end if;
 select * into strict p from private.odds_refresh_policy for update;
 if p.provider_cycle_verified_at is not null and observed<=p.provider_cycle_verified_at then raise exception 'ODDS_ENTITLEMENT_EVIDENCE_OLD'; end if;
 insert into private.odds_budget_configuration_evidence(verified_at,provider_cycle_id,entitlement_credits,remaining,used)
 values(observed,cycle,credits,remaining,used);
 update private.odds_refresh_policy set daily_credit_limit=1000,monthly_credit_limit=5000,
  protected_core_daily_credits=350,protected_core_monthly_credits=2000,
  requests_remaining=case when p.provider_cycle_id is distinct from cycle or coalesce(p.provider_entitlement_credits,0)<credits
    then remaining else least(coalesce(p.requests_remaining,remaining),remaining) end,
  provider_cycle_id=cycle,provider_entitlement_credits=credits,provider_cycle_verified_at=observed,
  provider_used_high_water=case when p.provider_cycle_id is distinct from cycle then used else greatest(p.provider_used_high_water,used) end where singleton;
 -- Daily/monthly usage and the enable/offering controls are deliberately preserved.
 return jsonb_build_object('dailyCreditLimit',1000,'monthlyCreditLimit',5000,'protectedCoreDailyCredits',350,'protectedCoreMonthlyCredits',2000,
  'providerEntitlementCredits',credits,'usagePreserved',true);
end;
$$;
revoke all on function api.configure_player_prop_odds_budget(jsonb) from public,anon,authenticated;
grant execute on function api.configure_player_prop_odds_budget(jsonb) to service_role;

-- Legacy commissioner quote requests still reserve core credits. Preserve their
-- existing numeric caps but synchronize optional-demand counters at UTC resets.
do $legacy_counter_reset$
declare d text;
begin
 d:=pg_get_functiondef('api.claim_live_quote_refresh(uuid)'::regprocedure);
 if strpos(d,'usage_day = (v_now at time zone ''UTC'')::date,')=0 then raise exception 'Legacy quote usage reset changed'; end if;
 d:=replace(d,'usage_day = (v_now at time zone ''UTC'')::date,',
  'prop_daily_credits = case when usage_day<>(v_now at time zone ''UTC'')::date then 0 else prop_daily_credits end,
    prop_monthly_credits = case when usage_month<>date_trunc(''month'',v_now at time zone ''UTC'')::date then 0 else prop_monthly_credits end,
    usage_day = (v_now at time zone ''UTC'')::date,');
 execute d;
end;
$legacy_counter_reset$;

-- A newer known public price/suspension also invalidates another league's old
-- proof. Preserve the success head while a later request is planned or fails.
-- Completion and acceptance serialize on coverage; clock is read after waiting.
do $latest_public_quote_proof$
declare d text; anchor text;
begin
 d:=pg_get_functiondef('private.assert_live_card_quote_review(uuid,uuid,jsonb,timestamptz)'::regprocedure);
 anchor:='  select * into v_review from private.live_card_quote_reviews';
 if strpos(d,anchor)=0 then raise exception 'Latest coverage review anchor changed'; end if;
 d:=replace(d,anchor,$new$  perform 1 from private.shared_quote_coverage cov where exists(
    select 1 from jsonb_array_elements(v_positions) item join private.market_snapshots m on m.id=(item->>'marketSnapshotId')::uuid
    join private.sports_events e on e.id=m.event_id where cov.external_event_id=e.fixture_event_key
    and cov.family=case when m.subject_id is null then 'MAIN' else case m.statistic
      when 'PASSING_YARDS' then 'player_pass_yds' when 'RUSHING_YARDS' then 'player_rush_yds' when 'RECEIVING_YARDS' then 'player_reception_yds' end end)
    order by cov.external_event_id,cov.family for share;
  p_now:=clock_timestamp();
  select * into v_review from private.live_card_quote_reviews$new$);
 anchor:='or m.observed_at<p_now-interval ''10 minutes''';
 if strpos(d,anchor)=0 then raise exception 'Latest coverage age anchor changed'; end if;
 d:=replace(d,anchor,anchor||$new$
      or exists(select 1 from private.shared_quote_coverage cov join private.shared_quote_requests latest on latest.id=cov.latest_successful_request_id
        where cov.external_event_id=e.fixture_event_key and cov.family=case when m.subject_id is null then 'MAIN' else case m.statistic
          when 'PASSING_YARDS' then 'player_pass_yds' when 'RUSHING_YARDS' then 'player_rush_yds' when 'RECEIVING_YARDS' then 'player_reception_yds' end end
         and latest.id is distinct from h.verified_request_id and latest.fetched_at>=coalesce(qr.fetched_at,i.fetched_at))$new$);
 execute d;
end;
$latest_public_quote_proof$;
