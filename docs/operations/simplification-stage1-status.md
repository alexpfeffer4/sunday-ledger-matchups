# Simplification and speed — Stage 1 status

September 16, 2026. Workspace reconnected and all local implementation files were recovered. Stage 1 implementation is now published for disposable verification; results remain pending. Stage 2 must not start.

## Verified baseline

- Current main: `6404b35a125d7b8b2ce737ccc92b9351cfa2db5d`, September 16 at 18:30:48 UTC, following odds-refresh PRs #69 and #70. No open PRs at initial inspection. Main was unchanged at the last remote recheck.
- Production: READY deployment `dpl_ArE4Uz45i3Q4aqWa4rgni1JHpcSp`, exact same commit, both ledgerleagues.com domains assigned.
- Hosted migration `20260916181542_shared_background_odds_refresh` is installed. All 22 expected effective shared-refresh function hashes match. The repaired schedule-completion function uses the corrected game_record/item aliases.
- At 18:36 UTC background refresh and polling were enabled, revision 2, with the same release SHA. The natural 18:35 scheduled run finished at 18:35:24; 51 application rows were observed. This was read-only evidence, not a worker invocation.
- Overall credit caps remain 2,000/day and 18,000/month. Background caps are 1,300/day and 13,500/month. Provider reserve remains 2,000; protected core credits remain 350/day and 2,000/month. No spending or subscription change.
- The five-minute cron is active. Existing standing consent remains enabled, not revoked, effective from Week 3. The attached season-automation record is earlier than the completed odds rollout; its activation/history and the audit's missing-migration statement must not trigger another rollout.

## Candidate and verification in progress

