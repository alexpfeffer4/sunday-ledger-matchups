-- Isolated diagnostics: no competitive imports, source approval, result jobs or
-- raw provider payloads. Actual requests share the account's existing metadata
-- ledger and limits, plus a fixed twenty-reservation ceiling for this rollout.
create table private.player_source_smoke_runs (
 id uuid primary key default gen_random_uuid(),
 operation_key text not null unique check(operation_key ~ '^[A-Za-z0-9:_-]{8,120}$'),
 season integer not null default 2026 check(season=2026),
 state text not null default 'RUNNING' check(state in('RUNNING','CHECKED','UNAVAILABLE','DEFERRED')),
 started_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '100 seconds',
 completed_at timestamptz,
 sample jsonb,
 report jsonb,
 failure_stage text check(failure_stage in('STATUS','COVERAGE','GAMES','AWAY_ROSTER','HOME_ROSTER','BOX_SCORE','SUMMARY')),
 failure_code text check(failure_code in('SOURCE_UNAVAILABLE','SOURCE_SHAPE_UNSUPPORTED','CURRENT_SEASON_UNAVAILABLE','NO_COMPLETED_GAME','BUDGET_DEFERRED','LEASE_EXPIRED'))
);
alter table private.player_source_smoke_runs enable row level security;
revoke all on private.player_source_smoke_runs from public,anon,authenticated,service_role;
alter table private.player_result_requests add column source_smoke_run_id uuid references private.player_source_smoke_runs(id);
create index player_result_requests_smoke_idx on private.player_result_requests(source_smoke_run_id) where source_smoke_run_id is not null;

