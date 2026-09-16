# Simplification and speed — Stage 1 status

September 16, 2026, final verification observed at 20:47 UTC. Stage 1 implementation and required verification passed; PR #71 is ready for review. Production release awaits the specific approval below. Stage 2 must not start. The workspace reconnected with all implementation files intact; no outage cause was established.

## Verified baseline

- Current main: `6404b35a125d7b8b2ce737ccc92b9351cfa2db5d`, September 16 at 18:30:48 UTC, following odds-refresh PRs #69 and #70. No open PRs at initial inspection. Main was unchanged at the last remote recheck.
- Production: READY deployment `dpl_ArE4Uz45i3Q4aqWa4rgni1JHpcSp`, exact same commit, both ledgerleagues.com domains assigned.
- Hosted migration `20260916181542_shared_background_odds_refresh` is installed. All 22 expected effective shared-refresh function hashes match. The repaired schedule-completion function uses the corrected game_record/item aliases.
- At 18:36 UTC background refresh and polling were enabled, revision 2, with the same release SHA. The natural 18:35 scheduled run finished at 18:35:24; 51 application rows were observed. This was read-only evidence, not a worker invocation.
- Overall credit caps remain 2,000/day and 18,000/month. Background caps are 1,300/day and 13,500/month. Provider reserve remains 2,000; protected core credits remain 350/day and 2,000/month. No spending or subscription change.
- The five-minute cron is active. Existing standing consent remains enabled, not revoked, effective from Week 3. The attached season-automation record is earlier than the completed odds rollout; its activation/history and the audit's missing-migration statement must not trigger another rollout.

## Candidate and verification

