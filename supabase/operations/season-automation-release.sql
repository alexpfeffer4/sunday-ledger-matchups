-- Operator-run release gate. No enrollment or human impersonation.
-- Default is read-only/rollback. Explicit scoped release approval is required
-- before supplying automation_apply=true and the tested deployed release SHA.
\set ON_ERROR_STOP on
begin;
do $$
declare sha text:=current_setting('sunday_ledger.automation_release_sha',true);
begin
 if sha is null or sha !~ '^[0-9a-f]{40}$' then raise exception 'Exact tested deployed release SHA required';end if;
 if not exists(select 1 from cron.job where jobname='sunday-ledger-score-checkpoints' and active and schedule='*/5 * * * *')
 or strpos(pg_get_functiondef('private.dispatch_score_checkpoints()'::regprocedure),'perform private.dispatch_season_automation();')=0
 or strpos(pg_get_functiondef('private.dispatch_score_checkpoints()'::regprocedure),'perform private.dispatch_player_result_checkpoints();')=0
 or not exists(select 1 from vault.decrypted_secrets where name='score_job_url' and decrypted_secret='https://www.ledgerleagues.com/api/operations/scores')
 or not exists(select 1 from vault.decrypted_secrets where name='score_job_secret' and length(decrypted_secret)>=32) then
 raise exception 'Existing five-minute dispatch and protected target must be verified';end if;
 perform private.require_week2_props_readiness(true);
 if coalesce(current_setting('sunday_ledger.automation_apply',true),'false')='true' then
 update private.season_automation_settings set enabled=true,release_sha=sha where singleton;
 end if;
end $$;
select enabled,release_sha,private.season_automation_policy_hash() policy_hash,
 (select count(*) from private.season_automation_consents) recorded_consents
 from private.season_automation_settings;
select coalesce(current_setting('sunday_ledger.automation_apply',true),'false')='true' as automation_apply \gset
\if :automation_apply
commit;
\else
rollback;
\endif
