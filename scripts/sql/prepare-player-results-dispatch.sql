-- Read-only rollout verification. Dispatcher DDL is tracked by migration
-- *_tracked_player_dispatch_hook.sql; do not apply this script as
-- an additional migration or modify the migration journal. Run after the exact
-- compatible application release and migration have passed their release gates.
do $verify$
begin
 if to_regprocedure('private.dispatch_player_result_checkpoints()') is null
 or to_regprocedure('private.attach_player_result_dispatch_hook()') is null then
  raise exception 'Tracked player dispatcher migration is not installed';end if;
 if not exists(select 1 from cron.job where jobname='sunday-ledger-score-checkpoints' and schedule='*/5 * * * *' and active and regexp_replace(lower(command),'[[:space:];]+','','g')='selectprivate.dispatch_score_checkpoints()') then
  raise exception 'Existing five-minute score checkpoint job must be verified first';end if;
 if strpos(pg_get_functiondef('private.dispatch_score_checkpoints()'::regprocedure),'perform private.dispatch_player_result_checkpoints();')=0 then
  raise exception 'Tracked player dispatcher hook is not attached';end if;
 if not exists(select 1 from vault.decrypted_secrets where name='score_job_url' and decrypted_secret='https://www.ledgerleagues.com/api/operations/scores')
 or not exists(select 1 from vault.decrypted_secrets where name='score_job_secret' and length(decrypted_secret)>=32) then
  raise exception 'Player result scheduler Vault configuration is missing or invalid';end if;
 if has_function_privilege('authenticated','private.dispatch_player_result_checkpoints()','execute')
 or has_function_privilege('anon','private.dispatch_player_result_checkpoints()','execute')
 or has_function_privilege('authenticated','private.attach_player_result_dispatch_hook()','execute') then
  raise exception 'Player scheduler authority must remain private';end if;
end;
$verify$;
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
