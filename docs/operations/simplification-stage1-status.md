# Simplification and speed — Stage 1 status

September 16, 2026. Workspace reconnected and all local implementation files were recovered. Stage 1 implementation is now published for disposable verification; results remain pending. Stage 2 must not start.

## Verified baseline

- Current main: `6404b35a125d7b8b2ce737ccc92b9351cfa2db5d`, September 16 at 18:30:48 UTC, following odds-refresh PRs #69 and #70. No open PRs at initial inspection. Main was unchanged at the last remote recheck.
- Production: READY deployment `dpl_ArE4Uz45i3Q4aqWa4rgni1JHpcSp`, exact same commit, both ledgerleagues.com domains assigned.
- Hosted migration `20260916181542_shared_background_odds_refresh` is installed. All 22 expected effective shared-refresh function hashes match. The repaired schedule-completion function uses the corrected game_record/item aliases.
- At 18:36 UTC background refresh and polling were enabled, revision 2, with the same release SHA. The natural 18:35 scheduled run finished at 18:35:24; 51 application rows were observed. This was read-only evidence, not a worker invocation.
- Overall credit caps remain 2,000/day and 18,000/month. Background caps are 1,300/day and 13,500/month. Provider reserve remains 2,000; protected core credits remain 350/day and 2,000/month. No spending or subscription change.
- The five-minute cron is active. Existing standing consent remains enabled, not revoked, effective from Week 3. The attached season-automation record is earlier than the completed odds rollout; its activation/history and the audit's missing-migration statement must not trigger another rollout.

## Remaining work

SL-03 remains an actual gap: the existing automation_stage helper directly imports/publishes a future week, inserts its plan and marks PREPARE successful. Existing successful schedule completion coverage must remain.

Required regression: real HTTP worker/runner, actual claim and PREPARE completion, raw substituted 272-game schedule and complete selected-week markets; failure without partial effects, retry/replay without duplicates, normal catalog processing, SYSTEM validation and opening. Fixture prerequisites must explicitly identify prior-week finality and existing consent. Do not seed resulting weeks, plans, successful run markers or validation evidence.

Required measurements: representative ten-member league, sixteen games and ninety-six slots, both complete and pending menus. Five primary samples per declared desktop/mobile condition, cold browser and repeat separately, median/range and raw observations. Cover navigation, props/game filters, selection/stake editing, review cache hit/miss/changed terms/expiration, accepted receipts, standings/history and passive-refresh stability. Measure database execution/plans separately from RPC latency. Keep existing WebKit/mobile compatibility gates.

Suggested lab settings: Chromium desktop 1440×900 unthrottled; mobile Chromium 390×844, DPR 3, 150 ms latency, 1.6 Mbps down/750 Kbps up and 4× CPU slowdown. Declare synthetic provider delay and browser emulation. No physical-device, hosted authenticated performance or field Web Vitals claim.

## Recovered interruption (historical)

Local implementation was written on branch `codex/simplification-stage1-verification`, based on the main SHA above, but was not committed or pushed before the workspace disconnected. The local executor repeatedly returned `409 Conflict, environment_offline: Environment is not connected`. The unavailable workspace prevents retrieving the exact changes, completing local checks and publishing them into the disposable CI lane.

Written but unexecuted files were tests/fixtures/stage1-baseline.ts, tests/fixtures/stage1-measurements.ts, tests/e2e/stage1-baseline-full-stack.spec.ts, scripts/summarize-stage1-baseline.mjs, plus provider-preload and Acceptance workflow edits. Do not treat those files as verified or assume they survive environment recovery. Preliminary route type generation/TypeScript completed; a lint warning was corrected but not rerun. Unit-test completion was not retrieved. No database/browser execution or realistic timing results are claimed.

No implementation PR, migration, Production deployment/configuration, provider acquisition, live data mutation or Stage 2 work was completed. This status-only checkpoint preserves verified facts; it does not satisfy Stage 1.

## Resume

Restore/reopen the workspace or start a fresh implementation workspace. Fetch current main and inspect this status plus the original Version 1.0 handoff. Recover the local branch if present; otherwise reconstruct the bounded test/harness work. Refresh only relevant changes since the SHA above. Do not repeat the odds rollout or comprehensive audit.

Complete Stage 1 implementation, execute the existing disposable CI lane, resolve actual failures, and publish one reviewable verification PR with full required Acceptance, applicable Preview metadata and retained baseline artifacts. Produce the final Stage 2 status only after the meaningful paths run successfully. Stage 2 remains unauthorized in this task.

A test/documentation-only release needs no database deployment. Merge remains a separate owner decision under the common execution contract. Recovery is a revert of test/harness changes, never a reset of bets, receipts, season consent or installed migration history.

## Recovery update

The next user turn restored executor connectivity. All six implementation/harness files survived. Current cgroup counters report no out-of-memory kill, but they do not identify the connection outage cause. The recovered implementation is on this same PR; the earlier status-only warning is historical. Required database/browser execution remains pending.
