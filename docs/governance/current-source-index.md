# Sunday Ledger — current governing source index

## Full-slate player props preparation — September 14, 2026

The owner authorized the prospective [full-slate props and Submit recovery contract](../player-props.md),
Ruleset 1.4 / Product Bible 3.3, implementation, public PR and isolated Preview.
Purchases and Production migration, merge, deployment, scheduler activation and
live offers are **not authorized by the build request**. Prepared pilot adoption
applies only to eligible unopened future weeks; no old binding or receipt changes.

Read-only checks for this build verified main and Production at PR #50,
`56d1cbfc83d833a90d35d2a9a9c1640751a9c57b`, and both global catalogs active on
1.3/3.2. The older preparation sentence below saying 1.2 remains active is
superseded by that verified rollout. It must not trigger duplicate activation or
downgrade. The feature release record distinguishes fixture/code evidence from
provider readiness and actual settlement latency.

## Matchup presentation amendment — 2026-09-14

The owner approved implementing and releasing the paired desktop/mobile matchup preview. [Paired matchup lineups](../paired-matchup-lineups.md) records the presentation scope and its unchanged privacy/scoring boundaries. This adds no season rules or database mutation.

September 14 owner-approved implementation:
[rolling submissions and immediate game visibility](2026-09-14-rolling-submissions.md)
prepares Ruleset 1.3 / Product Bible 3.2. Members may submit immutable batches
until each game's cutoff; partially allocated cards participate normally; unused
credits expire; selected game identities become visible immediately after
successful acceptance. The owner's later instruction makes game identity
visibility effective for the **current week, including 1.2**; rolling entry and
unused-credit rules start with the **next unopened week** (pilot Week 2).
Actual selections retain event-timed reveal, and whole-card aggregates retain
their separate former-common-lock timing.
**Preparation is not activation:** the active catalog remains 1.2 until a
separately approved activation for future unopened weeks. Read the
[implementation/rollout record](../rolling-submissions.md) for actual verification
and release status. Already-open and completed weeks keep their bound betting,
credit, scoring and attendance rules; the current-week game-identity read-policy
exception does not repin them. Public publication to
`alexpfeffer4/sunday-ledger-matchups` is explicitly approved; release remains
conditional on required checks. Paid hosted authenticated Preview is waived,
while disposable full-stack CI and public Preview checks remain required.

September 14 approved amendment: [automatic weekly results and matchup cleanup](2026-09-14-automatic-weekly-finalization.md)
supersedes the mandatory 24-hour wait before weekly finalization for unfinished
and future weeks. Verified corrections retain their review period and history.

September 14 owner decision: [outstanding matchup totals](2026-09-14-outstanding-totals.md)
permits whole-card unsettled pick counts and original stake totals after common
lock, including hidden picks. This is the bounded exception to historical
count/allocation privacy; individual positions retain event-timed reveal.

September 13 requested implementation: [league matchup browsing](../league-matchup-browsing.md)
allows league members to follow other pairings through the existing event-timed reveal boundary.
Its original scope added no pre-lock roster submission disclosure; the later
September 14 game-identity amendment now permits distinct accepted game lists.

September 13 supplement: [commissioner card-status decision](2026-09-13-commissioner-card-status.md)
extends the submission flag to the current commissioner's current-week roster only.

September 13 correction: [score-provider kickoff recovery](../score-provider-kickoff-recovery.md)
preserves published deadlines and frozen rules while accepting verified later
kickoff evidence for the same game.

September 13 supplement: [opponent sealed-status decision](2026-09-13-opponent-sealed-status.md)
permits a single pre-lock submission indicator for the scheduled opponent.
That decision's original scope was only the indicator; the later September 14
game-identity amendment extends visibility to distinct accepted game lists.

Reconciliation revision 2, prepared September 11, 2026 for audit Stage 6 (A11–A12).
Read each historical base with the [governing addendum](2026-09-11-governing-addendum.md).
The addendum records existing approvals and the September 11 owner direction to
apply rule updates to future play within existing development seasons. No numerical
rule or version is invented. Open and completed weeks retain their original rules.

