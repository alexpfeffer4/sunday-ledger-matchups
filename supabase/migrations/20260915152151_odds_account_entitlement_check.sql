-- Verify a newly installed server key before configuring its paid entitlement.
-- Account checks use the existing global lease but never alter quota balances,
-- app counters, enable flags, or the prepared budget configuration.
alter table private.odds_entitlement_probes
 add column account_check boolean not null default false;

create function api.claim_odds_account_probe() returns jsonb
language plpgsql security definer set search_path='' as $$
declare p private.odds_refresh_policy%rowtype; t timestamptz; id_new uuid;
begin
 select * into strict p from private.odds_refresh_policy for update;
 t:=clock_timestamp();
 if p.next_entitlement_probe_at>t or p.next_request_at>t
  or exists(select 1 from private.odds_entitlement_probes where state='RUNNING' and expires_at>t)
  or exists(select 1 from private.shared_quote_requests where state='RUNNING' and expires_at>t)
  or exists(select 1 from private.provider_requests where state='RUNNING' and expires_at>t)
  or exists(select 1 from private.live_quote_refreshes where state='RUNNING' and lease_expires_at>t)
 then return jsonb_build_object('status','IDLE'); end if;
 insert into private.odds_entitlement_probes(account_check) values(true) returning id into id_new;
 update private.odds_refresh_policy set next_entitlement_probe_at=t+interval '1 hour',next_request_at=t+interval '3 seconds' where singleton;
 return jsonb_build_object('status','CLAIMED','probeId',id_new);
end;
$$;
revoke all on function api.claim_odds_account_probe() from public,anon,authenticated;
grant execute on function api.claim_odds_account_probe() to service_role;

create function api.complete_odds_account_probe(p_probe_id uuid,p_usage jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.odds_entitlement_probes%rowtype; t timestamptz;
 v_remaining integer; v_used integer;
begin
 -- The same lock order as ordinary quota completion protects launch exclusion.
 perform 1 from private.odds_refresh_policy for update;
 select * into strict r from private.odds_entitlement_probes where id=p_probe_id for update;
 t:=clock_timestamp();
 if not r.account_check then raise exception 'ODDS_PROBE_PURPOSE_MISMATCH'; end if;
 if r.state='SUCCEEDED' then
  return jsonb_build_object('status','READY','remaining',r.remaining,'used',r.used,'last',0,'observedAt',r.completed_at);
 elsif r.state<>'RUNNING' then return jsonb_build_object('status','UNAVAILABLE'); end if;
 v_remaining:=(p_usage->>'remaining')::integer; v_used:=(p_usage->>'used')::integer;
 if r.expires_at<=t or v_remaining is null or v_used is null or v_remaining<0 or v_used<0
  or coalesce((p_usage->>'last')::integer,-1)<>0
 then
  update private.odds_entitlement_probes set state='FAILED',completed_at=t,failure_code='ACCOUNT_CHECK_INCOMPLETE' where id=r.id;
  return jsonb_build_object('status','UNAVAILABLE');
 end if;
 update private.odds_entitlement_probes set state='SUCCEEDED',remaining=v_remaining,used=v_used,completed_at=t where id=r.id;
 return jsonb_build_object('status','READY','remaining',v_remaining,'used',v_used,'last',0,'observedAt',t);
end;
$$;
revoke all on function api.complete_odds_account_probe(uuid,jsonb) from public,anon,authenticated;
grant execute on function api.complete_odds_account_probe(uuid,jsonb) to service_role;

-- A regular reconciliation cannot consume account-check proof or change any
-- allowance from it. The explicit verified-budget release step stays separate.
do $account_probe_purpose$
declare d text; anchor text;
begin
 d:=pg_get_functiondef('api.complete_odds_entitlement_probe(uuid,jsonb)'::regprocedure);
 anchor:=' if r.state<>''RUNNING'' then';
 if strpos(d,anchor)=0 then raise exception 'Entitlement probe purpose anchor changed'; end if;
 d:=replace(d,anchor,' if r.account_check then raise exception ''ODDS_PROBE_PURPOSE_MISMATCH''; end if;'||chr(10)||anchor);
 execute d;
end;
$account_probe_purpose$;
