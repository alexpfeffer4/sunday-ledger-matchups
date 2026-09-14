-- Release operator only, after owner upgrade and combined rollout approval.
-- Pass verified_entitlement_json through the secure executor/SQL client. This
-- JSON contains account entitlement metadata, NEVER the API key.
-- Required keys: entitlementCredits(>=20000), remaining, used, cycleId,
-- observedAt(now <=10m), resetPolicy='FIRST_OF_MONTH_CONFIRMED_HEADERS',
-- nextQuotaResetAt(next month's second day00:00Z).
-- https://the-odds-api.com/manage/faqs.html documents monthly credits resetting
-- on day1, separately from subscription billing. Exact reset timezone is not
-- specified; day2 UTC is our conservative probe schedule, not a provider claim.
-- A fresh zero-credit/sports probe must also confirm used+remaining=entitlement.
\if :{?verified_entitlement_json}
\else
\echo 'Provide verified_entitlement_json from the actual upgraded account and fresh quota evidence.'
\quit 3
\endif
begin;
select api.configure_player_prop_odds_budget(:'verified_entitlement_json'::jsonb);
-- Expected: daily1000/monthly5000; protected core350/day2000/month.
-- Existing usage counters, provider reserve floor and offering flags preserved.
select daily_credit_limit,monthly_credit_limit,protected_core_daily_credits,
 protected_core_monthly_credits,reserve_credits,daily_credits,monthly_credits,
 provider_entitlement_credits,provider_cycle_id,next_quota_reset_at,quota_reset_policy
from private.odds_refresh_policy;
commit;
