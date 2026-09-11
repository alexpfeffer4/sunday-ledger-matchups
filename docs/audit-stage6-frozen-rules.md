# Audit Stage 6 — governing reconciliation and future-week rules

Prepared September 11, 2026. PR #36 is being revised after the owner clarified
that rule updates should apply to **future play within existing seasons**.
The earlier season-long freeze proposal is superseded. No Production migration
or merge has occurred at this documentation checkpoint.

## Result and governing authority

The six governing sources are reconciled in the [current-source index](governance/current-source-index.md)
and [revision 2 addendum](governance/2026-09-11-governing-addendum.md).
The September 11 owner decision permits development seasons to adopt approved
updates when a new week opens, while preserving completed play. No numerical
card/scoring rule or new ruleset version is introduced by this PR.

Each materialized week records the rules used for that week. Existing weeks are
backfilled with their original season snapshot. An opened week keeps its rules
for every member, whether or not they have sealed. Opening the next week adopts
the latest supported catalog release; the implemented upgrade is V1.0/V1.1 to
V1.2. An unknown package or unsupported transition fails clearly. A later rules
release must extend application/SQL support and the upgrade gate together.

The original season snapshot remains an audit baseline. Card validation, quote
review, acceptance and receipt hashes use the current week's actual snapshot.
Missing or unsupported card context pauses writes while retaining local drafts
and authorized receipt/history reads. The shared engine retains all existing
membership, quote freshness, event-start, replay and rehearsal protections.

Standings calculations use the rules of the week being evaluated. New standings
can use a new tiebreak order with unchanged prior results; prior published
standings are never rewritten by rule activation. Week 14 rules govern playoff
qualification; published seeds/brackets/champion evidence remain unchanged.
Official score corrections still use the affected week's rule context.

Rules pages show current-week rules and a version list by week. Standings pages
use the snapshot for the standings actually displayed, including when Week 2 is
open but the table still shows completed Week 1. Newly generated archives include
week-rule provenance; existing archives are untouched. No new public write API,
commissioner rule editor or general-purpose rules engine is introduced.

## Verification

The revised implementation adds a real two-week rehearsal/acceptance regression:
V1.1 Week 1 seals, reveals, settles and finalizes; V1.2 Week 2 opens, reviews and
seals. Assertions compare original snapshot bytes, receipts, scores and standings;
verify historical recomputation retains All-play while future standings omit it;
reject repinning/reopening; verify stable publication retries; and exercise
member/outsider RLS for both old and new snapshots. UI coverage checks that
historical standings use the matching rules instead of the latest package.

Revised-head verification is pending at this checkpoint. The previous head
`7286608c113da8a85d289cdde01fb8b4ab38ddae` passed 429 unit/property tests, 889 pgTAP
assertions, 12 desktop full-stack tests, 8 mobile WebKit auth tests and all five
acceptance workflows. Those results describe the earlier implementation and do
not certify this revision. Final results will be recorded in the PR and this note.

The original Stage 6 browser changes retain real Auth, RSC, quote review, sealing,
replay and receipt checks. The global provider scheduler scenario runs once under
V1.2; the historical card case does not compete for that shared lease. Rehearsal
RSC capture forwards the actual response unchanged and retains privacy assertions.

## Migration and rollout

New migration: `20260911203723_prospective_week_rules.sql`, created through the
Supabase CLI. It supersedes the unapplied proposed `20260911190616` file. No
previously applied migration is changed. The migration adds the week binding,
protected publication trigger, member-scoped snapshot reads and guarded changes
to existing functions. Public function signatures remain unchanged.

1. Check the final PR head, required CI, Production SHA and hosted ledger.
2. Apply the reviewed migration **before** the application release. Confirm the
   hosted migration identity, private grants, week bindings and unchanged
   snapshot/receipt/score/standings evidence. If the hosted tool assigns a new
   timestamp, align the repository filename to that actual ledger identity.
3. Merge the reviewed head under the owner's conditional merge authorization,
   then verify normal Production deployment and canonical aliases.
4. Verify authorized read paths. Do not open real weeks, seal real cards or send
   messages merely to generate release evidence.

The old app tolerates the additional read fields. New app code without this
migration pauses card writes because their rule context is missing. No provider,
email, paid-plan or auth configuration change is needed.

An app rollback may leave additive fields and week bindings installed because
all currently supported card values agree. It does not undo activation policy.
A database rollback requires a reviewed forward migration that preserves each
opened week's binding and existing competitive evidence; do not restore
season-only receipt or standings logic after a mixed-version week has opened.

The Stage 6 baseline had 44 hosted migrations, last `20260910224551`, and three
frozen V1.1 Simulation snapshots. The already-applied V1.2 catalog migration is
`20260910173048`, aligned by PR #27; its old proposed timestamp is obsolete.

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