create function private.player_source_smoke_response(p_run_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('status',r.state,'smokeRunId',r.id,'season',r.season,
 'requestsReserved',(select count(*) from private.player_result_requests q where q.source_smoke_run_id=r.id),
 'requestCeiling',20,'report',r.report,'checkedAt',r.completed_at,
 'failureStage',r.failure_stage,'failureCode',r.failure_code)
 from private.player_source_smoke_runs r where r.id=p_run_id;
$$;
revoke all on function private.player_source_smoke_response(uuid) from public,anon,authenticated,service_role;

create function api.claim_player_source_smoke(p_operation_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p private.player_result_policy%rowtype;r private.player_source_smoke_runs%rowtype;t timestamptz;
begin
 if p_operation_key is null or p_operation_key !~ '^[A-Za-z0-9:_-]{8,120}$' then raise exception 'INVALID_SMOKE_OPERATION';end if;
 perform private.roll_player_result_budget_day();
 select * into strict p from private.player_result_policy for update;
 t:=clock_timestamp();
 select * into r from private.player_source_smoke_runs where operation_key=p_operation_key for update;
 if found then
  if r.state<>'RUNNING' then return private.player_source_smoke_response(r.id);end if;
  if r.expires_at>t then return jsonb_build_object('status','BUSY');end if;
  update private.player_source_smoke_runs set state='UNAVAILABLE',completed_at=t,failure_code='LEASE_EXPIRED' where id=r.id;
  return private.player_source_smoke_response(r.id);
 end if;
 if exists(select 1 from private.player_source_smoke_runs where state='RUNNING' and expires_at>t)
  or p.status_probe_until>t then return jsonb_build_object('status','BUSY');end if;
 if (select count(*) from private.player_result_requests where source_smoke_run_id is not null)>=20 then return jsonb_build_object('status','LIMIT');end if;
 if p.blocked_until>t then return jsonb_build_object('status','DEFERRED');end if;
 insert into private.player_source_smoke_runs(operation_key) values(p_operation_key) returning * into r;
 -- Reuse the ordinary quota-status completion authority and its conservative
 -- in-flight subtraction. Only its account facts change, never readiness flags.
 update private.player_result_policy set status_probe_id=r.id,status_probe_until=t+interval '1 minute' where singleton;
 return jsonb_build_object('status','CLAIMED','smokeRunId',r.id,'season',2026);
end;
$$;
revoke all on function api.claim_player_source_smoke(text) from public,anon,authenticated;
grant execute on function api.claim_player_source_smoke(text) to service_role;

-- One reservation authority serves both ordinary metadata and isolated smoke.
-- A diagnostic lease substitutes for enablement only; every real shared quota,
-- result-priority, rate/backoff and conservative reservation rule still applies.
create function private.reserve_player_metadata_credits(p_smoke_run_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare p private.player_result_policy%rowtype;r private.player_source_smoke_runs%rowtype;new_id uuid;n integer;t timestamptz;
begin
 perform private.roll_player_result_budget_day();
 select * into strict p from private.player_result_policy where singleton for update;
 t:=clock_timestamp();
 if p_smoke_run_id is not null then
  select * into strict r from private.player_source_smoke_runs where id=p_smoke_run_id for update;
  if r.state<>'RUNNING' or r.expires_at<=t then raise exception 'SMOKE_LEASE_UNAVAILABLE';end if;
  if p.provider_observed_at is null or p.provider_observed_at<r.started_at or p.status_probe_id=r.id then raise exception 'SMOKE_ACCOUNT_UNVERIFIED';end if;
  if (select count(*) from private.player_result_requests where source_smoke_run_id is not null)>=20
   or (select count(*) from private.player_result_requests where source_smoke_run_id=r.id)>=5 then raise exception 'SMOKE_REQUEST_LIMIT';end if;
 end if;
 if (p_smoke_run_id is null and not (p.processing_enabled or p.metadata_enabled))
  or p.blocked_until>t or p.provider_remaining=0 then raise exception using errcode='55000',message='Statistics metadata requests unavailable.';end if;
 if p.processing_enabled and p.api_sports_contract_validated and exists(select 1 from private.player_result_jobs where state in('WAITING','RUNNING') and attempts<5 and next_attempt_at<=t and (lease_until is null or lease_until<=t)) then raise exception using errcode='55000',message='Accepted player results have priority.';end if;
 select count(*) into n from private.player_result_requests where request_class='METADATA' and reserved_at>=date_trunc('day',t at time zone 'UTC') at time zone 'UTC';
 if n>=p.metadata_daily_limit or (select count(*) from private.player_result_requests where reserved_at>t-interval '1 minute')>=p.requests_per_minute then raise exception using errcode='55000',message='Statistics metadata budget exhausted.';end if;
 insert into private.player_result_requests(request_class,source_smoke_run_id) values('METADATA',p_smoke_run_id) returning id into new_id;
 update private.player_result_policy set provider_remaining=greatest(0,provider_remaining-1) where singleton;
 return new_id;
end;
$$;
revoke all on function private.reserve_player_metadata_credits(uuid) from public,anon,authenticated,service_role;
create or replace function api.reserve_player_metadata_request() returns uuid
language sql security definer set search_path='' as $$ select private.reserve_player_metadata_credits(null); $$;
create function api.reserve_player_source_smoke_request(p_run_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 if p_run_id is null then raise exception 'SMOKE_LEASE_UNAVAILABLE';end if;
 return private.reserve_player_metadata_credits(p_run_id);
end;
$$;
revoke all on function api.reserve_player_source_smoke_request(uuid) from public,anon,authenticated;
grant execute on function api.reserve_player_source_smoke_request(uuid) to service_role;

create function api.complete_player_source_smoke(p_run_id uuid,p_status text,p_report jsonb default null,
 p_sample jsonb default null,p_failure_stage text default null,p_failure_code text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.player_source_smoke_runs%rowtype;t timestamptz;v record;
begin
 perform 1 from private.player_result_policy for update;
 select * into strict r from private.player_source_smoke_runs where id=p_run_id for update;
 t:=clock_timestamp();
 if r.state<>'RUNNING' then return private.player_source_smoke_response(r.id);end if;
 if r.expires_at<=t then p_status:='UNAVAILABLE';p_report:=null;p_failure_code:='LEASE_EXPIRED';end if;
 if p_status is null or p_status not in('CHECKED','UNAVAILABLE','DEFERRED') then raise exception 'INVALID_SMOKE_COMPLETION';end if;
 if p_sample is not null and (jsonb_typeof(p_sample)<>'object' or p_sample-array['gameId','awayTeamId','homeTeamId']<>'{}'::jsonb
  or coalesce(p_sample->>'gameId','')!~'^[0-9]{1,20}$' or coalesce(p_sample->>'awayTeamId','')!~'^[0-9]{1,20}$'
  or coalesce(p_sample->>'homeTeamId','')!~'^[0-9]{1,20}$' or p_sample->>'awayTeamId'=p_sample->>'homeTeamId') then raise exception 'INVALID_SMOKE_SAMPLE';end if;
 if p_status='CHECKED' then
  if p_report is null or jsonb_typeof(p_report)<>'object' or p_sample is null
   or (select count(*) from private.player_result_requests where source_smoke_run_id=r.id and completed_at is not null and succeeded)<>5
   or (select count(*) from jsonb_object_keys(p_report))<>13
   or p_report-array['coverageAvailable','gameIdentityVerified','bothRostersAvailable','boxScoreShapeValid','matchingPlayerCount','passingRows','rushingRows','receivingRows','offensiveActivityRows','missingMappedPlayers','completenessValidated','dnpValidated','correctionValidated']<>'{}'::jsonb
   or p_report->'completenessValidated' is distinct from 'false'::jsonb or p_report->'dnpValidated' is distinct from 'false'::jsonb
   or p_report->'correctionValidated' is distinct from 'false'::jsonb
   or p_report->'coverageAvailable' is distinct from 'true'::jsonb or p_report->'gameIdentityVerified' is distinct from 'true'::jsonb
   or p_report->'bothRostersAvailable' is distinct from 'true'::jsonb or p_report->'boxScoreShapeValid' is distinct from 'true'::jsonb then raise exception 'INVALID_SMOKE_REPORT';end if;
  for v in select key,value from jsonb_each(p_report) loop
   if v.key in('matchingPlayerCount','passingRows','rushingRows','receivingRows','offensiveActivityRows','missingMappedPlayers') then
    if jsonb_typeof(v.value)<>'number' or v.value::text!~'^[0-9]{1,5}$' then raise exception 'INVALID_SMOKE_REPORT';end if;
   elsif jsonb_typeof(v.value)<>'boolean' then raise exception 'INVALID_SMOKE_REPORT';end if;
  end loop;
 elsif p_report is not null then raise exception 'INVALID_SMOKE_REPORT';end if;
 update private.player_source_smoke_runs set state=p_status,completed_at=t,report=p_report,sample=p_sample,
  failure_stage=p_failure_stage,failure_code=p_failure_code where id=r.id;
 update private.player_result_policy set status_probe_id=null,status_probe_until=null where singleton and status_probe_id=r.id;
 return private.player_source_smoke_response(r.id);
end;
$$;
revoke all on function api.complete_player_source_smoke(uuid,text,jsonb,jsonb,text,text) from public,anon,authenticated;
grant execute on function api.complete_player_source_smoke(uuid,text,jsonb,jsonb,text,text) to service_role;
