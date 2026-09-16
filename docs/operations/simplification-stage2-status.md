# Simplification and speed — Stage 2

September 16, 2026. Scoped implementation and verified release package: [PR #72](https://github.com/alexpfeffer4/sunday-ledger-matchups/pull/72), branch `stage2-read-performance`. The PR is open and unmerged; approval remains required for its migration, merge and resulting Production deployment. No Stage 2 merge or Production change is authorized or performed. Stage 3 has not begun.

## Verified starting point

Main is `85dec02d2d778a195495c1a505d1a4ad9b427c34`, September 16 at 21:50:18 UTC, tree `677d3fb6137c428da680cfca886e8357bf50c316`. No open PR competed with this work. Production deployment `dpl_D6t55umLxD4s1HCQEADAy5CQk93u` is READY on that exact revision with both ledgerleagues.com aliases. The owner's final Stage 1 release record supersedes the earlier pre-merge repository checkpoint; the audit and odds-refresh rollout were not repeated.

Hosted migrations end with `20260916214645_season_automation_odds_claim_alias`, preceded by `20260916181542_shared_background_odds_refresh`. The Stage 1 repair body hash remains `b1a3280051b6a95ef4d141237e19c3fc7346bda22c413c1f10b5102c1f14690c`. Relevant active menu definitions were read before editing, including the progressive and automation wrappers and the volatile pending-slot helper.

Read-only refresh found unchanged enabled background acquisition/polling, revision 2, cadence multiplier 1, 1,300/day and 13,500/month background credit caps, and a 2,000 provider-credit reserve. Overall caps remain 2,000/day and 18,000/month, with 350/day and 2,000/month protected core credits. Standing season consent is enabled, not revoked or suspended, effective from Week 3. The five-minute scheduler is active. Its compatible release marker remains `6404b35...`. No worker/provider was invoked and no activation, budget, consent, subscription or money change was made.

## Scoped changes

- SL-01: the proposed materialized pending-eligibility join was measured and removed. PostgreSQL already evaluated the pending helper once in both profiles. Complete menu median was 17.426 → 17.606 ms; pending was 242.626 → 243.019 ms (five alternating repeats on the same fixture). The final migration leaves every existing menu definition intact. Original plans and the discarded candidate are retained as evidence; no speculative cache or additional menu contract is introduced.
- SL-02: one React request-local base state is shared by the shell and pages. Schedule, standings/rules, history, historical matchups, rivalry, playoffs and receipt pages skip the separate current props-menu and quote-head calls. Event status, current phase, bound rules, owner receipts and reset history remain available.
- Current Matchup, Make picks and owner draft presentation retain enriched quotes. Menu/quote heads run independently after the existing authorized base lookup. Matchup operations, playoff context and matchup cards run together after their required league/week inputs.
- Review preflight reads only league/mode, the applicable immutable rules snapshot, week closure and the caller's effective accepted count/allocation. It still rejects invalid requests before acquisition. Final provider acquisition, review proof, changed-term acknowledgement and receipt acceptance are unchanged. The additive read has a narrow missing-function fallback for compatible Preview and rollout; access failures never fall back.

The general base-state RPC is retained. No historical data, acceptance authority, quote reconciliation, refresh cadence, rendering architecture, or provider path was rewritten. The optional participant-only menu split is deferred unless remaining processing/payload measurements justify a second public contract.

## Verification and comparisons

The existing required Acceptance contract remains intact, with an added read-only Stage 2 body/privilege parity check and generated signature check. The final executable revision passed formatting, lint, strict types, 1,023 unit/property tests across 127 files and a production build; disposable native Postgres/Auth and browser execution use the existing CI lane because Docker/Postgres are unavailable in this workspace.

The retained [Stage 1 evidence](evidence/stage1-2026-09-16/README.md) is the before reference. The same worker-created complete/pending leagues, ten-member roster, sixteen games, ninety-six slots, commissioner/participant role, stored Week 2 history and 0–4 desktop / 5–9 mobile starting receipt sequence are used after the change. Five core-action samples per condition use a production build. Desktop is Chromium 1440×900 unthrottled. Mobile is Chromium 390×844, DPR 3, touch, 150 ms latency, 1.6 Mbps down, 750 Kbps up and 4× CPU slowdown. Fresh browser does not imply a cold database/server. Provider cache misses use the same synthetic 500 ms delay. Prefetch and measurement-span limitations remain unchanged.

The initial SQL experiment alternated the exact Stage 1 and candidate menu bodies in rolled-back disposable transactions. It established exact commissioner/member output equality before/after kickoff but no speed gain, so the candidate was discarded. The final SQL verification compares the smaller preflight with the full authorized state for both roles, denial outside the league, and unchanged menu/new-read privileges. First executions and five repeats remain separate. Each real measured submission verifies the smaller read's effective receipt count and allocation. Existing privacy, historical-rules, changed-term, expiry-recovery, draft/scroll, manual/automatic publication and native concurrency gates still apply.

The final executable revision is `3d39f6c30868f0249fdba28a3740be883a157772`, tree `16cf54c301f079b0ccb20c1187cfe83cba916c72`. [Required Acceptance run 35158664285](https://github.com/alexpfeffer4/sunday-ledger-matchups/actions/runs/35158664285), attempt 1: all eight required job groups and the **Acceptance complete** aggregate passed. CI merge `2c7099b52fc869a81c04a51cf31b7e4d556ee2e5` has the identical tree. The source, workflow, dependency and SQL bytes are unchanged by subsequent documentation/evidence packaging. Its automatic successor CI may run; the exact executable evidence is reused, without another requested benchmark campaign. The retained menu experiment also passed every job/aggregate in run 35157645808; its unhelpful SQL change was removed before this final run.

Verification covers all 2,456 pgTAP assertions across 59 files, the unchanged Stage 1 preparation/22-function shared-odds parity plus the new-read and unchanged-menu parity, generated signatures, all eight native concurrency scripts, the existing desktop/mobile real-Auth member journeys, shared Chromium/WebKit UI and both actual-worker preparation/benchmark scenarios. New focused checks cover independent scheduling, request-local base immutability, no irrelevant menu/quote reads, legacy Simulation and entitled rehearsal, cheap rejection before provider acquisition, missing-function compatibility, authorization failures without fallback, effective receipt/reset count/allocation and immutable rules-snapshot equality. No gate was weakened. Both benchmark scenarios passed once with zero retries, skips or flaky results; 364 observations were retained.

Compatible Preview: [player props](https://sunday-ledger-matchups-wf2zieefj-pfeffer.vercel.app/preview/player-props), deployment `dpl_HQMisuaPUrQGWoD8RWUvPrub3TWK`, READY at the final executable revision. The protected fetch returned 200 and the expected disabled-preview title at 22:40:11 UTC. This public fixture check plus disposable real-Auth acceptance is the repository's existing Preview approach; it is not an authenticated hosted performance or Production migration test.

### Matched review wait

Cached review to confirmable state, ms median [range], five samples each:

| Menu / device    |        Stage 1 |       Stage 2 | Observed RPCs |
| ---------------- | -------------: | ------------: | ------------: |
| complete-desktop |  390 [351–393] | 278 [250–305] |         7 → 5 |
| complete-mobile  |  776 [707–903] | 606 [585–684] |         7 → 5 |
| pending-desktop  | 983 [496–1011] | 308 [289–343] |         8 → 6 |
| pending-mobile   |  869 [792–967] | 734 [594–790] |         8 → 6 |

### Matched database read

Same final disposable fixture, five repeated SQL executions per read, ms median [range]. These compare the unchanged full-state preflight input with the new minimal input, separately from HTTP and provider work. First observations and complete plans remain in the raw reports.

| Menu     |          Full state ms |      Review context ms |     JSON bytes |
| -------- | ---------------------: | ---------------------: | -------------: |
| complete | 55.552 [55.284–56.239] | 11.206 [11.162–11.310] | 63,911 → 4,409 |
| pending  | 56.856 [56.106–70.480] | 11.504 [11.428–11.745] | 63,895 → 4,411 |

### Page observations and limits

Cold-browser Matchup, ms median [range], five samples each:

| Menu / device    |          Stage 1 |          Stage 2 | Observed RPCs |
| ---------------- | ---------------: | ---------------: | ------------: |
| complete-desktop |    470 [462–486] |    464 [405–487] |         8 → 8 |
| complete-mobile  | 2638 [2621–2680] | 2627 [2608–2691] |         8 → 8 |
| pending-desktop  |    751 [455–777] |    751 [726–802] |         8 → 8 |
| pending-mobile   | 2662 [2640–2680] | 2703 [2675–2706] |         8 → 8 |

The [full before/after table](evidence/stage2-2026-09-16/before-after.md) includes all 19 actions per condition, timing ranges, request counts and known response bytes. [Observed transferred bytes](evidence/stage2-2026-09-16/observed-transfer-summary.json) remain separate from response-body sizes and unknown-byte counts. Cached review improved in all four conditions, with two fewer observed RPCs. Standings consistently uses 4 rather than 6 RPCs, and historical Matchup 5 rather than 7; their latency gains are small or absent and pending-menu samples are slower. Cold Matchup is essentially unchanged. Pending repeat Matchup rose from 426 to 744 ms desktop and 993 to 1,110 ms mobile; pending refresh rose from 422 to 932 ms desktop and 726 to 890 ms mobile. Complete mobile changed-term review also varied widely and its median increased from 2,712 to 4,619 ms. Confirmation and other navigation/filter timings are mixed. No blanket page-speed improvement is claimed.

The unchanged pending-menu SQL itself measured 169.630 ms in Stage 1 versus 242.523 ms in this final runner; the same-runner old/candidate comparison showed no SQL rewrite benefit. These observations cannot isolate scheduling, runner variation or other application costs as the cause of the slower browser spans. That remains an explicit limitation, not a reason to change rendering, cadence or provider policy. Independent scheduling is retained as a small dependency-preserving change with execution tests; it has no separate proven end-to-end speedup here.

Median observed cold-browser transfer bytes, Stage 1 → Stage 2: complete desktop 412,013 → 411,344, complete mobile 405,990 → 406,127, pending desktop 421,726 → 421,835, pending mobile 405,153 → 404,797. Full per-action transfer comparisons are retained in [observed-transfer-before-after.json](evidence/stage2-2026-09-16/observed-transfer-before-after.json). The 64 KB → 4.4 KB reduction is the database response for review preflight, not browser page-transfer reduction.

Measurements use separate CI runners from Stage 1, small samples, warm app/database processes, synthetic provider delay, an emulated mobile device and modest history/receipt sizes. The browser identity is a commissioner who also participates; member and outsider behavior is separately checked in SQL/Auth tests. Prefetch overlaps some spans, incomplete byte observations remain labeled, and base `get_stage1_state` still returns the full current slate. No Production/physical-device speed claim is made. Rendering observations are retained unchanged for Stage 3; no rendering profiling or optimization was performed.

The proposed menu rewrite showed no benefit and was removed. Its [same-fixture plans and SQL](evidence/stage2-2026-09-16/menu-experiment/README.md) establish why. The participant/commissioner menu split is deferred: this stage removes whole unnecessary menu calls without adding another permission-sensitive RPC contract; the remaining deeper pending-menu cost needs a separately justified change.

## Deployment and recovery

One new 39-line migration: `20260916221007_stage2_read_performance.sql`, generated by Supabase CLI 2.116.0. It adds only `api.get_card_review_context(text)`; no existing function is replaced. Migration file SHA-256: `e9ddbbee2927148b4cd4bf0052b7a93506bbf5253d9dc34bdd58292893c4101f`; new function-body SHA-256: `3ccc72a2439e17e2a31eac78c5bd930adb2aa2193e1844417f26939a71e0b801`. Old public menu/state/review/submission contracts remain callable. The private wrapper remains inaccessible to anon/authenticated/service roles; the new member preflight permits only authenticated execution, with explicit membership and caller-entry checks and an empty search path.

After owner release approval:

1. Refresh only relevant main/Production changes and the two affected signatures. Confirm the candidate tree and required Acceptance evidence. Do not repeat the odds-refresh rollout.
2. Install only this forward migration on `nxikkhtaercmbuyrlyio`; retain existing history. If the hosted installer assigns a timestamp, align the still-unmerged filename/record without changing tested SQL bytes or reapplying an installed version.
3. Require `supabase/operations/stage2-read-parity.sql` to return true. Reuse the unchanged Stage 1 repair and 22-function shared-odds parity checks. Compare existing limits, consent and scheduler metadata without invoking workers or manufacturing bets.
4. Merge the tested PR and verify the resulting Production deployment on Vercel project `prj_k1ILOuL7pKVand1qVNfZj8oij6sI`, aliases, public sign-in, and available natural error logs. Hosted live mutation/performance probes are excluded.

Migration-first is preferred: the old app accepts the identical menu contract and ignores the new endpoint. The new app is also compatible with the old database via the missing-function fallback, which retains all preflight checks but does not provide the full preflight speed gain.

For an application regression, return the frontend to known-good `85dec02d2d778a195495c1a505d1a4ad9b427c34` / `dpl_D6t55umLxD4s1HCQEADAy5CQk93u` while leaving this compatible database migration installed. Do not delete migration history or touch receipts, rules/results, identities, approvals or counters. The menu SQL is unchanged, so there is no menu replacement to roll back. For a preflight defect, use the compatible prior frontend pending a forward repair; never bypass checks to keep review moving. Recovery execution requires applicable release authorization.

## Findings and Stage 3

| Finding | Final Stage 2 status                                                                                                               |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| SL-01   | Repeated-helper hypothesis disproved in the two fixtures; menu rewrite discarded. Deeper pending-menu processing remains deferred. |
| SL-02   | Scoped page/review reads and independent scheduling implemented and verified; broader base-state narrowing deferred.               |
| SL-03   | Resolved in Stage 1; actual preparation/retry/opening protection reused and passed.                                                |
| SL-04   | Provider-path consolidation deferred to Stage 3, only if still justified.                                                          |
| SL-05   | Quote reconciliation and rendering profiling deferred to Stage 3.                                                                  |
| SL-06   | Effective-authority navigation deferred to Stage 3.                                                                                |
| SL-07   | Safe diagnostics deferred to Stage 3.                                                                                              |
| SL-08   | Stage 1 baseline reused; final matching Stage 2 observations and limitations retained.                                             |
| SL-09   | Contributor navigation/documentation cleanup deferred to Stage 3.                                                                  |

No Stage 3 work has begun. Start Stage 3 only after Stage 2's relevant changes are merged and its approved rollout is verified.

> Execute Stage 3 of SUNDAY-LEDGER-SIMPLIFICATION-AND-SPEED-HANDOFF-2026-09-16.md, Version 1.0, following its common execution contract and the final Stage 2 status. First verify PR #72's actual merge/deployment/migration outcome and refresh only relevant current differences. Reuse the retained Stage 1/2 evidence. Selectively simplify quote reconciliation, safe diagnostics and contributor navigation, and reassess provider overlap only where it removes meaningful duplication. Profile stake editing before any rendering change. Preserve all authority, review/changed-term consent, privacy, receipts, historical rules/results, fixed identities, season consent and provider-budget protections. Complete authorized PR/Preview and concrete rollout preparation; obtain only remaining release approval once verified. Do not restart the comprehensive audit or odds rollout.
