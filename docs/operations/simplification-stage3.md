# Stage 3 — quote reconciliation and contributor navigation

Prepared from the September 16 Version 1.0 handoff. This is the bounded Stage 3
implementation/recovery package, not a Production release claim. Exact PR/check,
Preview and measurement results belong in the final stage status and PR record.

## Verified release prerequisite

Main `6691af0e23a98fee82fc08284101a546cf56244d`, tree
`5649f8caab34e7d58d7e72f64a80fd98c87fefa3`, is PR #72's actual September 16
23:09:10 UTC merge. Production `dpl_DUooZcaECcFJwrfLw92p1Q38WQ3L` is READY on
that revision with both ledgerleagues.com aliases. Hosted migrations end at
`20260916230627_stage2_read_performance`. The Stage 2 body/privilege comparison,
Stage 1 repair comparison and 22-function shared-odds parity all passed read-only.
There were no competing open PRs at the refresh.

Background acquisition/polling remains enabled at revision 2, cadence multiplier
1, 1,300/day and 13,500/month ceilings, 2,000 provider-cycle reserve; overall caps
are 2,000/day and 18,000/month with protected core 350/day and 2,000/month.
The five-minute scheduler remains active. Genuine season consent is enabled,
not revoked/suspended, effective Week 3, all NFL games, unchanged policy hash
`c940fd2bdef0010ea958d329398f4a3e963e01dcb9f5d2e5c5e476cc3e032bca`.
No worker, provider acquisition or live member mutation was invoked.

## Decisions removed and boundaries retained

- **SL-05:** initial review and Submit recovery now use one pure partial-quote
  merge/restoration operation instead of two copies. Existing `sameSelection`
  and `restoreCardDrafts` still own identity and economic comparison. Stake amounts,
  prior consent and missing selections survive; only timestamp/hash changes with
  identical economics preserve acknowledgment. Improved odds also require consent.
  Recovery still reads current persistence when applying its result. Partial review
  never interprets absent outcomes as full-board withdrawal. Passive stored-board
  replacement, stale-response fences, expiration, card-generation keys and final
  submission authority stay separate and unchanged.
- **SL-07:** five query operations share one allowlisted diagnostic formatter.
  Safe messages, expected authorization/null behavior and missing-function fallback
  stay with each caller. No raw SQL/payload/error cause is retained. Injected failure
  tests cover safe cause distinction, correlation and private-data exclusion.
  The broader database automation `OPERATION_FAILED` fallback is deferred; changing
  its persisted failure contract is unnecessary for this loader-focused improvement.
- **SL-06/09:** [change navigation](../change-navigation.md) links current decisions,
  callers, database authorities and tests. Clean migration verification generates
  the effective-function index/definitions, hashes and privileges as an artifact;
  no editable snapshot or second authority is added. README's commissioner-only
  acquisition claim and obsolete current-state summary are replaced with the
  present operating model. Dated approvals and historical records stay intact.

## Provider overlap decision — SL-04 deferred

Static and dynamic application references, worker callers, active SQL bodies,
literal database references, ACLs and disabled-policy fallback were inspected.

| Path                                                          | Current authority / caller                                                                                                        | Decision                                                                                                                                                                                           |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selected final review / Submit recovery; explicit player menu | `refreshSelectedCardQuotes` → shared plan/claim/completion → `api.apply_live_quote_plan`                                          | Established shared coverage stays authoritative.                                                                                                                                                   |
| Background published prices                                   | Background runner → background actor wrappers → `private.apply_shared_quote_events`                                               | Already shares application with selected demand; no new abstraction needed.                                                                                                                        |
| Explicit commissioner main-price refresh                      | `refreshPublishedLiveQuoteHeads` → no-position `refreshCardQuotes` → week lease/completion → `private.refresh_member_quote_heads` | Retain; no legacy refresh attempts in preceding 24h at inspection (two retained week rows), versus 11 background runs. This is observed row state, not a permanent invocation-frequency guarantee. |
| Disabled coordinated-policy compatibility                     | Budgeted import/store → `api.refresh_live_week_quotes`                                                                            | Retain compatible entry point; do not convert a disabled path into new work.                                                                                                                       |
| Rehearsal and public/private legacy application               | `api.prepare_owner_rehearsal_quote_review` references commissioner refresh; service completion references private member helper   | Retain distinct actor checks and transaction ownership.                                                                                                                                            |

