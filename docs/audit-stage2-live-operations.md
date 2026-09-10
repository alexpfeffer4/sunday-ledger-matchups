# Audit Stage 2 — game checkpoints and commissioner operations

Scope: A02 and A10, including the owner's September 10 instruction to update
scores at game end / about four hours after start instead of continuously.
The implementation prompt required separate rollout approval. On September 10,
the owner approved the reviewed production migration, merge/deployment, scheduler
configuration and activation, and 450/month internal cap within the existing free
plan. No paid-plan change is authorized or needed.

## Authority and verified starting state

Base: `bb0c2b477c34295a2013d59491fcd6b333c141af`, identical tree to the tested
Stage 1 rollout. PR #29 is merged. Vercel deployment
`dpl_EE7K1nABZjKQyNfk1AQi8BMnynUV` is READY. Hosted migration
`20260910202847` is present. Read-only inspection confirmed quote policy enabled,
90 credits/day, 300/calendar month, a 30-credit reserve, 467 recorded provider
credits, and no future-lock Live week. No Live submission/provider round trip
was manufactured. Stage 1's first normal Live review/seal remains pending.

Read with Product Bible V3, Ruleset V1.1 and the approved prospective V1.2
All-play removal, Decision Register 1.1 D-009/D-021/D-023, Architecture 1.1,
Visual Bible 4.1, Roadmap 1.1, the September 10 audit and prompt pack, and the
Stage 1 completion note. The current owner instruction selects checkpoint
updates for this implementation. It does not authorize automatic finalization,
manual inference of kickoff, a new role, or changes to frozen season meaning.

Release review also identified a stale-evidence edge case after commissioner
transfer and an objective correction. Forward migration
`20260910224551_preserve_objective_score_corrections.sql` requires a strictly newer
provider source timestamp before changing a result. Repeated evidence updates
fetch timing without replacing the correction or scheduling outage retries.
The regression exercises the actual transfer, objective correction, request lease,
provider completion, result history and losing settlement.

The previously existing importer, event reveal queries, result engine, immutable
receipts, correction engine, commissioner transfer, and canonical owner rehearsal
are reused. Only public event status/timing is added to the existing authorized
operations DTO. No receipt access or hidden allocation projection is broadened.

## Operating contract

| Check                            | Timing                                                                                                    | Outcome                                                                               |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Start confirmation               | Kickoff +2, +7, +17 minutes until confirmed                                                               | Both team scores and a valid provider update confirm play; time alone does not reveal |
| First result                     | Original kickoff +4 hours                                                                                 | Settle only when `completed=true`; an unfinished game stays pending                   |
| Longer game / recovery           | +4h30, +5h, +6h, +12h, +24h, +48h, +60h as needed                                                         | Skip past checkpoints after a pause; no replay burst                                  |
| Provider outage or missing event | Two short retries at +5 and +15 minutes, then remaining checkpoints                                       | Keep captured results; conservative credit reservation is retained                    |
| Correction capture               | First captured final +6 and +23 hours                                                                     | Append changed official results only while the existing correction window is open     |
| Stop                             | Frozen week finalized, correction window closed, checkpoint list exhausted, or original kickoff +60 hours | Unresolved events require documented operator recovery                                |

The proposed Supabase Cron dispatch runs every five minutes and only invokes
Next when selected events are due and budget is available. Thus a checkpoint
can run up to five minutes after its target, plus processing/provider delay.
This is a bounded operating target, not an actual-kickoff or final-score SLA.
There is no provider webhook proving game end; the four-hour check is the
selected low-cost approximation. Long games are never declared final by a timer.

Scheduled work starts only after the commissioner locks the week. Common-lock
time already blocks late acceptance; an overdue lock is the console's next action.
The scheduler never opens slates, locks cards, finalizes weeks, or advances playoffs.

One global score lease lasts 45 seconds; both manual and scheduled checks share
it and a 60-second attempt guard. The shared Stage 1 quota row is locked before
season/week/evidence locks, with no transaction held across HTTP. Selected games
are deduplicated across due leagues; at most 32 unique games / 128 event instances
are processed per invocation. HTTP times out after ten seconds. Expired/crashed
leases can be reclaimed; repeated completion returns its saved response.

Per-event source update, successful fetch, attempt, and next checkpoint remain
separate. A missing/backward result cannot become fresh merely because another
game fetched successfully. Subsets must match published identities and kickoffs;
unrelated returned IDs and future/backward source times fail closed. Captured
older finals survive provider retention while newer selected games continue.

During a game, the UI explains result checks around +4 hours instead of implying
continuous scoring. It shows the last successful check's age/date in Eastern
Time. Unknown starts and missed checks receive a delayed state; a LIVE flag
cannot suppress it. Ten minutes after a missed result checkpoint is the delay
threshold. A post-four-hour fetch with source data older than 15 minutes is also
delayed. Revealed picks stay revealed; future opponent terms/potential returns
remain absent. Finalized history does not become stale merely with age.

Visible, online member pages refresh authorized stored state every five minutes
while the week is locked/provisional. Polling pauses while hidden/offline and
stops for pregame/final. Manual refresh remains available. This calls no provider,
preserves focus, and announces a concise score/status only when it changes.

## Provider and platform limits checked September 10