PR [#71](https://github.com/alexpfeffer4/sunday-ledger-matchups/pull/71), branch `codex/simplification-stage1-verification`, is unmerged. Tested implementation: `b175c419bf2bae79e94cacc615b6a2b70d9647cf`, tree `5a2741f6b547e971e0e008dde29aad4867eb7cb1`. The CI merge commit `c95aad1302a93c6884d9d122db718be21e81a0ea` has exactly that same tree. Subsequent documentation/evidence changes do not alter the tested implementation, workflow, dependencies or migration bytes.

[Acceptance run 35145836752, attempt 2](https://github.com/alexpfeffer4/sunday-ledger-matchups/actions/runs/35145836752/attempts/2) and its aggregate **Acceptance complete** passed. Evidence covers quality (999 tests across 123 files, formatting/lint/types and production build), all 2,450 pgTAP assertions across 59 files, both release-parity checks, generated database signatures, all eight native concurrency scripts, existing desktop/mobile full-stack journeys, shared Chromium/WebKit UI, and both new preparation/baseline jobs. The new scenarios each executed once with zero skips or retries in attempt 1; their passing evidence was reused in attempt 2. The original mobile job encountered `Invalid schema: api` while provisioning immediately after a disposable reset. Only failed jobs were retried on the same implementation; mobile provisioning and all subsequent checks passed. This supports a transient setup failure, without establishing its underlying cause. No existing gate was weakened. Final documentation/evidence packaging passed repository formatting, diff checks, raw-byte/hash validation and inspection; it changes no tested executable source. Its automatic successor CI may run, but is not a new benchmark campaign or substitute for these exact implementation results.

Applicable [fixture Preview](https://sunday-ledger-matchups-o13qvxfzi-pfeffer.vercel.app/preview/season-automation): READY deployment `dpl_GmGDcpxWwEym8n2RmcjCFvVgXrMS`, implementation `b175c419bf2bae79e94cacc615b6a2b70d9647cf`. The existing protected-preview access flow returned HTTP 200 at 20:28 UTC with the expected season-automation title/content. All four disposable desktop/mobile screenshots were inspected. This is a fixture Preview, not an authenticated hosted benchmark or Production activation.

The real worker scenario exposed a product defect before external acquisition: `api.claim_season_automation_odds(uuid)` declared a local `id` and then used unqualified `seasons.id`. The runner labeled that SQL error `PROVIDER_BUDGET`. Read-only hosted inspection confirmed the same active body. The separate repair commit is `de07a33522d31ee8b13c7c57e838f081da60d0b6`; its focused database regression subsequently passed, including one request, a three-credit reservation and unchanged cooldown. Earlier fixture corrections concerned roster construction, five-minute checkpoint progression and the raw provider event-list response.

Pending forward migration: `20260916192632_season_automation_odds_claim_alias.sql`, generated with Supabase CLI 2.116.0. It changes only that function's ambiguous local/column names and preserves signature, service-only access, readiness, lease fences, cooldown and budget reservation. The earlier candidate filename was never installed in Production and was replaced with the CLI-generated filename. Existing applied migration history is unchanged.

`supabase/operations/stage1-preparation-parity.sql` is a read-only exact body/configuration/permission check. The expected function-body SHA-256 is `b1a3280051b6a95ef4d141237e19c3fc7346bda22c413c1f10b5102c1f14690c`. The existing 22-function shared-odds parity check remains unchanged.

At the final 20:40 UTC read, the latest hosted migration was still `20260916181542`; the active claim body remained `08dc75ee530055a8d4b504de7917b4e695104673ac4394fcf4ffcee365fb5b76`. Existing consent remained enabled, not revoked or suspended, with zero attempts and last outcome `SCHEDULE_READY`. Main and Production were unchanged. No hosted worker or provider was invoked to inspect them.

## Method and results

The new lane uses the existing fresh disposable Supabase/Auth/mail stack and production app build. It begins with approved source policy, a locked ten-member roster, one standing consent and stored prior Week 2 finality. The older four-card/two-matchup fixture retains its real acceptance/reset audit as historical input; synthetic prior kickoff evidence and the existing result authority supply its final results. It does not insert the resulting Week 3, week plan, successful run or SYSTEM validation. Real HTTP worker calls perform sync, acquisition, PREPARE, catalog processing, validation and opening. Only fixture waiting timestamps are advanced between five-minute checkpoints; no production clock or authority function is replaced.

The established fixture disables outbound scheduler dispatch in its disposable database. The tested HTTP workers, lifecycle claims/completions, validation and opening functions remain real. This prevents unrequested dispatch traffic while the scenario controls each checkpoint.

The normal workload is sixteen games, ninety-six slots and ten member cards. The measured identity is the commissioner, also an active participant; ordinary-member timing is not separately established. Complete and pending identity menus run on separate fresh stacks with the same source/build configuration; their distinct raw provider worlds must not collide on globally unique NFL event mappings. Prices age normally. Each browser sample starts without drafts, edits/submits one 50-credit bet, and grows the owner's receipt count from zero to ten across the five desktop and five mobile runs. Desktop therefore starts with 0–4 current receipts and mobile with 5–9. These sequences support matching before/after comparisons, not attribution of every desktop/mobile difference to the device condition. History is the stored Week 2 fixture, not a populated eighteen-week archive. Earlier receipt fingerprints must remain unchanged.

Desktop is Chromium 1440×900 without throttling. Mobile is Chromium 390×844, DPR 3, touch, 150 ms latency, 1.6 Mbps download, 750 Kbps upload and 4× CPU slowdown. A cold visit means a fresh authenticated browser context; server/database processes are warm. Five samples support medians/ranges, not percentiles. Cache misses use a stated synthetic 500 ms provider delay. Paused-edit focus deliberately waits 1.1 seconds to observe behavior. Review-expiration recovery waits for the real stored 30-second expiry outside the timed span, then changes provider terms again and requires explicit confirmation; immutable review records are not modified. Existing same-economics submission-intent renewal behavior is preserved. WebKit/mobile compatibility remains in the existing required lanes.

A separately labeled 15-game/90-slot Sunday/Monday calendar profile is used only when an all-games week is not yet due. Its complete 272-game source schedule includes an earlier Thursday game excluded by that existing preset. This keeps actual readiness/opening guards intact without changing a resulting plan or the database clock. Monday-only and Sunday/Monday samples are labeled separately. Compare only matching game count, calendar profile, menu state, build and emulation settings.

Artifacts: `stage1-samples.jsonl`, `stage1-summary.json`/`.md`, per-menu `stage1-query-plans-*.json`, preparation/replay evidence and viewport screenshots in the `stage1-baseline-complete` and `stage1-baseline-pending` Actions artifacts. Database EXPLAIN executions are separate from application RPC latency. Top-level function plans do not identify a particular nested SQL subexpression as the bottleneck. Browser response bytes and long-task/LCP/layout-shift/event observations are lab evidence, not field Web Vitals or a physical phone result.

Byte bookkeeping waits at most one second after the visible frame; unavailable response sizes stay null, and known-byte totals are lower bounds when any size is unknown. RPC counts are completed process-log calls during the timed span and can include automatic prefetch or an earlier in-flight read. Refresh observations activate the actual React control by DOM click to avoid Playwright scrolling that button into view; the RSC request and before/after scroll positions are retained.

Both scenarios passed: incomplete market acquisition left zero resulting weeks/plans while retaining the valid 272-game schedule; actual retry prepared, cataloged, SYSTEM-validated and opened one Week 3. Each had sixteen games, ninety-six slots, ten cards, one consent, one SYSTEM validation and zero human validations. Complete had 96 published identities; pending had 60 published/36 pending. Idle-worker and completion replay left counts unchanged. All prior receipt fingerprints were unchanged. Twenty measured 50-credit submissions across both scenarios produced twenty real disposable receipts; four natural-expiry recovery checks required renewed acceptance of changed terms. All twenty observed refreshes retained their scroll position.

The final measured profile was `16g-96s-sun-mon`, `ALL_NFL_GAMES`, with no alternate calendar profile. There are **364 raw observations**: five per core action in each of four menu/device conditions, plus one expiration-recovery observation per condition. Times below are median (minimum–maximum), in milliseconds.

| Condition                   | Fresh browser → matchup |    Repeat matchup | Cached review → confirmable |   Confirm → receipt |
| --------------------------- | ----------------------: | ----------------: | --------------------------: | ------------------: |
| Complete / desktop          |           470 (462–486) |     476 (456–515) |               390 (351–393) |       369 (357–404) |
| Pending / desktop           |           751 (455–777) |     426 (367–721) |              983 (496–1011) |       855 (849–864) |
| Complete / mobile emulation |     2,638 (2,621–2,680) | 1,067 (977–1,233) |               776 (707–903) | 1,068 (1,064–1,630) |
| Pending / mobile emulation  |     2,662 (2,640–2,680) |   993 (963–1,063) |               869 (792–967) | 1,601 (1,050–1,958) |

Fresh-browser entry used a median eight completed RPCs in every condition. Median observed Resource Timing transfer was 412,013 / 421,726 desktop bytes and 405,990 / 405,153 mobile bytes for complete/pending respectively. Cached review used median 7/8 RPCs for complete/pending and no provider request. Synthetic 500 ms provider-miss review medians were 1,073 / 1,064 desktop ms and 1,739 / 2,018 mobile ms. These do not measure real provider latency. Full action timing/count/byte ranges, raw browser observations and plans are retained in [the evidence directory](evidence/stage1-2026-09-16/README.md).

PostgreSQL repeat menu medians were 24.805 ms complete (24.711–25.316) and 169.630 ms pending (169.078–172.274). State-read medians were 54.369 / 34.769 ms; quote-head medians 7.727 / 4.723 ms. Separate CI machines prevent treating these differences alone as a controlled causal comparison. The pending-menu path merits Stage 2 inspection, with matching-fixture before/after plans; no internal expression has been proven responsible yet.

Mobile stake editing took median 848 ms complete and 594 ms pending, with four/three long tasks per sample and maximum individual tasks of 145/103 ms. Keep rendering profiling for Stage 3. This stage establishes the baseline and reliability repair; it makes no frontend speedup claim.

Retained evidence includes byte-exact compressed raw observations, CI summary values, plans, preparation/scroll proof and four screenshots. Original artifacts: `stage1-baseline-complete` ID `10467577993`, SHA-256 `ab7506897ad1fc11a001f7c0f857a09003a95ee54695ff941ff71a2f9a2679a0`; `stage1-baseline-pending` ID `10467288916`, SHA-256 `c7464a08621bc2aa80180e7ee7cd20c1f580ccbf13c7ffc933bb51fc2e394b81`. Their ZIP digests were verified; the retained manifest hashes every included file. Full authentication reports/traces are excluded. Limits remain: small sample, warm servers, synthetic provider delay, emulated mobile, commissioner identity, modest receipt/history size, cache/prefetch overlap and incomplete byte observations. No production performance or physical-device claim is made.

## Prepared rollout and recovery

### Approved release follow-up

The owner explicitly approved the single migration, merge and deployment after
the PR explanation on September 16. This supersedes the pending-approval text
below. Final-head run `35148834219` passed every group except the existing desktop
shared-odds test, which started after reset before `ensure_profile` was visible in
PostgREST's schema cache. This repeated the earlier disposable reset race. A small
test-infrastructure follow-up now reloads and waits for the loopback API's schema
after both browser-lane resets; four focused tests cover delayed readiness,
authorization failure, timeout and rejection of hosted targets. It neither retries
failed product actions nor changes Production behavior. Release verification for
this follow-up is in progress; the approved migration SQL bytes remain unchanged.

Target: Supabase project `nxikkhtaercmbuyrlyio`, and the existing Vercel project `prj_k1ILOuL7pKVand1qVNfZj8oij6sI` serving ledgerleagues.com. No other environment is part of the release.

The handoff's common execution contract requires owner approval for **PR #71 merge/automatic frontend deployment and the single migration** after verification. No such release approval has been given in this conversation. The exact candidate file SHA-256 is `256a24cd5c7ffe53eb8b1c7a1af669a5724bc05a7bd34b414c052326686f7963`; its expected function-body hash is recorded above. Current and candidate frontend callers have identical RPC contracts, so either app/database order is compatible. Prefer applying the reviewed migration and verifying its parity before merging. No new activation or cap change is required. Preserve the existing odds-release marker/configuration: the 22 unchanged function bodies, rather than a new test/documentation commit SHA, establish compatibility. If the hosted migration tool assigns its installation timestamp, record that exact version and align the still-unmerged filename before merging; preserve its SQL bytes and reuse same-body evidence.

Immediately before installation, recheck current main and relevant function/migration drift. Apply only this repair through the established migration flow, verify the new read-only parity check and existing shared-odds parity, then observe already scheduled work when naturally due. Do not manufacture a live run, submission or provider sample. If automation becomes suspended before installation, inspect its recorded cause; any owner RETRY uses the existing command and requires specific release authorization. Do not alter stored consent or failure timestamps directly.

Recovery never deletes weeks, accepted bets, receipts, consent or migration history. If the repaired path encounters another blocker, retain its evidence; use the existing commissioner pause only under applicable authorization, and prepare another small forward repair. Reverting the frontend test/harness change does not undo the database function. Reinstalling the ambiguous body would knowingly restore the acquisition failure and is not the normal recovery path.

## Findings and next stage

- SL-03: actual acquisition/PREPARE/validation/opening regression passes; uncovered acquisition defect repaired and verified in the candidate. Production installation remains pending.
- SL-08: baseline established with 364 observations, representative complete/pending menus, desktop/mobile conditions and repeated PostgreSQL plans. Stated lab/role/history limits remain.
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
