-- Operational refresh only. Installation is dormant and preserves usage,
-- existing automation, frozen identities, cutoffs and all accepted receipts.
create table private.background_quote_settings (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false, revision bigint not null default 1,
 release_sha text, polling_enabled boolean not null default false,
 daily_limit integer not null default 1300 check(daily_limit between 0 and 1300),
 monthly_limit integer not null default 13500 check(monthly_limit between 0 and 13500),
 provider_reserve integer not null default 2000 check(provider_reserve>=2000),
 backoff_until timestamptz, cadence_multiplier integer not null default 1 check(cadence_multiplier between 1 and 24),
 forecast_at timestamptz, forecast jsonb
);
insert into private.background_quote_settings default values;
alter table private.odds_refresh_policy
 add column background_daily_credits integer not null default 0,
 add column background_monthly_credits integer not null default 0;
alter table private.shared_quote_requests add column purpose text not null default 'DEMAND'
 check(purpose in ('DEMAND','BACKGROUND'));
alter table private.shared_quote_coverage add column background_attempts integer not null default 0,
 add column background_retry_at timestamptz,
 add column background_last_failure_id uuid references private.shared_quote_requests(id);
create index shared_quote_coverage_failure_idx on private.shared_quote_coverage(background_last_failure_id);
create table private.background_quote_runs (
 id uuid primary key default gen_random_uuid(), revision bigint not null,
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null default clock_timestamp()+interval '55 seconds',
 coverage jsonb not null, request_ids uuid[] not null default '{}', finished_at timestamptz
);
create table private.background_quote_applications (
 event_id uuid not null references private.sports_events(id), family text not null,
 request_id uuid references private.shared_quote_requests(id), applied_at timestamptz,
 attempted_at timestamptz, retry_at timestamptz, failure_code text,
 primary key(event_id,family)
);
create index background_quote_applications_request_idx on private.background_quote_applications(request_id);
alter table private.background_quote_settings enable row level security;
alter table private.background_quote_runs enable row level security;
alter table private.background_quote_applications enable row level security;
revoke all on private.background_quote_settings,private.background_quote_runs,private.background_quote_applications from public,anon,authenticated,service_role;

-- The event authority includes rolling LOCKED/PROVISIONAL later games. No
-- PLANNED, simulation, rehearsal, final or archived scope can enter this union.
create function private.background_quote_targets()
returns table(event_id uuid,week_id uuid,external_event_id text,family text,cutoff timestamptz)
language sql volatile set search_path='' as $$
 select e.id,w.id,e.fixture_event_key,f.family,
 case when private.is_rolling_week(w.id) then e.entry_cutoff_at else w.common_lock_at end
 from private.sports_events e join private.season_weeks w on w.id=e.week_id
 join private.seasons s on s.id=w.season_id
 cross join lateral (select 'MAIN'::text family union select case m.statistic when 'PASSING_YARDS' then 'player_pass_yds'
 when 'RUSHING_YARDS' then 'player_rush_yds' when 'RECEIVING_YARDS' then 'player_reception_yds' end
 from private.week_player_menu m where m.event_id=e.id and m.subject_id is not null
 and private.prop_snapshot_allowed(e.id,m.subject_id,m.statistic,m.period)) f
 where s.mode='LIVE' and s.lifecycle in ('REGULAR','PLAYOFFS','CHAMPION_FINAL','WEEK_18_EXHIBITION','ROSTER_LOCKED')
 and w.state in ('OPEN','LOCKED','PROVISIONAL') and private.event_accepts_entries(e.id)
 and not exists(select 1 from private.owner_rehearsals x where x.league_id=s.league_id)
 and exists(select 1 from private.slate_items i where i.event_id=e.id and private.is_effective_slate_item(i.id));
$$;
create function private.background_quote_interval(p_family text,p_cutoff timestamptz,p_now timestamptz)
returns interval language sql immutable set search_path='' as $$
 select case when p_family='MAIN' then case when p_cutoff<=p_now+interval '6 hours' then interval '15 minutes' else interval '1 hour' end
 else case when p_cutoff<=p_now+interval '24 hours' then interval '1 hour' else interval '6 hours' end end;
$$;

-- Published coverage plus the stored, consented future schedule for planning ONLY.
-- Future prop families are an upper bound, not authority to publish identities.
create function private.background_quote_forecast_scope(p_now timestamptz,p_reset timestamptz)
returns table(external_event_id text,family text,opens_at timestamptz,cutoff timestamptz)
language sql volatile set search_path='' as $$
 select b.external_event_id,b.family,p_now,max(b.cutoff) from private.background_quote_targets() b group by 1,2
 union all
 select 'forecast:'||(g->>'gameId'),f.family,greatest(p_now,private.automation_open_time(a.season_id,(g->>'week')::integer)),(g->>'scheduledStartAt')::timestamptz
 from private.season_automation a cross join lateral jsonb_array_elements(a.schedule) g
 cross join (values('MAIN'),('player_pass_yds'),('player_rush_yds'),('player_reception_yds')) f(family)
 where a.enabled and not a.revoked and (g->>'scheduledStartAt')::timestamptz>p_now
 and private.automation_open_time(a.season_id,(g->>'week')::integer)<p_reset
 and (g->>'week')::integer>coalesce((select max(w.nfl_week) from private.season_weeks w where w.season_id=a.season_id and w.state<>'PLANNED'),0)
 and exists(select 1 from jsonb_array_elements(private.automation_expected_games(a.season_id,(g->>'week')::integer)) expected where expected->>'gameId'=g->>'gameId');
