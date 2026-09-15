-- REVIEWED ROLLOUT TEMPLATE. Run only after the owner's combined release approval.
-- Uses the existing five-minute Supabase job and existing Vault score secret.
-- Does not schedule another Vercel Cron, enable result processing, or enable offers.
-- Additive migration and compatible /api/operations/player-results release first.
create or replace function private.dispatch_player_result_checkpoints()
returns bigint language plpgsql security definer set search_path='' as $$
declare job_secret text;request_id bigint;
begin
 if not exists(select 1 from private.player_result_policy where processing_enabled or metadata_enabled) then return null;end if;
 perform private.enqueue_player_result_jobs();
 if not exists(select 1 from private.player_result_jobs where
  (state in('WAITING','RUNNING') and next_attempt_at<=clock_timestamp() and attempts<5 and (lease_until is null or lease_until<=clock_timestamp()))
  or (next_reconcile_at<=clock_timestamp() and reconcile_attempts<7 and final_observed_at>clock_timestamp()-interval '49 hours' and (reconcile_lease_until is null or reconcile_lease_until<=clock_timestamp())))
  and not exists(select 1 from private.player_catalog_jobs j join private.season_weeks w on w.id=j.week_id join private.seasons s on s.id=w.season_id
   join private.player_prop_leagues p on p.league_id=s.league_id and p.season_id=s.id
   where j.state='PENDING' and j.next_attempt_at<=clock_timestamp() and (j.lease_until is null or j.lease_until<=clock_timestamp()) and p.catalog_enabled
   and exists(select 1 from private.player_result_policy where metadata_enabled)) then return null;end if;
 select decrypted_secret into job_secret from vault.decrypted_secrets where name='score_job_secret';
 if coalesce(length(job_secret),0)<32 then raise exception 'Player result scheduler Vault configuration is missing or invalid';end if;
 select net.http_post(url:='https://www.ledgerleagues.com/api/operations/player-results',headers:=jsonb_build_object('Authorization','Bearer '||job_secret,'Content-Type','application/json'),body:='{}'::jsonb,timeout_milliseconds:=110000) into request_id;
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
 d:=replace(d,E'begin\n',E'begin\n  begin\n    perform private.dispatch_player_result_checkpoints();\n  exception when others then\n    raise warning ''Player/catalog dispatch unavailable (%).'',SQLSTATE;\n  end;\n');
 execute d;
end;
$prepare$;
-- Activation prerequisites under the retained release approval:
-- 1. Explicit selected source/selection policy and matching validation evidence.
--    NFLVERSE_PRIMARY uses FEATURED_HIGHEST_STANDARD_LINES, published nflverse
--    totals and PFR snaps; no API-Sports key or contract flag is required.
--    API_SPORTS_NFLVERSE additionally requires the server-only API_SPORTS_NFL_KEY
--    and a validated current-season API-Sports box-score contract.
-- 2. Stable player/game/team mappings, per-game completeness, permitted normalized
--    evidence retention/attribution and an executable verified-exception path.
-- 3. Fresh Odds API entitlement evidence and the verified protected app budget;
--    the owner upgrade/key setup is complete. Preserve usage and reset history.
-- Enable processing/metadata separately only after their checks pass. Set only
-- genuinely validated contract flags: nflverse_contract_validated in primary
-- mode; both source flags in dual-source mode. Verify the selected mode through
-- private.player_source_policy_validated(). This hook itself is source-agnostic.
-- Disabling offers NEVER clears processing_enabled after a prop is accepted.