The commissioner and private member quote-head bodies are still 301 lines each;
one authenticates the commissioner and allows entitled rehearsal, while the
other takes a server-resolved member actor and remains private. Hosted grants:
commissioner/claim/plan APIs authenticated-only; completion service-only; private
member/shared helpers inaccessible to anon, authenticated and service roles.
The shared application body is 92 lines and already serves demand/background.
Routing remaining no-position work through the shared planner is technically
possible (it accepts null positions), but changes cache, empty/partial completion
and actor/failure behavior. Low observed activity and rehearsal/compatibility
callers do not justify another database release here. Initial publication,
discovery, results ingestion and all quota/lease/freshness rules remain separate.

## Profiling and retained evidence

Stage 1/2 complete and pending fixtures, raw observations, mixed page timings and
the discarded menu experiment remain the baseline. No menu rewrite, quote cache, virtualization, refresh cadence or state-library
change is included. Profiling preceded the only render-cost change: reuse two
fixed `Intl.DateTimeFormat` instances for kickoff filters and observation labels.
The same locale, timezone and options are retained, with no user/league/draft
state in these objects. Editor state, memoization and component structure remain
unchanged.

The existing production-build benchmark adds a separate Chromium CPU sample of
stake typing while the editor is already open, five runs per desktop/mobile/menu
condition. The fixed two-key sequence includes a declared 50 ms inter-key delay;
wall time includes driver/frame waits and is not pure rendering latency. Profiles
record aggregate function/source-position sample time only, no DOM/input/auth data.
Original timed stake-edit spans are outside profiler overhead. The pre-change
profile is head `2a99afbb7495e52eeb246d10a5307357f42cf449` / Acceptance
`35163775005`. Kickoff formatting was the largest named application self-sample
(about 503–567 ms total over five mobile typing samples per menu); the matching
compiled function uses `Intl.DateTimeFormat(...).formatToParts`. Observation
formatting contributed about 82–83 ms per five mobile samples. These sampled
values include allocation/native work and are not standalone React render time.
The identical harness runs again after formatter reuse. Focus/value and
paused polling assertions still run. See final evidence for results and limits;
report measured formatter effects separately from the quote refactor; no
Production/physical-device speed claim is made.

The required acceptance contract remains unchanged in breadth. The only added
clean-database step derives navigation after existing parity checks. Local quality
checks plus existing isolated CI verify the affected paths; no hosted identity or
paid provider response is used to create evidence.

## Release and recovery

This release changes application code, tests and contributor documentation only.
**No migration, configuration, provider activation, budget or season-consent step
is needed.** Existing Stage 2 database and app contracts remain compatible.

After final verification and the owner's remaining release approval:

1. Refresh only relevant main/Production differences and confirm the reviewed PR
   head and required Acceptance evidence. Do not rerun the odds rollout.
2. Merge the verified PR. The connected Vercel integration deploys main.
3. Verify Production READY on the merge, aliases, public sign-in response and
   available natural error logs. Do not use live submissions/worker probes.

For an application regression, restore the Stage 2 frontend revision
`6691af0e23a98fee82fc08284101a546cf56244d` / deployment
`dpl_DUooZcaECcFJwrfLw92p1Q38WQ3L`, or revert only this PR through the normal
release process. Leave the database, receipts, rules/results, identities, consent
and counters untouched. Recovery execution needs applicable release authorization.
