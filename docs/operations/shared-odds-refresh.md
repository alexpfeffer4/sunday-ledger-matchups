# Shared automatic odds refresh — release package

September 16, 2026 · Architecture Version 1.0 · [Integrated PR #69](https://github.com/alexpfeffer4/sunday-ledger-matchups/pull/69).
Implementation and Preview are authorized. **Production installation, deployment,
budget changes and activation are pending separate approval.** Installing the new
migration leaves background fetching and passive polling disabled.

The owner subsequently authorized merging once checks pass. The automatic app
deployment is compatible with the existing database: missing optional stored-quote
RPC capability returns STOP, without a recurring error or provider call. Database
installation, new limits and activation still require their release approval.

## Candidate and compatibility

Use the exact final green PR head and its immutable Vercel deployment from PR #69.
Record both SHAs in the private rollout record before executing this package. If
merge creates another SHA, require tree equality with the tested candidate and
verify that deployed SHA. Entry main was `82a65f48c2e4ed52f441e4ab5a0a3c83c2b10c00`
(#68); the existing required Acceptance jobs and five-minute database gate remain.
Production observations and hosted migration parity are recorded privately.

One additive migration: `20260916153128_shared_background_odds_refresh.sql`,
created with the repository's Supabase CLI 2.116.0. Existing migration bytes are
untouched. The common application operation retains the authenticated member
wrapper; worker application requires an issued, unexpired, revision-bound claim.
The candidate's expected function hashes are in
`supabase/operations/shared-odds-refresh-parity.sql`; native CI checks them, and
the activation script rejects differing hosted definitions.

The dispatcher adds an independently contained call to
`private.dispatch_background_quotes()` before the existing score early returns.
Player result/catalog and season-automation hooks are retained, including when
the existing score initializer is rerun. No extra cron, subscription or secret.
The installed five-minute job enqueues POST `/api/operations/quotes` using the
existing Vault secret and fixed Production URL convention. A quote failure cannot
prevent the score dispatcher from invoking its other hooks.

## Limits and attainable cadence

| Setting                                      |                    Existing |                       Proposed maximum |
| -------------------------------------------- | --------------------------: | -------------------------------------: |
| Overall UTC daily / calendar monthly credits |               1,000 / 5,000 |                         2,000 / 18,000 |
| Included background daily / monthly credits  |                        None |                         1,300 / 13,500 |
| Protected core daily / monthly               |                 350 / 2,000 |          Preserve at least 350 / 2,000 |
| Provider-cycle floor for optional work       | Existing provider hard stop | At least 2,000 plus essential forecast |

Background MAIN is optional consumption and cannot borrow protected core capacity.
Reservations are atomic with existing demand work, charge once per actual network
request, and preserve uncertain charges. Provider headers and verified reset
protection remain authoritative across UTC calendar resets. Activation changes
limits only; it does not clear usage or provider evidence.

Actual account counters, provider-cycle evidence, named live scope and the dated
remaining-cycle forecast belong in the private rollout record. Recheck them
immediately before activation. The public deterministic schedule fixture verifies
cost arithmetic; it is not an account measurement. The background limit is a
ceiling, not an allocation to consume. Choose only the feasible allowance after
protecting essential/demand usage and the provider floor. Slow or defer optional
work when the private measured balance cannot support the target cadence.

`private.evaluate_background_quote_budget()` reevaluates at least daily using the
actual published union and consented stored schedule, clips work at the real reset,
rounds upward, and preserves the larger of 2,000 essential credits, 150/day, current
daily consumption rate and recent shared-demand rate. Its bounded multiplier
slows all target intervals when remaining allowance cannot cover the estimate.
A zero allowance defers acquisition. Source/quota/rate failures impose global
background backoff; family retries use +5/+15/+60 minutes then normal cadence.
This does not replace existing member, discovery or result retry behavior.

Normal targets are MAIN 60 minutes / 15 minutes within six hours; published props
six hours / one hour within 24 hours. Add up to one five-minute dispatcher tick
under normal capacity. The Vercel worker has a 60-second host bound, a 55-second
claim, 48-second application deadline, at most eight provider calls, three-second
launch spacing, at most 32 events per MAIN call, and bounded per-event fanout.
Progress resumes on a later tick without refetching successful coverage. Browser
reads target 60 seconds while visible/online, defer while editing or reviewing,
and stop when disabled or no events remain. They never contact the provider.
Responses obtained across an editing/review pause are discarded, including those
arriving after review ends; resuming obtains a fresh stored read. Older snapshots
cannot overwrite the newer quotes acquired by final review.

## Verification and Preview

The focused SQL fixture publishes the same two games in 20 independent Live
leagues. One MAIN fetch reserves three credits, applies 40 separate event
transactions, and replays with no additional charge. It also verifies prop
withdrawal, fixed identities, preexisting accepted receipt bytes, calendar/reset
boundaries, worker scope, disable fences and read-only stored updates. Native
concurrency exercises duplicate dispatcher claims, member/worker acquisition,
unknown-charge expiry and atomic purpose budgets. Existing selective/discovery
and submission suites retain partial-family, stale-source and final consent checks.
The deterministic 16-game fixture reproduces 687 MAIN + 1,962 props = 2,649/week;
one and 20 overlapping schedules cost the same.

The new real-Auth desktop/mobile test uses the installed dispatcher and real
`pg_net` queue inside a rollback-only transaction. It delivers that exact queued
request to the disposable app, avoiding any outbound Production call. It verifies
saved quote reads, timestamp-only updates, economic changes, retained draft stake,
privacy, explicit acknowledgment and one real disposable submission. Existing
Auth/rolling/props/season journeys remain required, with zero-skipped gates.

The [branch fixture Preview](https://sunday-ledger-matchups-git-feat-shared-odds-refresh-pfeffer.vercel.app/preview/shared-odds)
uses no backend or submission action. Add a fixture pick, then use Timestamp only,
Move price and Withdraw offer. It demonstrates preserved stake and distinct
changed/unavailable states. Vercel protection may require the owner's sign-in;
it is not hosted Auth/database proof. The connected deployment fetch returned 200. Local interactive browser startup was restricted; real desktop/mobile CI is
the required behavioral evidence. Final exact checks/head are recorded in the PR.

## Approved rollout procedure

1. Confirm final head Acceptance is green and current main has no overlapping
   changes. Review this migration, function parity, dispatcher diff and caps.
   Obtain approval for this exact candidate's migration, merge/deployment, limits
   and global operational activation. No new season consent is required.
2. Recheck current hosted migration list, the existing five-minute job/hooks,
   free entitlement evidence, current provider reset/balance and current published
   scope. Keep named leagues/weeks and operational IDs in the private record.
   Compare Week 2 rule/menu bindings and Week 3 enrollment to the dated record;
   do not inspect hidden participant selections or reset real cards.
3. Apply **only the new migration**, using the established migration flow; verify
   source/function parity. Keep feature controls false while merging/deploying
   the exact tested compatible tree. Verify Vercel READY and deployed commit.
4. Run the release script in its default rollback mode, supplying the verified
   deployed SHA through the session setting below. It previews policy, forecast,
   eligible fanout and conservative due cost without fetching or domain writes.
   Resolve any guard failure before activation; never bypass a parity failure.
5. With the separately approved release and successful dry run, use the same
   session setting plus `sunday_ledger.quotes_apply=true` and run the same script.
   This changes only reviewed global limits/control, preserving all usage and
   provider evidence. The scope is every supported published Live event that
   still accepts entries, including later rolling events in LOCKED/PROVISIONAL
   weeks. PLANNED, Simulation, Example, rehearsal and final scopes are excluded.
6. Inspect one genuine due tick: one shared request/charge, independent league
   application, honest fetch/source times, and an authorized saved-price read.
   Confirm accepted-bet audit/counts and fixed menu identity aggregates are
   unchanged, without reading private picks. Never create a live trial card.
   If nothing is due, record the minimum next due time and leave observation open.

Use a secret-safe established `psql` connection; do not print connection strings.
Session settings bind operator attestation to the exact deployed SHA; the SQL
cannot itself verify Vercel or grant release approval:

```sql
set sunday_ledger.quotes_release_sha = '<exact verified deployed 40-hex SHA>';
-- Default is a full guarded dry run ending in ROLLBACK:
\i supabase/operations/shared-odds-refresh-release.sql
-- Only after the exact release approval:
set sunday_ledger.quotes_apply = 'true';
\i supabase/operations/shared-odds-refresh-release.sql
```

The dry run's forecast may change with actual usage or schedule. Lower limits or
slower cadence take precedence over targets when the measured balance no longer
fits. Never replace keys, purchase capacity or relax final Review/Submit evidence.

## Observe and disable

At approximately 24 hours and after the first game weekend, run
`supabase/operations/observe-background-quotes.sql` and compare to activation:
scheduled vs demand usage, unique shared requests versus application count,
maximum/p95 fanout lag, backlog, failure/backoff and source rejection rates.
Check existing score/player/catalog request logs and season automation outcomes;
verify the old jobs continue, finalization is healthy and no optional work has
consumed protected submission/result capacity. Check one authorized browser read
and truthful delayed text. Record actual results; this chat schedules no later
notification or unattended observation.

For rollback, run `supabase/operations/disable-background-quotes.sql`. It disables
only the new worker and passive polling and increments the revision to fence
uncommitted applications. Outstanding provider outcomes still reconcile accounting.
Keep successful shared data, receipts, history, audit, migrations and existing
limits. Do not blindly restore lower caps beneath consumed usage. Existing manual
refresh, Review/Submit, scores, player results/catalog continuation and season
automation continue. Use a reviewed forward repair for already committed updates.