$$;

-- Re-evaluate on the first claim each UTC day. Conservative remaining public
-- coverage estimate; demand/result headroom is additional to the provider floor.
create function private.evaluate_background_quote_budget() returns jsonb
language plpgsql set search_path='' as $$
declare p private.odds_refresh_policy%rowtype;s private.background_quote_settings%rowtype;
 t timestamptz:=clock_timestamp(); days_left numeric; estimate numeric; available numeric; essential numeric; scale integer;
begin
 select * into strict p from private.odds_refresh_policy;
 select * into strict s from private.background_quote_settings for update;
 if (s.forecast_at at time zone 'UTC')::date=(t at time zone 'UTC')::date and s.forecast is not null then return s.forecast;end if;
 days_left:=greatest(1,extract(epoch from (p.next_quota_reset_at-t))/86400);
 -- Deduplicate across leagues. Clip all work at the actual provider reset.
 with scope as (select external_event_id,family,min(opens_at) opens_at,least(max(cutoff),p.next_quota_reset_at) ends_at,max(cutoff) cutoff
 from private.background_quote_forecast_scope(t,p.next_quota_reset_at) group by 1,2)
 select coalesce(sum(1+ceil(greatest(0,extract(epoch from least(ends_at,cutoff-interval '24 hours')-opens_at))/21600)
 +ceil(greatest(0,extract(epoch from ends_at-greatest(opens_at,cutoff-interval '24 hours')))/3600)),0)
 into estimate from scope where family<>'MAIN' and ends_at>opens_at;
 -- Bulk MAIN, including the faster windows and partial cycles. A new batch
 -- boundary adds one conservative request rather than undercounting its start.
 with scope as materialized (select external_event_id,min(opens_at) opens_at,max(cutoff) cutoff
 from private.background_quote_forecast_scope(t,p.next_quota_reset_at) where family='MAIN' group by 1), ticks as (
 select tick from generate_series(date_trunc('hour',t),p.next_quota_reset_at,interval '15 minutes') tick)
 select estimate+3*(count(*)+1) into estimate from ticks
 where tick>=t and tick<p.next_quota_reset_at and exists(select 1 from scope b where b.opens_at<=tick and b.cutoff>tick)
 and (extract(minute from tick)=0 or exists(select 1 from scope b where b.opens_at<=tick and b.cutoff>tick and b.cutoff<=tick+interval '6 hours'));
 essential:=greatest(2000,ceil(days_left*greatest(150,case when p.usage_day=(t at time zone 'UTC')::date then p.daily_credits else 0 end,
 coalesce((select sum(greatest(reserved_cost,coalesce(charged_cost,0))) / 7.0 from private.shared_quote_requests
 where purpose='DEMAND' and attempted_at>t-interval '7 days'),0))));
 available:=greatest(0,least(coalesce(p.requests_remaining,0)-s.provider_reserve-essential,
 s.monthly_limit-case when p.usage_month=date_trunc('month',t at time zone 'UTC')::date then p.background_monthly_credits else 0 end,
 p.monthly_credit_limit-case when p.usage_month=date_trunc('month',t at time zone 'UTC')::date then p.monthly_credits else 0 end-essential));
 scale:=least(24,greatest(1,ceil(estimate/greatest(1,available))::integer));
 update private.background_quote_settings set forecast_at=t,cadence_multiplier=scale,
 forecast=jsonb_build_object('checkedAt',t,'resetAt',p.next_quota_reset_at,'remaining',p.requests_remaining,
 'scheduledEstimate',estimate,'essentialHeadroom',essential,'backgroundAllowance',available,'cadenceMultiplier',scale)
 where singleton returning forecast into s.forecast;
 return s.forecast;
end $$;

-- Extra purpose ceiling includes MAIN. The legacy prop counters are optional
-- consumption for reserve purposes; background counters independently identify it.
create function private.reserve_background_quote_credits(p_cost integer) returns void
language plpgsql set search_path='' as $$
declare p private.odds_refresh_policy%rowtype;s private.background_quote_settings%rowtype;t timestamptz:=clock_timestamp();d integer;m integer;
begin
 select * into strict p from private.odds_refresh_policy for update;
 select * into strict s from private.background_quote_settings for share;
 if not s.enabled or not p.enabled then raise exception 'QUOTE_REFRESH_DISABLED';end if;
 if coalesce(p.provider_entitlement_credits,0)<20000 or p.next_quota_reset_at is null or p.next_quota_reset_at<=t
 or not exists(select 1 from private.odds_entitlement_probes where state='SUCCEEDED' and completed_at>t-interval '26 hours')
 then raise exception 'QUOTE_ENTITLEMENT_STALE';end if;
 d:=case when p.usage_day=(t at time zone 'UTC')::date then p.background_daily_credits else 0 end;
 m:=case when p.usage_month=date_trunc('month',t at time zone 'UTC')::date then p.background_monthly_credits else 0 end;
 if d+p_cost>s.daily_limit or m+p_cost>s.monthly_limit or p.requests_remaining is null
 or p.requests_remaining-p_cost<s.provider_reserve+coalesce((s.forecast->>'essentialHeadroom')::integer,2000)
 or coalesce((s.forecast->>'backgroundAllowance')::numeric,0)<=0
 then raise exception 'QUOTE_REFRESH_BUDGET';end if;
 perform private.reserve_selective_quote_credits(p_cost,true);
 update private.odds_refresh_policy set background_daily_credits=d+p_cost,background_monthly_credits=m+p_cost where singleton;
