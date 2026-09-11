# Audit Stage 6 — completion and Stage 7 handoff

Scope: A11–A12. Implementation is ready for review in [PR #36](https://github.com/alexpfeffer4/sunday-ledger-matchups/pull/36), branch `audit/stage6-governing-rules`. Merge and Production rollout remain separately authorized steps.

Base main and observed Production: `5cd991b71c2cf093bb54a828882052734d9eaf37` (PR #35). Stage 6 is not deployed. Read the [current source index](governance/current-source-index.md) and [dated governing addendum](governance/2026-09-11-governing-addendum.md) with the six preserved historical sources.

## Completed scope

The index and versioned addendum reconcile the already approved V1.2 / Product Bible 3.1 amendment, private owner rehearsal, B+A identity, completed phases, audit Stages 1–5, bounded quote/score operations and account delivery. No new numerical rule, decision identifier, public rehearsal, social feature or broad analytics approval is introduced.

Card validation receives the snapshot referenced by its actual season. The finite V1.0/V1.1/V1.2 boundary checks stored/canonical identity, frozen state and exact implemented card blocks. The builder, progress, review action and seal action consume those constraints. Missing, unknown, mismatched or unsupported context pauses writes with a clear message; device draft bytes and authorized receipt/history reads remain available.

SQL independently checks the persisted snapshot and derives allocation, minimum/count, market and favorite-cap limits. Existing membership, freshness, event-start, replay, rehearsal and immutable receipt protections remain in the shared engine. Frozen V1.1 keeps All-play history; V1.2 remains prospective. No frozen row or receipt is rewritten.

## Verification

Observed on implementation/test head `01aa594a907a6547972628143bcac2563ac82aa2` in [Phase 8C run 34642257789](https://github.com/alexpfeffer4/sunday-ledger-matchups/actions/runs/34642257789). The completion commit changes this documentation only; the PR checks and description identify its final head.

| Gate                   | Observed result                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------- |
| Quality/build          | Formatting, lint, strict types, identity verification and production build passed     |
| Unit/property          | 429 tests across 71 files                                                             |
| Database               | 889 pgTAP assertions across 25 files; clean migrations and 18 API signatures verified |
| Desktop full-stack     | 12 passed; no skips or retries                                                        |
| Mobile WebKit auth     | 8 passed; no skips or retries                                                         |
| Shared UI              | Chromium 61 passed; WebKit 60 passed and 1 existing forced-colors skip                |
| Other acceptance gates | Phase 6 browser, Phase 8A database and Phase 8B browser/database passed               |

Historical/current browser cases use real disposable Auth, server actions, RSC, quote reviews, sealing, replay and receipts. SQL vectors exercise exact allocation, the -200/750 boundary, 50-credit minimum, 20-pick maximum, whole-credit stakes, immutable receipt linkage and malformed/unknown context. Existing privacy, scoring, full-season and rehearsal suites remain required. The rehearsal browser test retains the real server RSC body while forwarding that response unchanged, avoiding Chrome response-body eviction; all HTML/RSC/storage privacy assertions are retained. The added historical case repeats the complete card journey; the original global scheduler/score scenario still runs once under current V1.2, preserving provider-lease isolation.

The workspace disconnected during implementation. The final branch was prepared through GitHub and verified in disposable CI; no local result is claimed for the unfinished scratch checkout. The temporary formatting-capture workflow change was removed. Final changes retain the standard CI gates. Synthetic historical fixtures alter only their newly created disposable data and restore the named immutability guards before acceptance assertions; no Production mutation is test evidence.

## Migration and rollout

New migration: `20260911190616_enforce_frozen_card_rules.sql`. It is unapplied to Production. It adds a private compatibility helper, includes the referenced snapshot in the authorized state response, and updates the existing shared accept/review functions. Public function signatures and generated API types are unchanged. No applied migration is edited.

After separate owner authorization:

1. Recheck current main, PR head, final required checks and deployed SHA. Preserve any intervening work.
2. Review and apply this exact migration before releasing the app, using the established hosted procedure. Verify its migration-ledger identity, function grants, snapshot projection and unchanged frozen snapshot/receipt evidence.
3. Merge the reviewed app commit and verify the normal Production deployment and canonical aliases.
4. Confirm authorized historical/current reads and paused behavior for unavailable context without creating unapproved real competitive data. Carry normal quote/score operation into the observed pilot.

The old app tolerates the additional read field. Releasing the new app before the migration deliberately pauses card changes because rule context is missing. No provider schedule, hosted auth setting, email template or paid-plan change is needed.

The existing applied V1.2 migration is `20260910173048_ruleset_v1_2_remove_all_play`, aligned by PR #27. Never restore the obsolete `20260904173852` filename or apply the same SQL under a second identity. The September 11 baseline contained 44 hosted migrations and three frozen V1.1 Simulation snapshots; see the index for the complete observed inventory.

An application rollback can retain the additive read field and stricter database guard. Any database rollback needs a separately reviewed forward migration restoring prior function definitions/grants. Never rewrite frozen snapshots, accepted terms, standings, receipts or applied migration files.

## Stage 7 handoff

Stage 7 covers A13–A15: security decisions, measured performance, accessibility/device evidence and demonstrated maintenance issues. Begin with the final reviewed Stage 6 head and recheck whether rollout has actually occurred; this document does not assert a merge or deployment.

Carry forward:

- Physical-device and screen-reader checks: iPhone numeric-code recovery after PR #35, Android/email combinations, VoiceOver/TalkBack and NVDA. Emulated WebKit is not physical-device evidence.
- Ordinary Production quote/score observations. Synthetic CI and rehearsal cannot establish provider latency, a real competitive week or a two-week pilot.
- Explicit owner decisions on repository visibility and leaked-password protection. Do not infer a visibility, plan or hosted-security change.
- Historical Week 14 owner-rehearsal timeout, database-test stall and rules-heading focus flake. In [Stage 6 run 34641490865](https://github.com/alexpfeffer4/sunday-ledger-matchups/actions/runs/34641490865), the new frozen-card and owner-rehearsal SQL suites passed, then output stopped after `phase8_authoritative_lifecycle.test.sql` began at 19:58:59 UTC. The run was canceled at 20:04:56 UTC by the next documentation commit. Identical database files passed the independent Phase 8A/8B lanes. The stall's underlying cause remains unobserved; a later green run does not diagnose it.
- Existing open/deferred Decision Register items, scoped in the addendum. No new access, notifications, dispute deadline, social or broad analytics policy is authorized.

The updated Stage 5 handoff supersedes stale pending-email notes: the canonical Site URL/callback, all three templates, verified ledgerleagues.com sending domain and `Sunday Ledger <no-reply@ledgerleagues.com>` sender are active. The owner confirmed Production code authentication and persistence across reload, and physical-iPhone recovery-link success. The exact original numeric-code interruption was not observed; do not claim physical-iPhone numeric-code success after the fix.

Stage 8 remains a real two-week invited pilot. Do not certify it from automated tests or rehearsal.
