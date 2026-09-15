-- Public source acquisition is independent of offer/result activation. Defaults
-- remain disabled. Only an explicit commissioner operation queues a league job.
alter table private.player_prop_leagues add column catalog_enabled boolean not null default false;
alter table private.player_result_policy add column metadata_enabled boolean not null default false;
create table private.player_catalog_jobs (
 week_id uuid primary key references private.season_weeks(id),
 state text not null default 'PENDING' check(state in('PENDING','READY','UNAVAILABLE')),
 next_attempt_at timestamptz not null default clock_timestamp(),
 lease_id uuid,lease_until timestamptz,missing_sources integer not null default 0,
 last_error text,requested_at timestamptz not null default clock_timestamp(),
 completed_at timestamptz
);
create table private.player_catalog_sources (
 cache_key text primary key check(cache_key ~ '^(COVERAGE|GAMES|NFLVERSE):[0-9]{4}$|^ROSTER:[0-9]{4}:[0-9]+$'),
 payload jsonb,expires_at timestamptz,lease_id uuid,lease_until timestamptz,
 retry_at timestamptz not null default clock_timestamp(),updated_at timestamptz,
 check(payload is null or pg_column_size(payload)<=25000000)
);
alter table private.player_catalog_jobs enable row level security;
alter table private.player_catalog_sources enable row level security;
revoke all on private.player_catalog_jobs,private.player_catalog_sources from public,anon,authenticated;

create function private.player_catalog_complete(p_week_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from private.slate_items i where i.week_id=p_week_id and private.is_effective_slate_item(i.id))
 and not exists(select 1 from private.sports_events e
 cross join lateral unnest(array[e.away_team,e.home_team]) team
 cross join unnest(array['QB_PASS','RB_RUSH','RECEIVER']) slot
 where e.week_id=p_week_id and exists(select 1 from private.slate_items i where i.event_id=e.id and private.is_effective_slate_item(i.id))
 and not exists(select 1 from private.player_menu_candidates(e.id,team,slot)));
