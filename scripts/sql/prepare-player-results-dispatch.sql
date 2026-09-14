-- REVIEWED ROLLOUT TEMPLATE. Run only after the owner's combined release approval.
-- Uses the existing five-minute Supabase job and existing Vault score secret.
-- Does not schedule another Vercel Cron, enable result processing, or enable offers.
-- Additive migration and compatible /api/operations/player-results release first.
create or replace function private.dispatch_player_result_checkpoints()
returns bigint language plpgsql security definer set search_path='' as $$
declare job_secret text;request_id bigint;
begin
 if not exists(select 1 from private.player_result_policy where processing_enabled) then return null;end if;
 perform private.enqueue_player_result_jobs();
 if not exists(select 1 from private.player_result_jobs where
  (state in('WAITING','RUNNING') and next_attempt_at<=clock_timestamp() and attempts<5 and (lease_until is null or lease_until<=clock_timestamp()))
  or (next_reconcile_at<=clock_timestamp() and (final_observed_at>clock_timestamp()-interval '25 hours' or state<>'COMPLETE') and (reconcile_lease_until is null or reconcile_lease_until<=clock_timestamp()))) then return null;end if;
 select decrypted_secret into job_secret from vault.decrypted_secrets where name='score_job_secret';
 if coalesce(length(job_secret),0)<32 then raise exception 'Player result scheduler Vault configuration is missing or invalid';end if;
 select net.http_post(url:='https://www.ledgerleagues.com/api/operations/player-results',headers:=jsonb_build_object('Authorization','Bearer '||job_secret,'Content-Type','application/json'),body:='{}'::jsonb,timeout_milliseconds:=55000) into request_id;
 return request_id;
end; $$;
revoke all on function private.dispatch_player_result_checkpoints() from public,anon,authenticated;
-- Preserve existing score dispatch behavior, including core quota guards. The
-- independent result dispatch must happen before its empty-score early return.
do $prepare$
declare d text;
begin
 if not exists(select 1 from cron.job where jobname='sunday-ledger-score-checkpoints' and schedule='*/5 * * * *' and active) then raise exception 'Existing five-minute score checkpoint job must be verified first';end if;
 d:=pg_get_functiondef('private.dispatch_score_checkpoints()'::regprocedure);
 if strpos(d,'perform private.dispatch_player_result_checkpoints();')>0 then return;end if;
 if strpos(d,E'begin\n')=0 then raise exception 'Score dispatcher baseline changed';end if;
 d:=replace(d,E'begin\n',E'begin\n  perform private.dispatch_player_result_checkpoints();\n');
 execute d;
end;
$prepare$;
-- Post-approval activation prerequisites, verified by the release agent:
-- 1. API_SPORTS_NFL_KEY server-only in approved deployment scope.
-- 2. Current-season box-score contract and nflverse participation mapping proved.
-- 3. Exact normalized data retention/use and eventual unresolved path validated.
-- 4. Shared Odds API protected budget upgraded, actual billing reset inspected.
-- Then enable separately: private.player_result_policy.processing_enabled,
-- api_sports_contract_validated, nflverse_contract_validated. Offer disable NEVER
-- clears processing_enabled after any prop receipt has been accepted.
