-- A successful bounded discovery batch should resume on the next existing
-- five-minute cron tick. Completion + five minutes misses that tick whenever
-- a worker takes any time, unintentionally spacing healthy batches ten minutes
-- apart. Failed/no-progress work retains its original full retry delay.
create or replace function api.complete_player_catalog_job(p_lease_id uuid,p_status text,p_missing_sources integer default 0,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
declare j private.player_catalog_jobs%rowtype;t timestamptz;next_tick timestamptz;retry_at timestamptz;
begin
 if p_lease_id is null or p_status not in('READY','PENDING','UNAVAILABLE') or p_status is null or p_missing_sources is null or p_missing_sources<0 or p_missing_sources>100 or char_length(p_error)>100 then raise exception using errcode='22023',message='Invalid catalog completion.';end if;
 select * into j from private.player_catalog_jobs where lease_id=p_lease_id and lease_until>clock_timestamp() for update;
 if not found then raise exception using errcode='55000',message='Catalog lease expired.';end if;
 t:=clock_timestamp();
 -- Recheck after acquiring the row lock, preserving the original lease guard.
 if j.lease_until<=t then raise exception using errcode='55000',message='Catalog lease expired.';end if;
 next_tick:=date_bin(interval '5 minutes',t,timestamptz '2000-01-01 00:00:00+00')+interval '5 minutes';
 retry_at:=t+interval '5 minutes';
 if p_status='PENDING' and (p_error is null or p_error='CATALOG_IDENTITIES_OR_ROLES_UNRESOLVED')
 and private.player_catalog_quote_scope(j.week_id)
 and exists(select 1 from private.odds_refresh_policy where enabled and provider_entitlement_credits>=20000 and next_request_at<=next_tick)
 and not exists(select 1 from private.odds_entitlement_probes where state='RUNNING' and expires_at>t)
 -- Only newly completed requests from this exact week/lease count as progress.
 -- Successful empty markets also count: their absence is cached for twelve hours.
 and exists(select 1 from private.player_catalog_quote_attempts a
  join private.shared_quote_requests r on r.id=a.request_id
  join private.player_catalog_quote_evidence evidence on evidence.request_id=r.id and evidence.week_id=a.week_id
  join private.sports_events e on e.id=evidence.event_id and e.week_id=a.week_id
  where a.job_lease_id=p_lease_id and a.week_id=j.week_id and r.kind='PROPS' and r.state='SUCCEEDED'
  and evidence.expires_at>t and e.scheduled_start_at>t
  and e.fixture_event_key=any(r.event_ids) and evidence.family=any(r.families)
  and exists(select 1 from private.slate_items i where i.event_id=e.id and private.is_effective_slate_item(i.id)))
 and not exists(select 1 from private.player_catalog_quote_attempts a
  join private.shared_quote_requests r on r.id=a.request_id
  where a.job_lease_id=p_lease_id and a.week_id=j.week_id and r.state<>'SUCCEEDED')
 -- Missing identities/markets with complete discovery evidence must not create
 -- a faster paid retry loop. Only unobserved published event/family work remains.
 and exists(select 1 from private.sports_events e
  cross join unnest(array['player_pass_yds','player_rush_yds','player_reception_yds']) wanted(family)
  where e.week_id=j.week_id and e.scheduled_start_at>t
  and exists(select 1 from private.slate_items i where i.event_id=e.id and private.is_effective_slate_item(i.id))
  and not exists(select 1 from private.player_catalog_quote_evidence evidence
   where evidence.week_id=j.week_id and evidence.event_id=e.id and evidence.family=wanted.family and evidence.expires_at>t))
 then retry_at:=next_tick;end if;
 update private.player_catalog_jobs set state=p_status,missing_sources=p_missing_sources,last_error=p_error,lease_id=null,lease_until=null,
  next_attempt_at=retry_at,completed_at=case when p_status='READY' then t else null end
 where week_id=j.week_id and lease_id=p_lease_id and lease_until>clock_timestamp();
 if not found then raise exception using errcode='55000',message='Catalog lease expired.';end if;
 if p_status in('READY','UNAVAILABLE') and private.player_props_menu_eligible(j.week_id) then perform private.prepare_player_menu(j.week_id);end if;
end; $$;
-- At most sixteen event requests may fit inside the existing worker deadline.
-- The unchanged wall-clock deadline remains authoritative. This changes only
-- the per-lease quote-attempt ceiling, not the separate API-Sports metadata cap,
-- per-request provider reservation, cooldown, shared twelve-hour cache or scope.
do $bounded_catalog_quotes$
declare d text;old_guard text:='(select count(*) from private.player_catalog_quote_attempts where job_lease_id=job.lease_id)>=2';
begin
 d:=pg_get_functiondef('api.claim_player_catalog_quote(uuid)'::regprocedure);
 if (length(d)-length(replace(d,old_guard,'')))/length(old_guard)<>1 then
  raise exception 'Catalog quote attempt guard changed';
 end if;
 execute replace(d,old_guard,'(select count(*) from private.player_catalog_quote_attempts where job_lease_id=job.lease_id)>=16');
end; $bounded_catalog_quotes$;
-- Existing service-only grants, source cache, quota authority, scheduler and
-- network/auth dispatch are deliberately unchanged.