[The Odds API reference](https://the-odds-api.com/liveapi/guides/v4/#get-scores)
documents selected-event filtering, completed events up to three days back,
and a two-credit cost with `daysFrom`; its approximately 30-second source
updates are not the app's polling promise. Initial three-market DraftKings
imports reserve three credits, including the free discovery step, and reconcile
reported balance. Score checks reserve two, including failures. Member quote
reviews continue using Stage 1's three-credit coordinator. All use one shared
balance and daily/monthly caps; responses can reduce but not increase it.

The Vercel team is Hobby. [Current Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
allow only daily Hobby jobs with hourly precision, so no frequent Vercel cron
configuration is added. [Supabase Cron](https://supabase.com/docs/guides/cron)
and [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net) support
the proposed due-only authenticated HTTP dispatch in the existing project.
`pg_net` responses are temporary (normally six hours); the application retains
its private attempt/check records. No new service or paid plan is introduced.

Illustrative budget, **not measured usage**: four distinct game windows, each
requiring one start check, one final check and two correction checks, costs
4 × 4 × 2 = 32 credits/week, or 128 over four weeks. Ten members making two
uncached card reviews each costs up to 240 over four weeks; four initial imports
add 12. Total: approximately 380, before overtime/outage retries. Shared windows
across leagues reduce score costs; separate quote caches and additional windows
increase them. A five-week month or sustained retries may hit the cap.

The existing 300/month cap is preserved by the migration. Proposed activation
within the verified 500-credit free plan: retain **90/day and reserve 30**, raise
the shared monthly cap to **450**, and reconcile the actual remaining balance.
This reserves 50 plan credits outside the cap; actual remaining balance minus 30
is an additional hard stop. No charge/upgrade occurs. The owner approved this
concrete production cap change with activation on September 10. If the cap is exhausted, show
delay and use objective-result recovery; manual provider checks cannot bypass it.

## Approved production rollout

1. The production migration was applied as
   `20260910223407_dependable_live_operations.sql`; the repository filename matches
   the hosted history. The policy defaults disabled. The reviewed dispatch template
   was subsequently applied as `20260910223527_install_score_checkpoint_dispatch.sql`
   and is retained byte-for-byte in migrations for reproducible database history.
   It installs Cron/pg_net and the job but leaves the score policy disabled. A fresh
   database therefore cannot dispatch HTTP until its own explicit activation.
2. Merge/deploy the tested code under the owner's rollout approval. Retain existing
   `ODDS_API_KEY` and the database server key. Production currently stores the
   latter as `SUPABASE_Secret_KEY`; Vercel makes this secret write-only and its
   name non-editable. Both provider adapters accept that existing spelling as a
   server-only fallback, preferring the documented `SUPABASE_SECRET_KEY` when set.
   No credential value, privilege, or public configuration changes. Add a random server-only
   `SCORE_JOB_SECRET` of at least 32 characters to Production. Never print it or
   expose it via `NEXT_PUBLIC_` configuration.
3. Save the matching secret as `score_job_secret` in Supabase Vault, and
   `https://www.ledgerleagues.com/api/operations/scores` as `score_job_url`.
   Review and apply `supabase/operations/enable-score-checkpoints.sql` to enable
   the existing-project cron/net extensions and create the disabled-by-policy
   dispatch. Its URL is allowlisted and its function is inaccessible to members.
4. Verify unauthorized endpoint requests return 401; an authenticated request
   while disabled returns DISABLED with no provider call. Confirm current
   Production commit, existing allowance, secrets, and migration match.
5. With activation approval, reconcile provider balance, set the approved shared
   cap (proposed 90/day, 450/month, reserve 30), then set
   `private.score_refresh_policy.enabled=true`. Test the next **normally eligible**
   Live week; do not create or advance a real league to manufacture evidence.
6. Inspect private `provider_requests`, `live_score_checks`, `odds_refresh_policy`,
   and `cron.job_run_details`. Check HTTP responses promptly in `net._http_response`.
   Success of the dispatch alone does not establish successful provider capture.
   Verify start privacy, captured final, bounded repeats, member age/status, and
   commissioner-only finalization.

Disable first: set the score policy `enabled=false`; this also blocks pending
automated completion. Unschedule `sunday-ledger-score-checkpoints`. Manual
commissioner checks remain budgeted. Preserve check history, receipts and result
versions. For a full application rollback, disable the job before reverting code;
keep the additive schema and existing result wrappers. Do not delete evidence.

## Verification and Stage 3 handoff

See the stage completion note and PR checks for executed results. The new
pgTAP lane covers checkpoint boundaries, overlap, quota, partial/different-date
capture, outage/replay, transfer authorization, and settlement/finality. The real
Auth → server action → RSC → RPC lane extends the existing Live card test through
the authenticated score endpoint, stale LIVE state, provider outage, commissioner
fallback, provisional settlement, and receipt preservation. The canonical owner
rehearsal retains the same result implementation and full-season gate.

No production score job, provider call, competitive mutation, or participant
message is part of implementation verification. Physical iPhone/Safari/VoiceOver,
normal Production Live submission/capture, and measured operator time remain
real-world checks. Stage 3 should display the checkpoint contract above and
preserve all frozen rules, quote clocks, hidden picks, correction windows, and
champion-versus-archive finality. A03–A05 and remaining A06–A16 are not completed
by this stage; the Eastern result timestamp inconsistency from A10 is addressed.
