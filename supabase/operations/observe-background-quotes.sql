-- Read-only private operator evidence. No participant bets or provider fetches.
begin read only;
select clock_timestamp() observed_at,enabled,polling_enabled,revision,release_sha,cadence_multiplier,backoff_until,forecast from private.background_quote_settings;
select usage_day,daily_credits,background_daily_credits,daily_credit_limit,
 usage_month,monthly_credits,background_monthly_credits,monthly_credit_limit,
 protected_core_daily_credits,protected_core_monthly_credits,requests_remaining,
 provider_entitlement_credits,next_quota_reset_at,provider_cycle_id,provider_used_high_water
 from private.odds_refresh_policy;
select purpose,kind,state,count(*) requests,sum(reserved_cost) reserved,sum(charged_cost) charged,
 max(fetched_at-attempted_at) acquisition_latency from private.shared_quote_requests
 where attempted_at>clock_timestamp()-interval '24 hours' group by purpose,kind,state order by 1,2,3;
select count(*) applications,count(distinct a.event_id) league_events,count(distinct a.request_id) shared_requests,
 max(a.applied_at-r.fetched_at) max_application_lag,
 percentile_cont(0.95) within group(order by extract(epoch from a.applied_at-r.fetched_at)) p95_application_lag_seconds
 from private.background_quote_applications a join private.shared_quote_requests r on r.id=a.request_id
 where a.applied_at>clock_timestamp()-interval '24 hours';
select failure_code,count(*) events,min(retry_at) next_retry from private.background_quote_applications where failure_code is not null group by 1;
select family,count(*) coverage,count(*) filter(where fetch_due) due_to_fetch,count(*) filter(where application_due) waiting_application from private.background_quote_due() group by 1;
select jobname,schedule,active from cron.job where jobname='sunday-ledger-score-checkpoints';
select kind,state,count(*) requests from private.provider_requests where attempted_at>clock_timestamp()-interval '24 hours' group by 1,2;
select enabled,revoked,last_outcome,blocker,last_checked_at,count(*) seasons from private.season_automation group by 1,2,3,4,5;
rollback;
