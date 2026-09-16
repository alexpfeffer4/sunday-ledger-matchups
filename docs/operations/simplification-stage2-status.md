# Simplification and speed — Stage 2

September 16, 2026. Implementation and verification in progress in [PR #72](https://github.com/alexpfeffer4/sunday-ledger-matchups/pull/72). This record will be completed with measured results before release approval. No Stage 2 merge or Production change is authorized or performed. Stage 3 has not begun.

## Verified starting point

Main is `85dec02d2d778a195495c1a505d1a4ad9b427c34`, September 16 at 21:50:18 UTC, tree `677d3fb6137c428da680cfca886e8357bf50c316`. No open PR competed with this work. Production deployment `dpl_D6t55umLxD4s1HCQEADAy5CQk93u` is READY on that exact revision with both ledgerleagues.com aliases. The owner's final Stage 1 release record supersedes the earlier pre-merge repository checkpoint; The audit and odds-refresh rollout were not repeated.

Hosted migrations end with `20260916214645_season_automation_odds_claim_alias`, preceded by `20260916181542_shared_background_odds_refresh`. The Stage 1 repair body hash remains `b1a3280051b6a95ef4d141237e19c3fc7346bda22c413c1f10b5102c1f14690c`. Relevant active menu definitions were read before editing, including the progressive and automation wrappers and the volatile pending-slot helper.

Read-only refresh found unchanged enabled background acquisition/polling, revision 2, cadence multiplier 1, 1,300/day and 13,500/month background credit caps, and a 2,000 provider-credit reserve. Overall caps remain 2,000/day and 18,000/month, with 350/day and 2,000/month protected core credits. Standing season consent is enabled, not revoked or suspended, effective from Week 3. The five-minute scheduler is active. Its compatible release marker remains `6404b35...`. No worker/provider was invoked and no activation, budget, consent, subscription or money change was made.

## Scoped changes

- SL-01: the existing progressive menu wrapper materializes pending eligibility once per read and joins those rows to the slots. Time/cutoff predicates, helper volatility, output fields/order, candidates, publication provenance, fixed identities and permissions stay intact. No long-lived cache or participant/commissioner mode matrix is added.
- SL-02: one React request-local base state is shared by the shell and pages. Schedule, standings/rules, history, historical matchups, rivalry, playoffs and receipt pages skip the separate current props-menu and quote-head calls. Event status, current phase, bound rules, owner receipts and reset history remain available.
- Current Matchup, Make picks and owner draft presentation retain enriched quotes. Menu/quote heads run independently after the existing authorized base lookup. Matchup operations, playoff context and matchup cards run together after their required league/week inputs.
- Review preflight reads only league/mode, the applicable immutable rules snapshot, week closure and the caller's effective accepted count/allocation. It still rejects invalid requests before acquisition. Final provider acquisition, review proof, changed-term acknowledgement and receipt acceptance are unchanged. The additive read has a narrow missing-function fallback for compatible Preview and rollout; access failures never fall back.

The general base-state RPC is retained. No historical data, acceptance authority, quote reconciliation, refresh cadence, rendering architecture, or provider path was rewritten. The optional participant-only menu split is deferred unless remaining processing/payload measurements justify a second public contract.

## Verification and comparisons

The existing required Acceptance contract remains intact, with an added read-only Stage 2 body/privilege parity check and generated signature check. Local formatting, lint, strict types, unit tests and production build are used during development; disposable native Postgres/Auth and browser execution use the existing CI lane because Docker/Postgres are unavailable in this workspace.

The retained [Stage 1 evidence](evidence/stage1-2026-09-16/README.md) is the before reference. The same worker-created complete/pending leagues, ten-member roster, sixteen games, ninety-six slots, commissioner/participant role, stored Week 2 history and 0–4 desktop / 5–9 mobile starting receipt sequence are used after the change. Five core-action samples per condition use a production build. Desktop is Chromium 1440×900 unthrottled. Mobile is Chromium 390×844, DPR 3, touch, 150 ms latency, 1.6 Mbps down, 750 Kbps up and 4× CPU slowdown. Fresh browser does not imply a cold database/server. Provider cache misses use the same synthetic 500 ms delay. Prefetch and measurement-span limitations remain unchanged.

Additional SQL comparison alternates the exact Stage 1 and new menu body in rolled-back disposable transactions on the same fixture. First executions and five repeats remain separate. It checks exact commissioner/member output equality before and after kickoff, denial outside the league, unchanged function privileges, and exact preflight parity with the full authorized state. Inner projection plans identify the repeated work independently of RPC latency. Each real measured submission verifies the smaller read's effective receipt count and allocation. Existing privacy, historical-rules, changed-term, expiry-recovery, draft/scroll, manual/automatic publication and native concurrency gates still apply.

Results, final executable/tree, CI and artifact references: pending completion. No speedup is claimed from unexecuted tests. Browser measurements are lab observations, not physical-device or authenticated Production timings; provider delay is synthetic. Rendering data is retained for Stage 3 without profiling or changes here.

## Deployment and recovery

One new migration: `20260916221007_stage2_read_performance.sql`, generated by Supabase CLI 2.116.0. It replaces only `private.get_player_prop_menu_before_automation(text)` and adds `api.get_card_review_context(text)`. Old public menu/state/review/submission contracts remain callable. The private wrapper remains inaccessible to anon/authenticated/service roles; the new member preflight permits only authenticated execution, with explicit membership and caller-entry checks and an empty search path.

After owner release approval:

1. Refresh only relevant main/Production changes and the two affected signatures. Confirm the candidate tree and required Acceptance evidence. Do not repeat the odds-refresh rollout.
2. Install only this forward migration on `nxikkhtaercmbuyrlyio`; retain existing history. If the hosted installer assigns a timestamp, align the still-unmerged filename/record without changing tested SQL bytes or reapplying an installed version.
3. Require `supabase/operations/stage2-read-parity.sql` to return true. Reuse the unchanged Stage 1 repair and 22-function shared-odds parity checks. Compare existing limits, consent and scheduler metadata without invoking workers or manufacturing bets.
4. Merge the tested PR and verify the resulting Production deployment on Vercel project `prj_k1ILOuL7pKVand1qVNfZj8oij6sI`, aliases, public sign-in, and available natural error logs. Hosted live mutation/performance probes are excluded.

Migration-first is preferred: the old app accepts the identical menu contract and ignores the new endpoint. The new app is also compatible with the old database via the missing-function fallback, which retains all preflight checks but does not provide the full preflight speed gain.

For an application regression, return the frontend to the previous known-good release while leaving this compatible database migration installed. Do not delete migration history or touch receipts, rules/results, identities, approvals or counters. For a confirmed menu-query regression, create a new forward repair restoring the exact prior wrapper body retained in `tests/fixtures/stage2-menu-before.sql`, validate it in the disposable lane, and retain the added endpoint and privileges. For a preflight defect, use the compatible prior frontend pending a forward repair; never bypass checks to keep review moving. Recovery execution requires applicable release authorization.

## Findings and Stage 3

SL-01/SL-02: implementation under verification. SL-03/SL-08: Stage 1 completed; retained protection/baseline reused. SL-04/SL-05/SL-06/SL-07/SL-09: deferred to Stage 3. No Stage 3 work has begun. Start Stage 3 only after Stage 2's relevant changes are merged and its approved rollout is verified.

> Execute Stage 3 of SUNDAY-LEDGER-SIMPLIFICATION-AND-SPEED-HANDOFF-2026-09-16.md, Version 1.0, following its common execution contract and the final Stage 2 status. First verify PR #72's actual merge/deployment/migration outcome and refresh only relevant current differences. Reuse the retained Stage 1/2 evidence. Selectively simplify quote reconciliation, safe diagnostics and contributor navigation, and reassess provider overlap only where it removes meaningful duplication. Profile stake editing before any rendering change. Preserve all authority, review/changed-term consent, privacy, receipts, historical rules/results, fixed identities, season consent and provider-budget protections. Complete authorized PR/Preview and concrete rollout preparation; obtain only remaining release approval once verified. Do not restart the comprehensive audit or odds rollout.
