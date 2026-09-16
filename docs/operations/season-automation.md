# Version 2.2 season automation release

Follow the [governing amendment](../governance/2026-09-16-season-automation.md).
This is a dormant, additive release. Implementation and Preview authorization do
not authorize a Production migration, merge, deployment, dispatcher activation
or season enrollment. Request the final scoped approval only after PR/head,
required CI, isolated Preview and this rollout package are complete.

## Release contents

- Migration: `20260916133711_season_automation_standing_policy.sql`.
- Forward repair: `20260916141355_season_automation_schedule_alias.sql` removes
  a local-variable/query-alias ambiguity in official schedule synchronization,
  without changing guards, consent or policy. A complete schedule completion
  regression covers the actual RPC before resuming paused lifecycle work.
- Immutable season consent, exact SYSTEM validation and prepared-week scope;
  compact season control plus leased execution audit. Existing command receipts
  record SYSTEM provenance separately from genuine human actors.
- Narrow authenticated status/configuration APIs; service-only claim, market
  reservation and completion. Private shared operations have no participant or
  service direct grants. New private relations use RLS with no participant grants.
- Existing canonical publication and opening bodies gain fenced SYSTEM authority.
  Original manual signatures and historical behavior remain. Enrolled staging
  queues initial catalog acquisition and withholds cards until opening.
- Protected `/api/operations/season-automation` POST; existing five-minute score
  dispatch hook, independently contained from score and player dispatch failures.
  No additional cron cadence, subscriptions, secrets, provider or account.
- Commissioner one-time approval, status, pause/resume and guarded retry, plus
  truthful automatic menu labels. No weekly confirmation for enrolled weeks.
- No 1.5/3.4 hash change, global default switch, historical rewrite or Week 2 reset.

## Evidence and final approval record

Record the reviewed PR/head and its final required checks, current-main ancestry,
Preview deployment/head, migration SHA256, installed migration/function parity,
production deployment/head and current policy readiness. Keep private league,
season, receipt and provider identifiers out of public PRs and screenshots.
The private release record must name exactly one intended league/season, its
first unopened effective week, saved preset and `SEASON_AUTOMATION_V1` policy hash.
Approval must cover those exact values; it is not blanket opt-in.

The Preview route `/preview/season-automation` is a local-state fixture without a
writable backend and is unavailable in Production. Real Auth and database proof
comes from the required disposable CI lane, including actual approval server
action, two automatically opened weeks, native concurrent transactions and
existing complete full-season/authorization gates. Fixture screenshots are not
proof of hosted authenticated behavior.

## Approved rollout sequence

1. Recheck current main, exact reviewed head, installed migrations, current
   six-choice rules/source policy and existing Week 2 state read-only. Record the
   existing score/player dispatch definitions and policy flags. Do not reset or
   alter current competitive play.
2. After final approval, merge/release the exact reviewed additive migration and
   compatible app in the established repository/deployment flow. The migration
   starts `season_automation_settings.enabled=false` and has no consents. Existing
   score/player dispatch continues. Verify migrations/definitions match byte for
   byte and Production serves the reviewed release.
3. Dry-run `supabase/operations/season-automation-release.sql` with the release
   SHA. Confirm the existing score dispatcher and secret target, source readiness,
   release gates and active five-minute job. The script has no enrollment action.
4. Enable the dormant hook with the same script only within approved release
   scope. Supply `sunday_ledger.automation_apply=true` and the exact tested deployed
   `sunday_ledger.automation_release_sha`; normal execution is a rollback dry run.
5. The actual commissioner acknowledges the scoped policy through the normal
   authenticated Season automation panel, choosing the approved first unopened
   week/preset. Do not spoof `auth.uid`, create a consent as an operator, or submit
   a weekly review. If approval was already captured through the authenticated
   panel, verify its exact hash/scope instead of asking for it again.
6. Verify status and first due SYSTEM run. Check no cards during PLANNED, exact
   slate, content validation and one allocation at opening. Week 2 continuation,
   quotes and accepted-result processing must retain their prior configuration.

## Provider and worker budget

The worker makes no provider request for idle or stored-state-only work. Initial
schedule synchronization uses the existing free nflverse games CSV, with at most
one daily refresh when a finalized season is due for its next preparation.
Preparation refreshes that source and acquires the existing main-market slate,
reserving three core Odds API credits under the existing shared application
budget and cooldown before acquisition. Provider headers use existing accounting.
Missing selected games fail the entire preparation; they do not silently shrink
the approved preset. A failed preparation gets only the bounded lifecycle retries.

Props identities/lines, later empty-slot discovery, quote freshness and accepted
results continue through the installed catalog/cache and protected budget logic.
No new whole-catalog props loop or extra subscription is introduced. Expired
entitlement validation, disabled source/processing, exhausted credits, missing
kickoff times or missing markets are blockers, not grounds to loosen readiness.

## Pause and recovery

Use the authenticated panel to pause future preparation/publication; current
quotes, results and authorized pending props continue. Pausing/revoking increments
the control revision and invalidates claimed uncommitted work. Resume keeps the
same policy. Revoke requires a new explicit consent; a pending plan can be reused
only under identical settings and policy, with a new exact SYSTEM validation.
Material changes while a plan exists remain blocked for explicit recovery.

Busy provider/result policy or menu-evidence locks defer lifecycle work through
the same bounded retry path. They do not block an existing result writer in a
reverse lock order. Protected Week 17 corrections serialize with publication
before acquiring event locks; their objective-result and lineage gates remain.

A stored evidence change automatically invalidates an unoffered validation and
schedules revalidation. A failed operation has no successful receipt or partial
domain effects; successful completion replay returns the stored result. An expired
claim is fenced even if its HTTP request finishes later. Retry controls do not
bypass due time, finality, source readiness, cutoff or provider budgets.

For an exception, inspect sanitized status and existing source/acquisition logs,
resolve the actual cause, then request the guarded retry (five-minute control
cooldown). A selected game already at cutoff remains blocked. Do not replace
players already offered, narrow the preset, allocate credits early, reopen a
completed week or change a historical rules binding to force progress. Unenrolled
manual scopes keep their existing review/recovery controls. An enrolled prepared
week may be opened manually through the same exact validated authority, but the
routine panel contains no such weekly confirmation requirement.

Emergency lifecycle-only rollback: set the new singleton enabled flag false and
invalidate outstanding automation claims by advancing control revisions. Leave
score/player policies, current quotes, result processing and approved pending
slots intact. Preserve migration/audit history; do not reverse the migration or
delete consent, validation or publication records.
