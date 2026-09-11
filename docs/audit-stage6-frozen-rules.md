# Audit Stage 6 — governing sources and frozen card rules

Status: implementation in review; verification is not complete.
Base: `5cd991b71c2cf093bb54a828882052734d9eaf37`.

Scope: A11–A12. See the [current source index](governance/current-source-index.md)
and the [dated governing addendum](governance/2026-09-11-governing-addendum.md).
No numerical gameplay change or retrospective history update is proposed.

Card validation now receives its exact season snapshot. A small explicit V1.0,
V1.1 and V1.2 compatibility boundary rejects missing, mismatched, malformed,
unknown or changed card constraints. The builder, owner progress, review action
and seal action use those limits; SQL independently validates the stored snapshot
and derives the same constraints. Public signatures, membership checks, freshness,
event-start enforcement and immutable receipts remain authoritative.

Migration `20260911190616_enforce_frozen_card_rules.sql` is new and unapplied
to Production. It adds a private rule guard, includes the referenced snapshot in
the existing authorized state response, and updates review/shared acceptance.
It edits no existing migration and writes no season or receipt data.

The workspace disconnected during implementation. Changes are being prepared
through the connected GitHub branch and tested in disposable CI. No local
verification result is claimed for the unfinished local tree.

## Required verification

- Unit constraints and malformed-context failures across Live/Simulation and
  all three known card versions.
- Real SQL acceptance at favorite/minimum/count/whole-credit boundaries,
  atomic failures, immutable snapshot linkage and unknown-version rejection.
- Existing complete pgTAP/RLS/scoring/season suites and generated-type checks.
- Real Auth → review → seal → refreshed RSC → receipt path for V1.1 and V1.2.
- Existing owner rehearsal and public/shared browser gates.
- Final PR head CI and review.

## Rollout and rollback

After separate owner authorization: apply the reviewed migration before the app
release, then merge and verify normal Production deployment. The old app tolerates
the added read field. Deploying the new app before migration deliberately pauses
card changes because snapshot context is missing. No provider job, configuration
or paid-plan activation is needed.

An application rollback can leave the additive read field and stricter database
guard installed. If database rollback is necessary, use a separately reviewed
forward migration restoring the prior function definitions and grants. Never
rewrite frozen rules, receipts or applied migration files.

## Stage 7 handoff

Use the final reviewed head and current-source index after separately approved
rollout. Carry forward physical-device/screen-reader evidence, ordinary production
quote/score observations, repository-visibility and leaked-password decisions,
and the historical rehearsal/database/focus flakes. Updated Stage 5 handoff
supersedes old pending-template notes: configuration is active and physical-iPhone
recovery-link success is confirmed; physical-iPhone numeric-code success is not
proven. Stage 7 should measure and fix demonstrated problems without adding
social/analytics scope or claiming a real two-week pilot has occurred.