$$;
create function api.enqueue_player_catalog(p_league_slug text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l private.leagues%rowtype;s private.seasons%rowtype;w private.season_weeks%rowtype;
begin
 select * into strict l from private.leagues where slug=lower(p_league_slug);
 if (select auth.uid()) is null or not private.is_league_commissioner(l.id) then raise exception using errcode='42501',message='Commissioner access required.';end if;
 select * into strict s from private.seasons where league_id=l.id order by created_at desc limit 1;
 select * into strict w from private.season_weeks where season_id=s.id order by nfl_week desc limit 1;
 if private.player_catalog_complete(w.id) or exists(select 1 from private.week_player_menu where week_id=w.id and frozen_at is not null) then return jsonb_build_object('status','READY','missingSources',0);end if;
 if s.mode<>'LIVE' or not exists(select 1 from private.player_prop_leagues where league_id=l.id and season_id=s.id and catalog_enabled) or not exists(select 1 from private.player_result_policy where metadata_enabled) then return jsonb_build_object('status','DISABLED','missingSources',0);end if;
 if not exists(select 1 from private.slate_items i where i.week_id=w.id and private.is_effective_slate_item(i.id)) then return jsonb_build_object('status','UNAVAILABLE','missingSources',0);end if;
 insert into private.player_catalog_jobs(week_id) values(w.id) on conflict(week_id) do update set state='PENDING',completed_at=null;
 return jsonb_build_object('status','PENDING','weekId',w.id,'missingSources',0);
end; $$;
create function api.claim_player_catalog_job(p_week_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.player_catalog_jobs%rowtype;w private.season_weeks%rowtype;s private.seasons%rowtype;p private.player_result_policy%rowtype;lease uuid:=gen_random_uuid();events jsonb;
begin
 select * into strict p from private.player_result_policy where singleton;
 if not p.metadata_enabled then return jsonb_build_object('status','DISABLED');end if;
 select job.* into j from private.player_catalog_jobs job join private.season_weeks wk on wk.id=job.week_id
 join private.seasons se on se.id=wk.season_id join private.player_prop_leagues scope on scope.season_id=se.id and scope.league_id=se.league_id
 where job.state='PENDING' and scope.catalog_enabled and se.mode='LIVE' and job.next_attempt_at<=clock_timestamp()
 and (p_week_id is null or job.week_id=p_week_id) and (job.lease_until is null or job.lease_until<=clock_timestamp())
 order by job.requested_at,job.week_id limit 1 for update of job skip locked;
 if not found then return jsonb_build_object('status','IDLE');end if;
 select * into strict w from private.season_weeks where id=j.week_id;
 select * into strict s from private.seasons where id=w.season_id;
 if private.player_catalog_complete(w.id) or exists(select 1 from private.week_player_menu where week_id=w.id and frozen_at is not null) then
  update private.player_catalog_jobs set state='READY',completed_at=clock_timestamp(),lease_id=null,lease_until=null where week_id=j.week_id;
  return jsonb_build_object('status','READY');
 end if;
 select jsonb_agg(jsonb_build_object('externalEventId',e.fixture_event_key,'scheduledStartAt',e.scheduled_start_at,'awayTeam',e.away_team,'homeTeam',e.home_team) order by e.scheduled_start_at,e.id) into events
 from private.sports_events e where e.week_id=w.id and e.scheduled_start_at>clock_timestamp() and exists(select 1 from private.slate_items i where i.event_id=e.id and private.is_effective_slate_item(i.id));
 if events is null or jsonb_array_length(events)>16 then
  update private.player_catalog_jobs set state='UNAVAILABLE',last_error='NO_ELIGIBLE_FUTURE_EVENTS' where week_id=j.week_id;
  return jsonb_build_object('status','UNAVAILABLE');
 end if;
 update private.player_catalog_jobs set lease_id=lease,lease_until=clock_timestamp()+interval '5 minutes' where week_id=j.week_id;
 return jsonb_build_object('status','CLAIMED','leaseId',lease,'weekId',w.id,'season',s.nfl_year,'week',w.nfl_week,'events',events,'apiSportsContractValidated',p.api_sports_contract_validated,'nflverseContractValidated',p.nflverse_contract_validated,
 'verifiedAliases',coalesce((select jsonb_agg(jsonb_build_object('canonicalKey',v.canonical_key,'name',v.external_player_id)) from (select distinct subject.canonical_key,m.external_player_id from private.player_provider_mappings m join private.player_subjects subject on subject.id=m.subject_id where m.provider='THE_ODDS_API' and m.result_path_verified and m.verified_at<=clock_timestamp() order by subject.canonical_key,m.external_player_id limit 4000)v),'[]'::jsonb),
 'cachedSources',coalesce((select jsonb_object_agg(c.cache_key,c.payload) from private.player_catalog_sources c where c.expires_at>clock_timestamp() and split_part(c.cache_key,':',2)=s.nfl_year::text),'{}'::jsonb));
end; $$;
create function api.complete_player_catalog_job(p_lease_id uuid,p_status text,p_missing_sources integer default 0,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
declare wk uuid;
begin
 if p_lease_id is null or p_status not in('READY','PENDING','UNAVAILABLE') or p_status is null or p_missing_sources is null or p_missing_sources<0 or p_missing_sources>100 or char_length(p_error)>100 then raise exception using errcode='22023',message='Invalid catalog completion.';end if;
 update private.player_catalog_jobs set state=p_status,missing_sources=p_missing_sources,last_error=p_error,lease_id=null,lease_until=null,next_attempt_at=clock_timestamp()+interval '5 minutes',completed_at=case when p_status='READY' then clock_timestamp() else null end
 where lease_id=p_lease_id and lease_until>clock_timestamp() returning week_id into wk;
 if not found then raise exception using errcode='55000',message='Catalog lease expired.';end if;
 if p_status in('READY','UNAVAILABLE') and private.player_props_menu_eligible(wk) then perform private.prepare_player_menu(wk);end if;
end; $$;
create function api.claim_player_catalog_source(p_cache_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.player_catalog_sources%rowtype;lease uuid:=gen_random_uuid();
begin
 if not exists(select 1 from private.player_result_policy where metadata_enabled) then return jsonb_build_object('status','DISABLED');end if;
 if p_cache_key is null or p_cache_key !~ '^(COVERAGE|GAMES|NFLVERSE):[0-9]{4}$|^ROSTER:[0-9]{4}:[0-9]+$' then raise exception using errcode='22023',message='Invalid catalog source.';end if;
 insert into private.player_catalog_sources(cache_key) values(p_cache_key) on conflict do nothing;
 select * into strict c from private.player_catalog_sources where cache_key=p_cache_key for update;
 if c.payload is not null and c.expires_at>clock_timestamp() then return jsonb_build_object('status','CACHED','payload',c.payload);end if;
 if c.lease_until>clock_timestamp() or c.retry_at>clock_timestamp() then return jsonb_build_object('status','WAIT');end if;
 update private.player_catalog_sources set lease_id=lease,lease_until=clock_timestamp()+interval '90 seconds' where cache_key=p_cache_key;
 return jsonb_build_object('status','CLAIMED','leaseId',lease);
end; $$;
create function api.complete_player_catalog_source(p_cache_key text,p_lease_id uuid,p_payload jsonb default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_lease_id is null or (p_payload is not null and pg_column_size(p_payload)>25000000) then raise exception using errcode='22023',message='Invalid catalog source completion.';end if;
 update private.player_catalog_sources set payload=p_payload,expires_at=case when p_payload is not null then clock_timestamp()+case when p_cache_key like 'ROSTER:%' then interval '36 hours' else interval '12 hours' end else null end,
  lease_id=null,lease_until=null,retry_at=clock_timestamp()+interval '5 minutes',updated_at=clock_timestamp()
 where cache_key=p_cache_key and lease_id=p_lease_id and lease_until>clock_timestamp();
 if not found then raise exception using errcode='55000',message='Catalog source lease expired.';end if;
end; $$;
-- Keep the existing locked metadata20/day, total8/min, remaining-header ledger.
do $extend$
declare d text;
begin
 d:=pg_get_functiondef('api.reserve_player_metadata_request()'::regprocedure);
 if strpos(d,'not p.processing_enabled or')=0 then raise exception 'Metadata reservation guard changed';end if;
 d:=replace(d,'not p.processing_enabled or','not (p.processing_enabled or p.metadata_enabled) or');
 d:=replace(d,'select count(*) into n from private.player_result_requests where request_class=',
  'if p.processing_enabled and p.api_sports_contract_validated and exists(select 1 from private.player_result_jobs where state in(''WAITING'',''RUNNING'') and attempts<5 and next_attempt_at<=clock_timestamp() and (lease_until is null or lease_until<=clock_timestamp())) then raise exception using errcode=''55000'',message=''Accepted player results have priority.'';end if; select count(*) into n from private.player_result_requests where request_class=');
 execute d;
 d:=pg_get_functiondef('api.claim_player_statistics_status()'::regprocedure);
 d:=replace(d,'not p.processing_enabled or not p.api_sports_contract_validated','not p.metadata_enabled and (not p.processing_enabled or not p.api_sports_contract_validated)');
 d:=replace(d,'if not exists(select 1 from private.player_result_jobs where state', 'if not (p.metadata_enabled and exists(select 1 from private.player_catalog_jobs where state=''PENDING'')) and not exists(select 1 from private.player_result_jobs where state');
 execute d;
end; $extend$;
revoke all on function private.player_catalog_complete(uuid) from public,anon,authenticated;
revoke all on function api.enqueue_player_catalog(text) from public,anon;
grant execute on function api.enqueue_player_catalog(text) to authenticated;
revoke all on function api.claim_player_catalog_job(uuid),api.complete_player_catalog_job(uuid,text,integer,text),api.claim_player_catalog_source(text),api.complete_player_catalog_source(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function api.claim_player_catalog_job(uuid),api.complete_player_catalog_job(uuid,text,integer,text),api.claim_player_catalog_source(text),api.complete_player_catalog_source(text,uuid,jsonb) to service_role;

-- Catalog identity evidence has its own per-week/event progress and bounded age.
-- It never renews a quote head or a member proof. Cold16-game acquisition advances
-- two events per worker across ticks instead of restarting after the60s quote TTL.
-- Successful absence is retained equally: missing names stay unavailable without
-- an unbounded automatic paid retry loop.
create table private.player_catalog_quote_evidence (
 week_id uuid not null references private.season_weeks(id),event_id uuid not null references private.sports_events(id),
 family text not null check(family in('player_pass_yds','player_rush_yds','player_reception_yds')),
 request_id uuid not null references private.shared_quote_requests(id),
 discovered_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,
 primary key(week_id,event_id,family)
);
create index player_catalog_quote_evidence_request_idx on private.player_catalog_quote_evidence(request_id);
create table private.player_catalog_quote_attempts (
 job_lease_id uuid not null,week_id uuid not null references private.player_catalog_jobs(week_id),
 request_id uuid not null references private.shared_quote_requests(id),reserved_at timestamptz not null default clock_timestamp(),
 primary key(job_lease_id,request_id)
);
alter table private.player_catalog_quote_evidence enable row level security;
alter table private.player_catalog_quote_attempts enable row level security;
revoke all on private.player_catalog_quote_evidence,private.player_catalog_quote_attempts from public,anon,authenticated;
create function private.player_catalog_quote_scope(p_week_id uuid) returns boolean
language sql volatile security invoker set search_path='' as $$
 select exists(select 1 from private.player_catalog_jobs job join private.season_weeks w on w.id=job.week_id
 join private.seasons s on s.id=w.season_id join private.player_prop_leagues scope on scope.league_id=s.league_id and scope.season_id=s.id
 where job.week_id=p_week_id and job.state='PENDING' and job.lease_id is not null and job.lease_until>clock_timestamp()
 and s.mode='LIVE' and w.state in('PLANNED','OPEN','LOCKED','PROVISIONAL') and scope.catalog_enabled)
 and exists(select 1 from private.player_result_policy where metadata_enabled)
 and not exists(select 1 from private.week_player_menu where week_id=p_week_id and frozen_at is not null);
$$;
revoke all on function private.player_catalog_quote_scope(uuid) from public,anon,authenticated;
create function api.get_player_catalog_quotes(p_week_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare imports jsonb; pending boolean;
begin
 if not private.player_catalog_quote_scope(p_week_id) then return jsonb_build_object('imports','[]'::jsonb,'pending',true);end if;
 -- Capture usable public observations from ANY league; source event/team/date
 -- must still match this published week. Successful present AND absent family
 -- evidence persists12h independently of quote freshness.
 insert into private.player_catalog_quote_evidence(week_id,event_id,family,request_id,expires_at)
 select p_week_id,e.id,c.family,r.id,r.fetched_at+interval '12 hours'
 from private.sports_events e join private.shared_quote_coverage c on c.external_event_id=e.fixture_event_key
 join private.shared_quote_requests r on r.id=c.latest_successful_request_id
 where e.week_id=p_week_id and e.scheduled_start_at>clock_timestamp() and r.kind='PROPS' and r.state='SUCCEEDED'
 and r.fetched_at<=clock_timestamp() and r.fetched_at>clock_timestamp()-interval '12 hours'
 and r.payload#>>'{events,0,externalEventId}'=e.fixture_event_key and r.payload#>>'{events,0,awayTeam}'=e.away_team
 and r.payload#>>'{events,0,homeTeam}'=e.home_team and (r.payload#>>'{events,0,scheduledStartAt}')::timestamptz=e.scheduled_start_at
 and exists(select 1 from private.slate_items i where i.event_id=e.id and private.is_effective_slate_item(i.id))
 on conflict(week_id,event_id,family) do update set request_id=excluded.request_id,discovered_at=clock_timestamp(),expires_at=excluded.expires_at
 where private.player_catalog_quote_evidence.request_id<>excluded.request_id;
 -- One normalized import per source request, filtered to exactly the family
 -- evidence retained for this week. No unrelated event or private draft appears.
 select coalesce(jsonb_agg(jsonb_build_object('source','THE_ODDS_API','fetchedAt',r.payload->>'fetchedAt','events',jsonb_build_array(
  jsonb_set(jsonb_set(r.payload#>'{events,0}','{requestedFamilies}',to_jsonb(selected.families)),'{markets}',
   coalesce((select jsonb_agg(m) from jsonb_array_elements(r.payload#>'{events,0,markets}') m
    where (case m->>'statistic' when 'PASSING_YARDS' then 'player_pass_yds' when 'RUSHING_YARDS' then 'player_rush_yds' when 'RECEIVING_YARDS' then 'player_reception_yds' end)=any(selected.families)),'[]'::jsonb))
  )) order by r.fetched_at,r.id),'[]'::jsonb) into imports
 from(select evidence.request_id,array_agg(evidence.family order by evidence.family) families
  from private.player_catalog_quote_evidence evidence join private.sports_events e on e.id=evidence.event_id
  where evidence.week_id=p_week_id and evidence.expires_at>clock_timestamp() and e.scheduled_start_at>clock_timestamp()
  and exists(select 1 from private.slate_items i where i.event_id=e.id and private.is_effective_slate_item(i.id))
  group by evidence.request_id) selected join private.shared_quote_requests r on r.id=selected.request_id;
 select exists(select 1 from private.sports_events e cross join unnest(array['player_pass_yds','player_rush_yds','player_reception_yds']) wanted(family)
  where e.week_id=p_week_id and e.scheduled_start_at>clock_timestamp()
  and exists(select 1 from private.slate_items i where i.event_id=e.id and private.is_effective_slate_item(i.id))
  and not exists(select 1 from private.player_catalog_quote_evidence evidence where evidence.week_id=p_week_id and evidence.event_id=e.id
   and evidence.family=wanted.family and evidence.expires_at>clock_timestamp())) into pending;
 return jsonb_build_object('imports',imports,'pending',pending);
end; $$;
revoke all on function api.get_player_catalog_quotes(uuid) from public,anon,authenticated;
grant execute on function api.get_player_catalog_quotes(uuid) to service_role;
create function api.claim_player_catalog_quote(p_week_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.player_catalog_jobs%rowtype;ev private.sports_events%rowtype;r private.shared_quote_requests%rowtype;
 missing text[];delay integer;t timestamptz;
begin
 perform 1 from private.odds_refresh_policy for update;
 if not private.player_catalog_quote_scope(p_week_id) then return jsonb_build_object('status','DISABLED');end if;
 select * into strict job from private.player_catalog_jobs where week_id=p_week_id for update;
 t:=clock_timestamp();
 if not private.player_catalog_quote_scope(p_week_id) then return jsonb_build_object('status','DISABLED');end if;
 if not exists(select 1 from private.odds_refresh_policy where enabled and provider_entitlement_credits>=20000) then return jsonb_build_object('status','DISABLED');end if;
 perform api.get_player_catalog_quotes(p_week_id);
 select e.* into ev from private.sports_events e where e.week_id=p_week_id and e.scheduled_start_at>t
 and exists(select 1 from private.slate_items i where i.event_id=e.id and private.is_effective_slate_item(i.id))
 and exists(select 1 from unnest(array['player_pass_yds','player_rush_yds','player_reception_yds']) wanted(family)
  where not exists(select 1 from private.player_catalog_quote_evidence evidence where evidence.week_id=p_week_id and evidence.event_id=e.id
   and evidence.family=wanted.family and evidence.expires_at>t))
 order by (select max(evidence.discovered_at) from private.player_catalog_quote_evidence evidence where evidence.week_id=p_week_id and evidence.event_id=e.id) nulls first,
 e.scheduled_start_at,e.id limit 1;
 if ev.id is null then return jsonb_build_object('status','CACHED');end if;
 if (select count(*) from private.player_catalog_quote_attempts where job_lease_id=job.lease_id)>=2 then return jsonb_build_object('status','LIMIT');end if;
 select array_agg(wanted.family order by wanted.family) into missing from unnest(array['player_pass_yds','player_rush_yds','player_reception_yds']) wanted(family)
 where not exists(select 1 from private.player_catalog_quote_evidence evidence where evidence.week_id=p_week_id and evidence.event_id=ev.id
  and evidence.family=wanted.family and evidence.expires_at>t);
 select req.* into r from private.shared_quote_coverage c join private.shared_quote_requests req on req.id=c.request_id
 where c.external_event_id=ev.fixture_event_key and c.family=any(missing) and req.kind='PROPS'
  and ((req.state='RUNNING' and req.expires_at>t) or (req.state='PLANNED' and req.created_at>t-interval '90 seconds'))
 order by req.created_at,req.id limit 1;
 if r.state='RUNNING' then return jsonb_build_object('status','WAIT','retryAfterMs',0);end if;
 select greatest(0,ceil(extract(epoch from next_request_at-t)*1000))::integer into delay from private.odds_refresh_policy;
 if delay>0 then return jsonb_build_object('status','WAIT','retryAfterMs',least(delay,3000));end if;
 if r.id is null then
  insert into private.shared_quote_requests(kind,event_ids,families) values('PROPS',array[ev.fixture_event_key],missing) returning * into r;
  insert into private.shared_quote_coverage(external_event_id,family,request_id) select ev.fixture_event_key,family,r.id from unnest(missing) family
   on conflict(external_event_id,family) do update set request_id=excluded.request_id;
 end if;
 perform private.reserve_selective_quote_credits(cardinality(r.families),true);
 update private.shared_quote_requests set state='RUNNING',attempted_at=clock_timestamp(),expires_at=clock_timestamp()+interval '25 seconds',reserved_cost=cardinality(r.families) where id=r.id;
 insert into private.player_catalog_quote_attempts(job_lease_id,week_id,request_id) values(job.lease_id,p_week_id,r.id);
 return jsonb_build_object('status','CLAIMED','requestId',r.id,'externalEventId',ev.fixture_event_key,'families',r.families);
end; $$;
revoke all on function api.claim_player_catalog_quote(uuid) from public,anon,authenticated;
grant execute on function api.claim_player_catalog_quote(uuid) to service_role;
