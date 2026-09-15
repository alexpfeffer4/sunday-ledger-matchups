-- Tracked, dormant dispatcher installation. This migration creates no cron job,
-- enables no policy, sends no request and changes no existing cron cadence.
-- New databases can initialize before scheduler/Vault rollout preparation.
create function private.dispatch_player_result_checkpoints()
returns bigint language plpgsql security definer set search_path='' as $$
declare p private.player_result_policy%rowtype;job_secret text;score_url text;request_id bigint;
begin
 select * into strict p from private.player_result_policy where singleton;
 if not (p.processing_enabled or p.metadata_enabled) then return null;end if;
 if p.source_policy='NFLVERSE_PRIMARY' and not private.player_source_policy_validated() then return null;end if;
 if p.processing_enabled then perform private.enqueue_player_result_jobs();end if;
 if not (p.processing_enabled and exists(select 1 from private.player_result_jobs where
   (p.source_policy='API_SPORTS_NFLVERSE' and p.api_sports_contract_validated
    and state in('WAITING','RUNNING') and next_attempt_at<=clock_timestamp() and attempts<5 and (lease_until is null or lease_until<=clock_timestamp()))
   or (p.nflverse_contract_validated and next_reconcile_at<=clock_timestamp() and reconcile_attempts<7
    and final_observed_at>clock_timestamp()-interval '49 hours' and (reconcile_lease_until is null or reconcile_lease_until<=clock_timestamp()))))
  and not (p.metadata_enabled and exists(select 1 from private.player_catalog_jobs j
   join private.season_weeks w on w.id=j.week_id join private.seasons s on s.id=w.season_id
   join private.player_prop_leagues scope on scope.league_id=s.league_id and scope.season_id=s.id
   where j.state='PENDING' and j.next_attempt_at<=clock_timestamp() and (j.lease_until is null or j.lease_until<=clock_timestamp()) and scope.catalog_enabled)) then return null;end if;
 if not exists(select 1 from cron.job where jobname='sunday-ledger-score-checkpoints' and schedule='*/5 * * * *' and active and regexp_replace(lower(command),'[[:space:];]+','','g')='selectprivate.dispatch_score_checkpoints()') then
  raise exception 'Existing five-minute score checkpoint job must be verified first';end if;
 select decrypted_secret into job_secret from vault.decrypted_secrets where name='score_job_secret';
 select decrypted_secret into score_url from vault.decrypted_secrets where name='score_job_url';
 if score_url is distinct from 'https://www.ledgerleagues.com/api/operations/scores' or coalesce(length(job_secret),0)<32 then
  raise exception 'Player result scheduler Vault configuration is missing or invalid';end if;
 select net.http_post(url:='https://www.ledgerleagues.com/api/operations/player-results',
  headers:=jsonb_build_object('Authorization','Bearer '||job_secret,'Content-Type','application/json'),body:='{}'::jsonb,timeout_milliseconds:=110000) into request_id;
 return request_id;
end; $$;
revoke all on function private.dispatch_player_result_checkpoints() from public,anon,authenticated;

-- Reusable after the reviewed score-dispatch initializer recreates its function.
-- Hooking dormant code is separate from runtime cron/Vault readiness. Only the
-- first PL/pgSQL body entry is changed; core score guards and every nested block
-- remain byte-for-byte intact. A child failure cannot prevent core score work.
create function private.attach_player_result_dispatch_hook() returns boolean
language plpgsql security invoker set search_path='' as $$
declare d text;body_start integer;anchor text:=E'begin\n';hook text:=E'  begin\n    perform private.dispatch_player_result_checkpoints();\n  exception when others then\n    raise warning ''Player/catalog dispatch unavailable (%).'',SQLSTATE;\n  end;\n';
begin
 if to_regprocedure('private.dispatch_player_result_checkpoints()') is null then raise exception 'Player dispatcher migration must be installed first';end if;
 d:=pg_get_functiondef('private.dispatch_score_checkpoints()'::regprocedure);
 if strpos(d,'perform private.dispatch_player_result_checkpoints();')>0 then return false;end if;
 body_start:=strpos(d,anchor);
 if body_start=0 then raise exception 'Score dispatcher baseline changed';end if;
 execute overlay(d placing anchor||hook from body_start for length(anchor));
 return true;
end; $$;
revoke all on function private.attach_player_result_dispatch_hook() from public,anon,authenticated;
select private.attach_player_result_dispatch_hook();