end $$;

-- Every legacy UTC reset also resets the new purpose counters. Never touch
-- provider-cycle evidence when the application calendar changes.
do $$ declare d text;begin
 d:=pg_get_functiondef('private.reserve_selective_quote_credits(integer,boolean)'::regprocedure);
 d:=replace(d,'usage_day=d,usage_month=m,','background_daily_credits=case when usage_day<>d then 0 else background_daily_credits end,
  background_monthly_credits=case when usage_month<>m then 0 else background_monthly_credits end,usage_day=d,usage_month=m,');
 execute d;
 d:=pg_get_functiondef('api.claim_live_quote_refresh(uuid)'::regprocedure);
 d:=replace(d,'usage_day = (v_now at time zone ''UTC'')::date,',
 'background_daily_credits=case when usage_day<>(v_now at time zone ''UTC'')::date then 0 else background_daily_credits end,
 background_monthly_credits=case when usage_month<>date_trunc(''month'',v_now at time zone ''UTC'')::date then 0 else background_monthly_credits end,
 usage_day = (v_now at time zone ''UTC'')::date,');execute d;
end $$;

create function private.apply_shared_quote_events(p_week_id uuid,p_event_id uuid,p_request_ids uuid[],p_strict boolean,p_families text[] default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w private.season_weeks%rowtype;
 r private.shared_quote_requests%rowtype; e private.sports_events%rowtype; src jsonb; m jsonb;
 subject uuid; label text; team text; mapped integer; snapshot_id uuid; snapshot_hash text; v_slate_id uuid;
 current private.market_snapshots%rowtype; t timestamptz; n integer:=0; imported_subjects uuid[];
begin
 perform 1 from private.seasons s join private.season_weeks sw on sw.season_id=s.id where sw.id=p_week_id and s.mode='LIVE' for update of s;
 select * into strict w from private.season_weeks where id=p_week_id for update;
 t:=clock_timestamp();
 if t>=private.week_entry_closes_at(w.id) then raise exception 'QUOTE_REFRESH_LEASE_INVALID'; end if;
 if exists(select 1 from unnest(p_request_ids) requested_id(id) left join private.shared_quote_requests req on req.id=requested_id.id
  where req.state is distinct from 'SUCCEEDED' or (p_strict and req.fetched_at<t-interval '120 seconds') or req.fetched_at>t) then raise exception 'QUOTE_SOURCE_STALE'; end if;
 perform 1 from private.shared_quote_coverage cov where exists(select 1 from private.shared_quote_requests req where req.id=any(p_request_ids) and cov.external_event_id=any(req.event_ids) and cov.family=any(req.families)) order by cov.external_event_id,cov.family for share;
 t:=clock_timestamp();
 if p_strict and exists(select 1 from private.shared_quote_requests where id=any(p_request_ids) and fetched_at<t-interval '120 seconds') then raise exception 'QUOTE_SOURCE_STALE';end if;
 select sl.id into strict v_slate_id from private.slates sl where sl.week_id=w.id
  and exists(select 1 from private.slate_items i where i.slate_id=sl.id and private.is_effective_slate_item(i.id)) order by sl.version desc limit 1;
 for r in select req.* from private.shared_quote_requests req where req.id=any(p_request_ids) order by req.fetched_at,req.id loop
  for src in select value from jsonb_array_elements(r.payload->'events') loop
   select ev.* into e from private.sports_events ev where ev.week_id=w.id and ev.fixture_event_key=src->>'externalEventId' and (p_event_id is null or ev.id=p_event_id) for update;
   if e.id is null then continue; end if; -- A cached public bulk response may also contain other leagues' published games.
   if e.away_team<>src->>'awayTeam' or e.home_team<>src->>'homeTeam' or e.scheduled_start_at<>(src->>'scheduledStartAt')::timestamptz then raise exception 'EVENT_IDENTITY_CHANGED'; end if;
   if not private.event_accepts_entries(e.id) then continue; end if;
   for m in select value from jsonb_array_elements(src->'markets') value where p_families is null or (case when r.kind='MAIN' then 'MAIN' else case value->>'statistic' when 'PASSING_YARDS' then 'player_pass_yds' when 'RUSHING_YARDS' then 'player_rush_yds' when 'RECEIVING_YARDS' then 'player_reception_yds' end end)=any(p_families) loop
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
    if exists(select 1 from private.live_quote_heads h join private.shared_quote_requests newer on newer.id=h.verified_request_id where h.market_snapshot_id=current.id and newer.fetched_at>r.fetched_at) then continue;end if;
    if current.id is not null and current.observed_at>(m->>'observedAt')::timestamptz then continue; end if;
    if (m->>'observedAt')::timestamptz<(case when p_strict then t else r.fetched_at end)-interval '10 minutes' then raise exception 'QUOTE_SOURCE_STALE'; end if;
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
     and (p_families is null or (case h.statistic when 'PASSING_YARDS' then 'player_pass_yds' when 'RUSHING_YARDS' then 'player_rush_yds' when 'RECEIVING_YARDS' then 'player_reception_yds' end)=any(p_families))
     and (case h.statistic when 'PASSING_YARDS' then 'player_pass_yds' when 'RUSHING_YARDS' then 'player_rush_yds' when 'RECEIVING_YARDS' then 'player_reception_yds' end)=any(r.families)
     and not exists(select 1 from private.shared_quote_coverage cov join private.shared_quote_requests newer on newer.id=cov.latest_successful_request_id where cov.external_event_id=e.fixture_event_key and cov.family=case h.statistic when 'PASSING_YARDS' then 'player_pass_yds' when 'RUSHING_YARDS' then 'player_rush_yds' when 'RECEIVING_YARDS' then 'player_reception_yds' end and newer.id<>r.id and newer.fetched_at>=r.fetched_at)
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

create or replace function api.apply_live_quote_plan(p_plan_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=(select auth.uid());p private.member_quote_plans%rowtype;result jsonb;
begin
 select * into p from private.member_quote_plans where id=p_plan_id and actor_user_id=u;
 if u is null or p.id is null or not exists(select 1 from private.league_memberships m join private.season_weeks w on w.league_id=m.league_id where w.id=p.week_id and m.user_id=u)
 then raise exception using errcode='42501',message='League membership required.';end if;
 if p.expires_at<=clock_timestamp() then raise exception 'QUOTE_REFRESH_LEASE_INVALID';end if;
 result:=private.apply_shared_quote_events(p.week_id,null,p.request_ids,true);
 if p.expires_at<=clock_timestamp() then raise exception 'QUOTE_REFRESH_LEASE_INVALID';end if;
 return result;
end $$;

create function private.assert_background_quote_run(p_run_id uuid)
returns private.background_quote_runs language plpgsql set search_path='' as $$
declare r private.background_quote_runs%rowtype;s private.background_quote_settings%rowtype;
begin
 select * into strict s from private.background_quote_settings for share;
 select * into r from private.background_quote_runs where id=p_run_id;
 if r.id is null or not s.enabled or s.release_sha is null or r.revision<>s.revision
 or r.expires_at<=clock_timestamp() or r.finished_at is not null then raise exception 'QUOTE_WORKER_CLAIM_INVALID';end if;
 return r;
end $$;
create function private.background_quote_due()
returns table(external_event_id text,family text,cutoff timestamptz,fetch_due boolean,application_due boolean)
language sql volatile set search_path='' as $$
 with targets as (select * from private.background_quote_targets()),coverage as (
 select q.external_event_id,q.family,min(q.cutoff) cutoff,
 bool_or(a.request_id is distinct from c.latest_successful_request_id and r.state='SUCCEEDED'
 and (a.retry_at is null or a.retry_at<=clock_timestamp())) application_due,
 r.fetched_at,c.background_retry_at
 from targets q left join private.shared_quote_coverage c using(external_event_id,family)
 left join private.shared_quote_requests r on r.id=c.latest_successful_request_id
 left join private.background_quote_applications a on a.event_id=q.event_id and a.family=q.family
 group by q.external_event_id,q.family,r.fetched_at,c.background_retry_at)
 select c.external_event_id,c.family,c.cutoff,
 (c.fetched_at is null or c.fetched_at+private.background_quote_interval(c.family,
 case when c.family='MAIN' then (select min(z.cutoff) from coverage z where z.family='MAIN') else c.cutoff end,
 clock_timestamp())*s.cadence_multiplier<=clock_timestamp())
 and (c.background_retry_at is null or c.background_retry_at<=clock_timestamp())
 and (s.backoff_until is null or s.backoff_until<=clock_timestamp()),coalesce(c.application_due,false)
 from coverage c cross join private.background_quote_settings s;
$$;
create function api.claim_background_quote_run() returns jsonb
language plpgsql security definer set search_path='' as $$
declare s private.background_quote_settings%rowtype;scope jsonb;run_id uuid;t timestamptz:=clock_timestamp();
begin
 perform 1 from private.odds_refresh_policy where enabled for update;
 if not found then return jsonb_build_object('status','DISABLED');end if;
 select * into strict s from private.background_quote_settings for update;
 if not s.enabled or s.release_sha is null then return jsonb_build_object('status','DISABLED');end if;
 if exists(select 1 from private.background_quote_runs where finished_at is null and expires_at>t)
 then return jsonb_build_object('status','IDLE');end if;
 perform private.evaluate_background_quote_budget();
 -- A dead worker retains its reservation and gets bounded failure scheduling.
 update private.shared_quote_requests set state='FAILED' where purpose='BACKGROUND' and state='RUNNING' and expires_at<=t;
 update private.shared_quote_coverage c set background_attempts=least(4,c.background_attempts+1),background_last_failure_id=r.id,
 background_retry_at=t+case c.background_attempts when 0 then interval '5 minutes' when 1 then interval '15 minutes' when 2 then interval '60 minutes' else interval '6 hours' end
 from private.shared_quote_requests r where r.id=c.request_id and r.purpose='BACKGROUND' and r.state='FAILED' and c.background_last_failure_id is distinct from r.id;
 select jsonb_agg(jsonb_build_object('externalEventId',q.external_event_id,'family',q.family)) into scope
 from (select * from private.background_quote_due() where fetch_due or application_due order by application_due desc,cutoff,external_event_id,family limit 128) q;
 if scope is null then return jsonb_build_object('status','IDLE');end if;
 insert into private.background_quote_runs(revision,coverage) values(s.revision,scope) returning id into run_id;
 return jsonb_build_object('status','CLAIMED','runId',run_id);
end $$;
create function api.claim_background_quote_request(p_run_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.background_quote_runs%rowtype;r private.shared_quote_requests%rowtype;d record;
 events text[];families text[];delay integer;t timestamptz;cost integer;
begin
 perform 1 from private.odds_refresh_policy for update;
 run:=private.assert_background_quote_run(p_run_id);t:=clock_timestamp();
 if t>run.expires_at-interval '12 seconds' or cardinality(run.request_ids)>=8 then return jsonb_build_object('status','IDLE');end if;
 select greatest(0,ceil(extract(epoch from next_request_at-t)*1000))::integer into delay from private.odds_refresh_policy;
 if delay>0 then return jsonb_build_object('status','WAIT','retryAfterMs',least(3000,delay));end if;
 select due.* into d from private.background_quote_due() due
 where due.fetch_due and exists(select 1 from jsonb_array_elements(run.coverage) c where c->>'externalEventId'=due.external_event_id and c->>'family'=due.family)
 and not exists(select 1 from private.shared_quote_coverage c join private.shared_quote_requests q on q.id=c.request_id
 where c.external_event_id=due.external_event_id and c.family=due.family and ((q.state='RUNNING' and q.expires_at>t) or q.id=any(run.request_ids)))
 order by due.cutoff,due.external_event_id,due.family limit 1;
 if not found then return jsonb_build_object('status','IDLE');end if;
 -- Join a member's pending request only when its whole scope is claimed here.
 select q.* into r from private.shared_quote_coverage c join private.shared_quote_requests q on q.id=c.request_id
 where c.external_event_id=d.external_event_id and c.family=d.family and q.state='PLANNED' and q.created_at>t-interval '90 seconds'
 and not exists(select 1 from unnest(q.event_ids) e cross join unnest(q.families) f
 where not exists(select 1 from jsonb_array_elements(run.coverage) v where v->>'externalEventId'=e and v->>'family'=f)
 or not exists(select 1 from private.background_quote_targets() b where b.external_event_id=e and b.family=f));
 if r.id is null then
  if d.family='MAIN' then
   select array_agg(x.external_event_id order by x.external_event_id) into events from
   (select due.external_event_id from private.background_quote_due() due where due.family='MAIN' and due.fetch_due
   and exists(select 1 from jsonb_array_elements(run.coverage) c where c->>'externalEventId'=due.external_event_id and c->>'family'='MAIN')
   and not exists(select 1 from private.shared_quote_coverage c join private.shared_quote_requests q on q.id=c.request_id
    where c.external_event_id=due.external_event_id and c.family='MAIN' and ((q.state='RUNNING' and q.expires_at>t) or (q.state='PLANNED' and q.created_at>t-interval '90 seconds')))
   order by due.cutoff,due.external_event_id limit 32) x;families:=array['MAIN'];
  else
   events:=array[d.external_event_id];
   select array_agg(due.family order by due.family) into families from private.background_quote_due() due
   where due.external_event_id=d.external_event_id and due.family<>'MAIN' and due.fetch_due
   and exists(select 1 from jsonb_array_elements(run.coverage) c where c->>'externalEventId'=due.external_event_id and c->>'family'=due.family)
   and not exists(select 1 from private.shared_quote_coverage c join private.shared_quote_requests q on q.id=c.request_id
    where c.external_event_id=due.external_event_id and c.family=due.family and ((q.state='RUNNING' and q.expires_at>t) or (q.state='PLANNED' and q.created_at>t-interval '90 seconds')));
  end if;
  if events is null or families is null then return jsonb_build_object('status','IDLE');end if;
 else events:=r.event_ids;families:=r.families;end if;
 cost:=case when d.family='MAIN' then 3 else cardinality(families) end;
 begin perform private.reserve_background_quote_credits(cost);
 exception when raise_exception then
  if sqlerrm in ('QUOTE_REFRESH_BUDGET','QUOTE_ENTITLEMENT_STALE','QUOTE_REFRESH_COOLDOWN','QUOTE_REFRESH_DISABLED') then
   return jsonb_build_object('status','DEFERRED');else raise;end if;
 end;
 if r.id is null then
  insert into private.shared_quote_requests(kind,event_ids,families,purpose) values(case when d.family='MAIN' then 'MAIN' else 'PROPS' end,events,families,'BACKGROUND') returning * into r;
  insert into private.shared_quote_coverage(external_event_id,family,request_id)
  select e,f,r.id from unnest(events) e cross join unnest(families) f
  on conflict(external_event_id,family) do update set request_id=excluded.request_id;
 end if;
 update private.shared_quote_requests set purpose='BACKGROUND',state='RUNNING',attempted_at=t,expires_at=t+interval '25 seconds',reserved_cost=cost where id=r.id;
 update private.background_quote_runs set request_ids=array_append(request_ids,r.id) where id=run.id;
 return jsonb_build_object('status','CLAIMED','requestId',r.id,'kind',r.kind,'eventIds',events,'families',families);
end $$;

-- Preserve existing completion validation/accounting, including unknown charges.
-- This also accounts a background request completed by a joining demand path.
do $$ declare d text;begin
 d:=pg_get_functiondef('api.complete_shared_quote_request(uuid,jsonb,jsonb)'::regprocedure);
 d:=replace(d,'case when r.kind=''PROPS'' then extra else 0 end', 'case when r.kind=''PROPS'' or r.purpose=''BACKGROUND'' then extra else 0 end');
 d:=replace(d,' if r.state=''SUCCEEDED'' then',
 ' if r.purpose=''BACKGROUND'' and not exists(select 1 from private.background_quote_runs run cross join private.background_quote_settings settings where r.id=any(run.request_ids) and run.expires_at>t and run.finished_at is null and settings.enabled and settings.revision=run.revision) then p_import:=null;end if;
 if r.state=''SUCCEEDED'' then');
 d:=replace(d,'daily_credits=daily_credits+extra,monthly_credits=monthly_credits+extra,',
 'daily_credits=daily_credits+extra,monthly_credits=monthly_credits+extra,
 background_daily_credits=background_daily_credits+case when r.purpose=''BACKGROUND'' then extra else 0 end,
 background_monthly_credits=background_monthly_credits+case when r.purpose=''BACKGROUND'' then extra else 0 end,');
 execute d;
end $$;
create function api.complete_background_quote_request(p_run_id uuid,p_request_id uuid,p_import jsonb,p_usage jsonb default '{}',p_failure text default null,p_retry_after_seconds integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare run private.background_quote_runs%rowtype;r private.shared_quote_requests%rowtype;result jsonb;s private.background_quote_settings%rowtype;t timestamptz:=clock_timestamp();valid boolean;
begin
 perform 1 from private.odds_refresh_policy for update;
 select * into strict s from private.background_quote_settings for share;
 select * into run from private.background_quote_runs where id=p_run_id;
 if run.id is null or not p_request_id=any(run.request_ids) then raise exception 'QUOTE_WORKER_CLAIM_INVALID';end if;
 select * into strict r from private.shared_quote_requests where id=p_request_id;
 valid:=s.enabled and s.revision=run.revision and run.expires_at>t and run.finished_at is null;
 result:=api.complete_shared_quote_request(p_request_id,case when valid then p_import else null end,p_usage);
 if result->>'status'='SUCCEEDED' then
  update private.shared_quote_coverage set background_attempts=0,background_retry_at=null,background_last_failure_id=null where external_event_id=any(r.event_ids) and family=any(r.families);
 else
  update private.shared_quote_coverage c set background_attempts=least(4,c.background_attempts+1),background_last_failure_id=r.id,
   background_retry_at=t+case c.background_attempts when 0 then interval '5 minutes' when 1 then interval '15 minutes' when 2 then interval '60 minutes'
   else private.background_quote_interval(c.family,(select min(b.cutoff) from private.background_quote_targets() b where b.external_event_id=c.external_event_id),t) end
   where c.external_event_id=any(r.event_ids) and c.family=any(r.families) and c.background_last_failure_id is distinct from r.id;
  if p_failure in ('SOURCE','QUOTA','RATE_LIMIT') then
   update private.background_quote_settings set backoff_until=greatest(backoff_until,t+make_interval(secs=>greatest(300,least(86400,coalesce(p_retry_after_seconds,300))))) where singleton;
  end if;
 end if;
 return result;
end $$;

create function api.next_background_quote_application(p_run_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.background_quote_runs%rowtype;b record;ids uuid[];
begin
 run:=private.assert_background_quote_run(p_run_id);
 select target.event_id,target.week_id into b from private.background_quote_targets() target
 join private.shared_quote_coverage c using(external_event_id,family)
 join private.shared_quote_requests r on r.id=c.latest_successful_request_id and r.state='SUCCEEDED'
 left join private.background_quote_applications a on a.event_id=target.event_id and a.family=target.family
 where a.request_id is distinct from r.id and (a.retry_at is null or a.retry_at<=clock_timestamp())
 and exists(select 1 from jsonb_array_elements(run.coverage) v where v->>'externalEventId'=target.external_event_id and v->>'family'=target.family)
 order by a.attempted_at nulls first,target.cutoff,target.event_id limit 1;
 if not found then return jsonb_build_object('status','IDLE');end if;
 select array_agg(distinct c.latest_successful_request_id) into ids from private.background_quote_targets() target
 join private.shared_quote_coverage c using(external_event_id,family)
 join private.shared_quote_requests r on r.id=c.latest_successful_request_id and r.state='SUCCEEDED'
 where target.event_id=b.event_id and exists(select 1 from jsonb_array_elements(run.coverage) v where v->>'externalEventId'=target.external_event_id and v->>'family'=target.family);
 return jsonb_build_object('status','READY','eventId',b.event_id,'requestIds',ids);
end $$;
create function api.apply_background_quote_event(p_run_id uuid,p_event_id uuid,p_request_ids uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.background_quote_runs%rowtype;e private.sports_events%rowtype;result jsonb;f record;failure text;t timestamptz;allowed text[];
begin
 run:=private.assert_background_quote_run(p_run_id);
 select * into strict e from private.sports_events where id=p_event_id;
 if p_request_ids is null or cardinality(p_request_ids) not between 1 and 4 or not exists(select 1 from private.background_quote_targets() b where b.event_id=e.id)
 or exists(select 1 from unnest(p_request_ids) req left join private.shared_quote_requests r on r.id=req
 where r.state is distinct from 'SUCCEEDED' or not e.fixture_event_key=any(r.event_ids)
 or not exists(select 1 from jsonb_array_elements(run.coverage) c where c->>'externalEventId'=e.fixture_event_key and c->>'family'=any(r.families)))
 then raise exception 'QUOTE_WORKER_SCOPE_INVALID';end if;
 begin
  -- Same season/week/event/coverage authority as the member path. Validate
  -- supported bound rules without changing the binding or manufacturing actors.
  perform private.season_card_rules(w.ruleset_snapshot_id,'LIVE') from private.season_weeks w where w.id=e.week_id;
  select array_agg(c->>'family') into allowed from jsonb_array_elements(run.coverage) c where c->>'externalEventId'=e.fixture_event_key;
  result:=private.apply_shared_quote_events(e.week_id,e.id,p_request_ids,false,allowed);
  perform private.assert_background_quote_run(p_run_id);
  if not exists(select 1 from private.background_quote_targets() b where b.event_id=e.id) then raise exception 'QUOTE_WORKER_SCOPE_INVALID';end if;
 exception when others then failure:=case when sqlerrm in ('QUOTE_SOURCE_STALE','EVENT_IDENTITY_CHANGED','QUOTE_WORKER_CLAIM_INVALID','QUOTE_WORKER_SCOPE_INVALID','QUOTE_REFRESH_LEASE_INVALID') then sqlerrm else sqlstate end;result:=jsonb_build_object('status','FAILED');end;
 t:=clock_timestamp();
 for f in select c.family,c.latest_successful_request_id request_id from private.shared_quote_coverage c
 where c.external_event_id=e.fixture_event_key and c.latest_successful_request_id=any(p_request_ids)
 and exists(select 1 from jsonb_array_elements(run.coverage) v where v->>'externalEventId'=e.fixture_event_key and v->>'family'=c.family) loop
 insert into private.background_quote_applications(event_id,family,request_id,applied_at,attempted_at,retry_at,failure_code)
 values(e.id,f.family,case when failure is null then f.request_id end,case when failure is null then t end,t,case when failure is not null then t+interval '5 minutes' end,failure)
 on conflict(event_id,family) do update set request_id=case when failure is null then excluded.request_id else private.background_quote_applications.request_id end,
 applied_at=case when failure is null then t else private.background_quote_applications.applied_at end,attempted_at=t,retry_at=excluded.retry_at,failure_code=failure;
 end loop;
 return result;
end $$;
create function api.finish_background_quote_run(p_run_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin perform private.assert_background_quote_run(p_run_id);update private.background_quote_runs set finished_at=clock_timestamp() where id=p_run_id;end $$;

-- Read only the authorized current board; never provider cache or member cards.
create function api.get_stored_quote_updates(p_league_slug text,p_week_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=(select auth.uid());w private.season_weeks%rowtype;heads jsonb;events jsonb;menu jsonb;
begin
 select sw.* into w from private.season_weeks sw join private.seasons s on s.id=sw.season_id join private.leagues l on l.id=s.league_id
 where l.slug=p_league_slug and s.mode='LIVE' and sw.id=p_week_id
 and not exists(select 1 from private.owner_rehearsals x where x.league_id=l.id);
 if u is null or w.id is null or not private.is_league_member(w.league_id) then raise exception using errcode='42501',message='League membership required.';end if;
 if w.id is distinct from (select sw.id from private.season_weeks sw join private.seasons s on s.id=sw.season_id where s.league_id=w.league_id order by s.created_at desc,sw.nfl_week desc limit 1)
 or w.state in ('PLANNED','FINAL') then return jsonb_build_object('status','STOP');end if;
 heads:=api.get_live_quote_heads(p_league_slug);
 if private.player_prop_offers_enabled(w.id) then menu:=api.get_player_prop_menu(p_league_slug);end if;
 select coalesce(jsonb_agg(jsonb_build_object('eventId',e.id,'entryOpen',private.event_accepts_entries(e.id),
 'entryClosesAt',case when private.is_rolling_week(w.id) then e.entry_cutoff_at else w.common_lock_at end,
 'freshness',coalesce((select jsonb_agg(jsonb_build_object('family',f.family,'readAt',clock_timestamp(),'checkedAt',f.checked_at,'observedAt',f.observed_at,
 'delayed',coalesce(f.checked_at+private.background_quote_interval(f.family,e.entry_cutoff_at,clock_timestamp())+interval '5 minutes'<clock_timestamp(),true)))
 from (select families.family,coalesce(evidence.checked_at,applied.fetched_at) checked_at,evidence.observed_at
 from (select 'MAIN'::text family union select case m.statistic when 'PASSING_YARDS' then 'player_pass_yds' when 'RUSHING_YARDS' then 'player_rush_yds' when 'RECEIVING_YARDS' then 'player_reception_yds' end
 from private.week_player_menu m where m.event_id=e.id and m.subject_id is not null) families
 left join lateral (select min(coalesce(r.fetched_at,i.fetched_at)) checked_at,min(m.observed_at) observed_at
 from private.live_quote_heads h join private.market_snapshots m on m.id=h.market_snapshot_id
 left join private.shared_quote_requests r on r.id=h.verified_request_id and r.state='SUCCEEDED'
 left join private.live_odds_imports i on i.id=h.verified_import_id
 where h.event_id=e.id and (case when h.subject_id is null then 'MAIN' else case h.statistic when 'PASSING_YARDS' then 'player_pass_yds' when 'RUSHING_YARDS' then 'player_rush_yds' when 'RECEIVING_YARDS' then 'player_reception_yds' end end)=families.family) evidence on true
 left join private.background_quote_applications a on a.event_id=e.id and a.family=families.family
 left join private.shared_quote_requests applied on applied.id=a.request_id and applied.state='SUCCEEDED') f),'[]'::jsonb)) order by e.scheduled_start_at,e.id),'[]'::jsonb)
 into events from private.sports_events e where e.week_id=w.id;
 return jsonb_build_object('status','READY','weekId',w.id,'pollingEnabled',(select polling_enabled from private.background_quote_settings),
 'quotes',heads,'events',events,'slots',coalesce((select jsonb_agg(slot-'candidates') from jsonb_array_elements(menu->'slots') slot),'[]'::jsonb),
 'hasOpenEvents',exists(select 1 from private.sports_events e where e.week_id=w.id and private.event_accepts_entries(e.id)));
end $$;

create function private.dispatch_background_quotes() returns bigint
language plpgsql security definer set search_path='' as $$
declare secret text;target text;request_id bigint;
begin
 if not exists(select 1 from private.background_quote_settings where enabled and release_sha is not null)
 or exists(select 1 from private.background_quote_runs where finished_at is null and expires_at>clock_timestamp())
 or not exists(select 1 from private.background_quote_due() where fetch_due or application_due) then return null;end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='score_job_secret';
 select decrypted_secret into target from vault.decrypted_secrets where name='score_job_url';
 if target is distinct from 'https://www.ledgerleagues.com/api/operations/scores' or coalesce(length(secret),0)<32 then raise exception 'Quote dispatcher configuration unavailable';end if;
 select net.http_post(url:='https://www.ledgerleagues.com/api/operations/quotes',headers:=jsonb_build_object('Authorization','Bearer '||secret,'Content-Type','application/json'),body:='{}',timeout_milliseconds:=55000) into request_id;
 return request_id;
end $$;
create function private.attach_background_quotes_dispatch_hook() returns boolean
language plpgsql set search_path='' as $$
declare d text;anchor text:=E'begin
';pos integer;
begin
 d:=pg_get_functiondef('private.dispatch_score_checkpoints()'::regprocedure);
 if strpos(d,'perform private.dispatch_background_quotes();')>0 then return false;end if;
 pos:=strpos(d,anchor);if pos=0 then raise exception 'Score dispatcher baseline changed';end if;
 execute overlay(d placing anchor||E'  begin
    perform private.dispatch_background_quotes();
  exception when others then
    raise warning ''Quote dispatch unavailable (%).'',SQLSTATE;
  end;
' from pos for length(anchor));return true;
end $$;
select private.attach_background_quotes_dispatch_hook();

-- Explicit grants: a service key must still present the issued, scoped claim.
do $$ declare f record;begin
 for f in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='private' and (p.proname like '%background_quote%' or p.proname='apply_shared_quote_events'))
 or (n.nspname='api' and (p.proname like '%background_quote%' or p.proname='get_stored_quote_updates')) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 if f.nspname='api' then execute format('grant execute on function %s to %I',f.signature,case when f.proname='get_stored_quote_updates' then 'authenticated' else 'service_role' end);end if;
 end loop;
end $$;