PR [#71](https://github.com/alexpfeffer4/sunday-ledger-matchups/pull/71), branch `codex/simplification-stage1-verification`, is draft and unmerged. The workspace reconnected on the next user turn and all implementation files survived; no outage cause was established. The former offline checkpoint is historical.

The real worker scenario exposed a product defect before external acquisition: `api.claim_season_automation_odds(uuid)` declared a local `id` and then used unqualified `seasons.id`. The runner labeled that SQL error `PROVIDER_BUDGET`. Read-only hosted inspection confirmed the same active body. The separate repair commit is `de07a33522d31ee8b13c7c57e838f081da60d0b6`; its focused database regression subsequently passed, including one request, a three-credit reservation and unchanged cooldown. Earlier fixture corrections concerned roster construction, five-minute checkpoint progression and the raw provider event-list response.

Pending forward migration: `20260916192632_season_automation_odds_claim_alias.sql`, generated with Supabase CLI 2.116.0. It changes only that function's ambiguous local/column names and preserves signature, service-only access, readiness, lease fences, cooldown and budget reservation. The earlier candidate filename was never installed in Production and was replaced with the CLI-generated filename. Existing applied migration history is unchanged.

`supabase/operations/stage1-preparation-parity.sql` is a read-only exact body/configuration/permission check. The expected function-body SHA-256 is `b1a3280051b6a95ef4d141237e19c3fc7346bda22c413c1f10b5102c1f14690c`. The existing 22-function shared-odds parity check remains unchanged.

At 19:21:56 UTC, existing season consent was still enabled, not revoked or suspended, effective from Week 3, with zero attempts and last outcome `SCHEDULE_READY`. No hosted worker or provider was invoked to inspect it.

## Method and outstanding results

The new lane uses the existing fresh disposable Supabase/Auth/mail stack and production app build. It begins with approved source policy, a locked ten-member roster, one standing consent and stored prior Week 2 finality. The older four-card/two-matchup fixture retains its real acceptance/reset audit as historical input; synthetic prior kickoff evidence and the existing result authority supply its final results. It does not insert the resulting Week 3, week plan, successful run or SYSTEM validation. Real HTTP worker calls perform sync, acquisition, PREPARE, catalog processing, validation and opening. Only fixture waiting timestamps are advanced between five-minute checkpoints; no production clock or authority function is replaced.

The established fixture disables outbound scheduler dispatch in its disposable database. The tested HTTP workers, lifecycle claims/completions, validation and opening functions remain real. This prevents unrequested dispatch traffic while the scenario controls each checkpoint.

The normal workload is sixteen games, ninety-six slots and ten member cards. Complete and pending identity menus run on separate fresh stacks with the same source/build configuration; their distinct raw provider worlds must not collide on globally unique NFL event mappings. Prices age normally. Each browser sample starts without drafts, edits/submits one 50-credit bet, and grows the owner's receipt count from zero to ten across the five desktop and five mobile runs. Desktop therefore starts with 0–4 current receipts and mobile with 5–9. These sequences support matching before/after comparisons, not attribution of every desktop/mobile difference to the device condition. History is the stored Week 2 fixture, not a populated eighteen-week archive. Earlier receipt fingerprints must remain unchanged.

Desktop is Chromium 1440×900 without throttling. Mobile is Chromium 390×844, DPR 3, touch, 150 ms latency, 1.6 Mbps download, 750 Kbps upload and 4× CPU slowdown. A cold visit means a fresh authenticated browser context; server/database processes are warm. Five samples support medians/ranges, not percentiles. Cache misses use a stated synthetic 500 ms provider delay. Paused-edit focus deliberately waits 1.1 seconds to observe behavior. Review-expiration recovery waits for the real stored 30-second expiry outside the timed span, then changes provider terms again and requires explicit confirmation; immutable review records are not modified. Existing same-economics submission-intent renewal behavior is preserved. WebKit/mobile compatibility remains in the existing required lanes.

A separately labeled 15-game/90-slot Sunday/Monday calendar profile is used only when an all-games week is not yet due. Its complete 272-game source schedule includes an earlier Thursday game excluded by that existing preset. This keeps actual readiness/opening guards intact without changing a resulting plan or the database clock. Monday-only and Sunday/Monday samples are labeled separately. Compare only matching game count, calendar profile, menu state, build and emulation settings.

Artifacts: `stage1-samples.jsonl`, `stage1-summary.json`/`.md`, per-menu `stage1-query-plans-*.json`, preparation/replay evidence and viewport screenshots in the `stage1-baseline-complete` and `stage1-baseline-pending` Actions artifacts. Database EXPLAIN executions are separate from application RPC latency. Top-level function plans do not identify a particular nested SQL subexpression as the bottleneck. Browser response bytes and long-task/LCP/layout-shift/event observations are lab evidence, not field Web Vitals or a physical phone result.

Byte bookkeeping waits at most one second after the visible frame; unavailable response sizes stay null, and known-byte totals are lower bounds when any size is unknown. RPC counts are completed process-log calls during the timed span and can include automatic prefetch or an earlier in-flight read. Refresh observations activate the actual React control by DOM click to avoid Playwright scrolling that button into view; the RSC request and before/after scroll positions are retained.

Real preparation/opening and the full repeated baseline are still being verified. No speed measurements, full Stage 1 completion, or readiness for Stage 2 are claimed yet. The final relevant revision must pass the required Acceptance contract, including zero-skipped full-stack scenarios and the new repair parity check.

## Prepared rollout and recovery

After verification, request approval for the exact PR merge/automatic frontend deployment and the single migration. Current and candidate frontend callers have identical RPC contracts, so either app/database order is compatible. Prefer applying the reviewed migration and verifying its parity before merging. No new activation or cap change is required. If the hosted migration tool assigns its installation timestamp, record that exact version and align the still-unmerged filename before merging; preserve its SQL bytes and reuse same-body evidence.

Immediately before installation, recheck current main and relevant function/migration drift. Apply only this repair through the established migration flow, verify the new read-only parity check and existing shared-odds parity, then observe already scheduled work when naturally due. Do not manufacture a live run, submission or provider sample. If automation becomes suspended before installation, inspect its recorded cause; any owner RETRY uses the existing command and requires specific release authorization. Do not alter stored consent or failure timestamps directly.

Recovery never deletes weeks, accepted bets, receipts, consent or migration history. If the repaired path encounters another blocker, retain its evidence; use the existing commissioner pause only under applicable authorization, and prepare another small forward repair. Reverting the frontend test/harness change does not undo the database function. Reinstalling the ambiguous body would knowingly restore the acquisition failure and is not the normal recovery path.

## Findings and next stage

- SL-03: real uncovered acquisition defect identified and repaired in the candidate; complete end-to-end proof pending.
- SL-08: reproducible measurement harness implemented; completed observations pending.
- SL-01/02: read/query optimization deferred to Stage 2, using completed comparable measurements and targeted plans.
- SL-04/05/06/07/09: deferred to Stage 3. The generic `PROVIDER_BUDGET` label is diagnostic evidence for SL-07, not a new diagnostics project here.

Do not begin Stage 2. Once Stage 1 passes, merges and its approved release is complete, use Version 1.0's Stage 2 prompt with this final status, exact merged commit, final CI/artifact references and observed migration/rollout result. Refresh only relevant differences; preserve every receipt, privacy, rules, consent and budget safeguard. Do not rerun the odds rollout or comprehensive audit.

### Next prompt — only after the approved Stage 1 release finishes

> Execute Stage 2 of SUNDAY-LEDGER-SIMPLIFICATION-AND-SPEED-HANDOFF-2026-09-16.md, Version 1.0, following its common execution contract and the latest `docs/operations/simplification-stage1-status.md`. Repository: https://github.com/alexpfeffer4/sunday-ledger-matchups.
>
> First confirm PR #71 is merged and its single preparation repair migration and applicable release verification are complete. Use the recorded merged commit, installed migration version, effective-function parity and Stage 1 evidence. Refresh only relevant current-main and rollout differences; do not repeat the comprehensive audit or automatic odds-refresh rollout.
>
> Implement the smallest measured improvements to the props-menu read, independent request scheduling and unnecessarily broad page/review contexts. Skip resolved findings. Compare the same Stage 1 menu profile, receipt sequence, build mode and declared desktop/mobile conditions before and after. Preserve authorization, event privacy, final review, explicit changed-term acceptance, immutable receipts, historical rules/results, draft stability, fixed player identities, consent and provider-budget protections. Do not promise a speedup before measuring it or add speculative caching/rendering architecture.
>
> Complete scoped implementation, required verification, a focused PR, compatible Preview work and concrete migration/deployment/recovery preparation without routine confirmations. Use disposable mutation/provider fixtures. This authorizes Stage 2 implementation and PR/Preview work, not merging or Production changes; honor further explicit authorization in that conversation, otherwise request only the remaining release approval after verification. Finish with results, limitations and a Stage 3 status record. Do not begin Stage 3.
