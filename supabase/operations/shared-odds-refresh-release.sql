-- Exact tested/deployed SHA and separate owner rollout approval required.
-- No provider calls. Default rollback exercises the same activation guards.
\set ON_ERROR_STOP on
begin;
\ir shared-odds-refresh-parity.sql
create temporary table quote_release_before as
 select to_jsonb(p)-'daily_credit_limit'-'monthly_credit_limit' evidence from private.odds_refresh_policy p;
do $$
declare sha text:=current_setting('sunday_ledger.quotes_release_sha',true);p private.odds_refresh_policy%rowtype;
begin
 if sha is null or sha !~ '^[0-9a-f]{40}$' then raise exception 'Exact tested deployed release SHA required';end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20260916153128') then raise exception 'Shared quote migration missing';end if;
 if not exists(select 1 from cron.job where jobname='sunday-ledger-score-checkpoints' and active and schedule='*/5 * * * *')
 or strpos(pg_get_functiondef('private.dispatch_score_checkpoints()'::regprocedure),'perform private.dispatch_season_automation();')=0
 or strpos(pg_get_functiondef('private.dispatch_score_checkpoints()'::regprocedure),'perform private.dispatch_player_result_checkpoints();')=0
 or strpos(pg_get_functiondef('private.dispatch_score_checkpoints()'::regprocedure),'perform private.dispatch_background_quotes();')=0
 or not exists(select 1 from vault.decrypted_secrets where name='score_job_url' and decrypted_secret='https://www.ledgerleagues.com/api/operations/scores')
 or not exists(select 1 from vault.decrypted_secrets where name='score_job_secret' and length(decrypted_secret)>=32)
 then raise exception 'Existing dispatcher hooks and protected Vault configuration must pass';end if;
 select * into strict p from private.odds_refresh_policy for update;
 if not p.enabled or coalesce(p.provider_entitlement_credits,0)<20000 or p.next_quota_reset_at<=clock_timestamp() or p.next_quota_reset_at is null
 or p.requests_remaining is null or p.requests_remaining<4003
 or not exists(select 1 from private.odds_entitlement_probes where state='SUCCEEDED' and completed_at>clock_timestamp()-interval '26 hours')
 then raise exception 'Current verified provider cycle and protected headroom required';end if;
 if p.protected_core_daily_credits<350 or p.protected_core_monthly_credits<2000 then raise exception 'Core reserves must already be intact';end if;
 if p.daily_credits>2000 or p.monthly_credits>18000 or p.background_daily_credits>1300 or p.background_monthly_credits>13500 then raise exception 'Reconcile actual consumed usage before changing caps';end if;
 -- Only reviewed limits. No counter, provider-cycle, policy-consent or bet reset.
 update private.odds_refresh_policy set daily_credit_limit=2000,monthly_credit_limit=18000 where singleton;
 update private.background_quote_settings set enabled=true,polling_enabled=true,revision=revision+1,release_sha=sha,
 daily_limit=1300,monthly_limit=13500,provider_reserve=greatest(provider_reserve,2000),forecast_at=null where singleton;
 perform private.evaluate_background_quote_budget();
 if coalesce((select (forecast->>'backgroundAllowance')::numeric from private.background_quote_settings),0)<3 then raise exception 'No forecast background allowance remains';end if;
 if exists(select 1 from private.odds_refresh_policy policy_after,quote_release_before b where to_jsonb(policy_after)-'daily_credit_limit'-'monthly_credit_limit' is distinct from b.evidence)
 then raise exception 'Usage or provider evidence changed during activation';end if;
end $$;
-- Concrete read-only due coverage, shared cost and application fanout.
select enabled,polling_enabled,release_sha,daily_limit,monthly_limit,provider_reserve,cadence_multiplier,forecast from private.background_quote_settings;
select count(distinct week_id) eligible_weeks,count(distinct event_id) league_events,count(distinct external_event_id) provider_events from private.background_quote_targets();
select family,count(*) coverage,count(*) filter(where fetch_due) due_to_fetch,count(*) filter(where application_due) due_to_apply from private.background_quote_due() group by family;
select coalesce(sum(case when family='MAIN' then 0 else 1 end),0)+3*ceil(count(*) filter(where family='MAIN')/32.0) conservative_due_credits
 from private.background_quote_due() where fetch_due;
select coalesce(current_setting('sunday_ledger.quotes_apply',true),'false')='true' as quotes_apply \gset
\if :quotes_apply
commit;
\else
rollback;
\endif
