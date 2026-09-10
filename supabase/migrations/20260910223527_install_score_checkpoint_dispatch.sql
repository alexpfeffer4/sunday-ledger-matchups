-- REVIEWED ACTIVATION TEMPLATE ONLY. Not a migration, and not run by CI/deploy.
-- Requires separate owner approval, the Stage 2 migration, and verified Production.
-- First put score_job_secret and score_job_url in Supabase Vault. The secret must
-- match Vercel's server-only SCORE_JOB_SECRET; URL must be the Production endpoint.
-- This script intentionally does not enable the database score policy.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function private.dispatch_score_checkpoints()
returns bigint language plpgsql security definer set search_path='' as $$
declare target_url text; job_secret text; request_id bigint;
begin
  if not exists(select 1 from private.score_refresh_policy where enabled)
    or not exists(select 1 from private.due_score_events(null,false))
    or exists(select 1 from private.odds_refresh_policy
      where next_request_at>clock_timestamp() or requests_remaining<reserve_credits+2
        or (usage_day=(clock_timestamp() at time zone 'UTC')::date and daily_credits+2>daily_credit_limit)
        or (usage_month=date_trunc('month',clock_timestamp() at time zone 'UTC')::date and monthly_credits+2>monthly_credit_limit))
    or exists(select 1 from private.provider_requests where kind='SCORES' and state='RUNNING' and expires_at>clock_timestamp()) then return null; end if;
  select decrypted_secret into target_url from vault.decrypted_secrets where name='score_job_url';
  select decrypted_secret into job_secret from vault.decrypted_secrets where name='score_job_secret';
  if target_url is distinct from 'https://www.ledgerleagues.com/api/operations/scores' or coalesce(length(job_secret),0)<32 then
    raise exception 'Score job Vault configuration is missing or invalid'; end if;
  select net.http_post(url:=target_url,headers:=jsonb_build_object('Authorization','Bearer '||job_secret,'Content-Type','application/json'),
    body:='{}'::jsonb,timeout_milliseconds:=45000) into request_id;
  return request_id;
end;
$$;
revoke all on function private.dispatch_score_checkpoints() from public,anon,authenticated;
select cron.schedule('sunday-ledger-score-checkpoints','*/5 * * * *','select private.dispatch_score_checkpoints()');

-- After verifying budget, secrets, endpoint authorization, and this job, activate
-- explicitly: update private.score_refresh_policy set enabled=true where singleton;
-- Immediate disable (also blocks in-flight automated completion):
-- update private.score_refresh_policy set enabled=false where singleton;
-- select cron.unschedule('sunday-ledger-score-checkpoints');