The table and release inventory below preserve the September 11 reconciliation
snapshot. Later dated amendments above take precedence in their stated scope;
their presence does not retroactively change that snapshot's verification claims.

| Base document/version                                | Current amendment and effective scope                                                                                                       | Decision authority                                                                                           | Implementation/evidence                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product Bible V3 / 3.0                               | Product Bible 3.1 addendum: remove All-play as a prospective format requirement; V1.1 history retained                                      | Owner's September 4 prospective approval, later explicit amendment/merge/migration approval                  | [PR #26](https://github.com/alexpfeffer4/sunday-ledger-matchups/pull/26); typed V1.2 snapshots already identify Product Bible 3.1                                                                                                                                                                                                                                                                                                              |
| POC Season Ruleset V1 / 1.1                          | Approved Ruleset 1.2; new seasons and future weeks in existing development seasons                                                          | D-001–D-005, approved August 28; owner-approved V1.2 amendment, no assigned later register ID evidenced      | [V1.2 amendment](../ruleset-v1-2-remove-all-play.md); [migration alignment #27](https://github.com/alexpfeffer4/sunday-ledger-matchups/pull/27)                                                                                                                                                                                                                                                                                                |
| Decision Register 1.1, August 28                     | D-001–D-006 remain resolved; addendum records later bounded decisions by name and source                                                    | Original resolutions plus explicit owner instructions recorded in prior handoffs/merged release notes        | Open-status table in addendum; no invented D-024 or later ID                                                                                                                                                                                                                                                                                                                                                                                   |
| Integrated Product and Visual Roadmap 1.1, August 29 | Completion/status addendum through audit Stage 5; Stage 6 in review; Stages 7–8 outstanding                                                 | Individually authorized phases and audit prompts; Phase 9 explicitly deferred                                | [merged phase/release references below](#release-and-operational-evidence)                                                                                                                                                                                                                                                                                                                                                                     |
| Visual Bible 4.1, August 29                          | Preserve Modern Fantasy Clubhouse and approved B+A identity; prospective All-play removal, single playoff line, clearer card/result states  | Owner B+A choice and approvals of Phases 10–11, PRs #24–26 and audit Stages 3–5                              | [PR #21](https://github.com/alexpfeffer4/sunday-ledger-matchups/pull/21), [#24](https://github.com/alexpfeffer4/sunday-ledger-matchups/pull/24), [#25](https://github.com/alexpfeffer4/sunday-ledger-matchups/pull/25), [#31](https://github.com/alexpfeffer4/sunday-ledger-matchups/pull/31), [#32](https://github.com/alexpfeffer4/sunday-ledger-matchups/pull/32), [#33–35](https://github.com/alexpfeffer4/sunday-ledger-matchups/pull/35) |
| Full-Season POC Architecture Revision 1.1, August 29 | Addendum for private owner rehearsal, approved Live refresh/checkpoints, hosted auth delivery, explicit week rules and prospective upgrades | Owner rehearsal approval; Stage 1/2 operating approvals; Stage 5 follow-up/production configuration approval | [rehearsal](../owner-guided-rehearsal.md), [quotes](../audit-stage1-quote-reliability.md), [checkpoints](../audit-stage2-live-operations.md), [mobile auth](../mobile-account-invite-recovery.md)                                                                                                                                                                                                                                              |

Historical base filenames: `SUNDAY-LEDGER-PRODUCT-BIBLE-V3.md`,
`SUNDAY-LEDGER-POC-SEASON-RULESET-V1.md` (internal version 1.1),
`SUNDAY-LEDGER-DECISION-REGISTER.md` (1.1),
`SUNDAY-LEDGER-INTEGRATED-PRODUCT-AND-VISUAL-ROADMAP-1.1.md`,
`SUNDAY-LEDGER-VISUAL-BIBLE-V4.1.md`, and
`SUNDAY-LEDGER-FULL-SEASON-POC-ARCHITECTURE-REVISION-1.1.md`.
They were supplied as project sources. Their original dates, questions, approvals
and historical passages are preserved; this explicitly dated addendum supersedes
only the passages named below. A release note describes verification, not product authority.

## Release and operational evidence

Read-only checks on September 11 confirmed current main and Production at
`5cd991b71c2cf093bb54a828882052734d9eaf37` ([PR #35](https://github.com/alexpfeffer4/sunday-ledger-matchups/pull/35)).
[Deployment](https://vercel.com/pfeffer/sunday-ledger-matchups/4f96kfFSnvj4ds5GN1Lwkbw91sXh)
was READY, target Production, with ledgerleagues.com and www.ledgerleagues.com
assigned and no alias error. This is the Stage 6 baseline, not a Stage 6 deployment.

| Work                                            | Merged implementation | Verified rollout / remaining evidence                                                                                                                            |
| ----------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phases 1–8 and authoritative Simulation         | PRs #9–19             | Existing phase, pgTAP and canonical season gates remain required; no new blanket acceptance claim                                                                |
| Stable navigation / B+A identity                | PRs #20–21            | Deployed baseline includes both; professional trademark/legal approval is not established by asset verification                                                  |
| Controlled-league reliability / owner rehearsal | PRs #22–23            | Existing shared lifecycle and owner entitlement remain; no new access grant                                                                                      |
| Standings/market presentation and V1.2          | PRs #24–27            | #26 merged September 10 at `815dfbe`; #27 aligned the hosted filename, SQL unchanged                                                                             |
| Audit Stage 1 / A01                             | PR #29                | Hosted `20260910202847_dependable_card_quotes` present; approved operational policy documented                                                                   |
| Audit Stage 2 / A02, A10                        | PR #30                | Hosted `20260910223407`, `20260910223527`, `20260910224551` present; low-frequency checkpoints, no automatic finalization                                        |
| Audit Stage 3 / A03–A05                         | PR #31                | Weekly action, device-local drafts, review and immutable seal                                                                                                    |
| Audit Stage 4 / A06–A08, A10                    | PR #32                | Clear results/standings/current playoff context; no scoring-policy change                                                                                        |
| Audit Stage 5 / A09 and account recovery        | PRs #33–35            | Updated supplied handoff closes configuration activation and confirms physical-iPhone recovery-link success; exact original code interruption remains unobserved |
| Audit Stage 6 / A11–A12                         | This PR               | Verification and rollout in [Stage 6 note](../audit-stage6-frozen-rules.md)                                                                                      |
| Audit Stage 7 / A13–A15                         | Next stage            | Security decisions, measured performance, accessibility/device evidence and targeted maintenance                                                                 |
| Audit Stage 8 / A16                             | Future bounded pilot  | Requires two actual weeks of observations; cannot be certified from rehearsal                                                                                    |

The hosted migration ledger contains
`20260910173048_ruleset_v1_2_remove_all_play`, **not** the originally proposed
`20260904173852`. PR #27 is the approved rename; applied migration SQL must not
be edited or reapplied under another identity.

The September 11 read-only snapshot inventory contained three frozen V1.1
Simulation snapshots, three unfrozen V1.2 Live snapshots and two unfrozen V1.2
Simulation snapshots. All sampled identity fields matched canonical JSON; all
used the same 1,000/50/1–20 and −200/750/1,000 card package. No frozen V1.0
snapshot was observed in this hosted inventory. This is an inventory observation,
not permission to retire historical compatibility or mutate those rows.

## Evidence limits and unresolved authority

- The supplied updated Stage 5 handoff supersedes older repository notes about
  pending email-template activation. It records the canonical Site URL/callback,
  all three templates, verified ledgerleagues.com sending domain and sender active.
  Stage 6 did not send mail or repeat authenticated hosted verification.
- Physical iPhone recovery-link success is owner-reported. Physical iPhone
  numeric-code success after #35, Android email combinations, VoiceOver/TalkBack
  and NVDA are not thereby proven. Emulated WebKit is not physical-device evidence.
- Normal production quote/score operation still needs pilot observation; synthetic
  CI/rehearsal does not establish provider latency or a successful live weekly cycle.
- Carry the historical Week 14 owner-rehearsal timeout, database test stall and
  rules-heading focus flake to Stage 7. A later green run does not diagnose them.
- Repository visibility and leaked-password protection remain explicit Stage 7
  owner decisions; no visibility, plan or hosted security setting is changed here.
