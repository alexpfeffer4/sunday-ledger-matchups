# Approved Week 2 props cutover: operator runbook

This runbook implements the
[September 15 one-time amendment](../governance/2026-09-15-week2-props-cutover.md).
It is preparation, not evidence of a completed reset or live activation. The
owner has approved the conditional release and exact reset scope; do not ask for
the same approval again. The owner does not edit SQL or supply private card
identifiers in chat.

Use `scripts/player-props/open-week2-cutover.sql`, which defaults to a dry run.
The operator obtains exact identifiers and fingerprints through authorized
private inspection. Keep those inputs, receipt manifests, member details and
resulting audit identifiers out of public commits, PR bodies and screenshots.
Apply only after the corresponding migration, application, database/concurrency
and authenticated browser gates pass and compatible code is deployed.

All script settings use the `sunday_ledger.` prefix. `week2_apply=true` explicitly
enables the selected `week2_phase`; omission is a no-change dry run. Supply only
the reviewed values for that phase. Do not bypass the helper with direct card,
receipt, rules-binding or menu updates.

| Phase     | Required private settings, in addition to `week2_apply` and `week2_phase`                                                                                         | Effect and gates                                                                                                                                                                                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stage`   | `props_league_id`, `props_season_id`, `props_week_id`, `week2_card_id`, `week2_receipt_ids` (UUID array), `week2_receipt_fingerprint`, `props_approval_reference` | Record the exact existing-card manifest and prepare menu slots. Entry remains open under 1.3; no reset, credit change, acquisition, hold or offers activation.                                                                                                             |
| `catalog` | `props_week_id`                                                                                                                                                   | Queue the normal shared catalog path after verified paid entitlement, configured protected budgets, validated source flags and metadata policy. Enable catalog acquisition only; no hold, reset or rules/offers activation.                                                |
| `cutover` | `props_week_id`, `week2_menu_hash`, `props_readiness_sha`, `props_release_sha`, `week2_operation_key`, `week2_reason`                                             | Under shared authority locks, revalidate the exact manifest, pregame window, fresh entitlement, complete reviewed menu, processing policy and scheduler. Atomically record cancellation/reset, adopt the supported 1.4 package for this week and freeze the reviewed menu. |

## Preparation and provider gates

Staging does not consume provider credits or require leaving ordinary play on
hold. It is safe to stop after staging if readiness is incomplete. A newly
accepted bet by **any member** invalidates the staged manifest and blocks menu
confirmation and cutover. Reassess the changed state; existing approval does not
authorize canceling another card or silently expanding the receipt manifest.

The owner reports the Odds API 20K subscription and replacement key installed.
The agent verifies a fresh deployment and the live allowance headers securely,
then applies the reviewed 1,000/day and 5,000/month limits with at least 350/day
and 2,000/month protected for core operations. Until verified, retain the actual
90/day and 450/month limits. Preserve usage history and verified quota-reset
evidence; do not treat a successful key response alone as sufficient capacity.
Refresh normalized entitlement evidence within the helper's ten-minute gate
before catalog start and before cutover.

The API-Sports key already passed its protected Production account check with a
100-request daily allowance. Source coverage, verified offensive participation,
complete final totals and permission to display/retain the normalized evidence
still require validation. The authorized support request remains unsent after
the site's rejected verification attempt; use the
[prepared official-dashboard request](api-sports-permission-request.md).

The catalog phase requires both source-validation flags and enabled metadata
policy with the protected 80 result / 20 metadata daily split and at most eight
API-Sports requests per minute. Use the established bounded catalog allowance;
do not skip mapping or results checks to meet a calendar deadline. Cutover also
requires enabled result processing and the installed player-results hook in the
active existing five-minute score dispatcher. Record actual delivery evidence.

## Commissioner review and atomic cutover

Have the commissioner review and confirm the complete menu through the normal
authenticated controls. Record the exact menu hash and a readiness-evidence
hash; record the deployed, tested release commit and an operation identity plus
the approved reason. Do not substitute synthetic fixtures for real coverage or
record a review that did not happen.

Immediately before execution, inspect the exact staged scope and verify every
published game remains scheduled, unstarted and before its entry cutoff. The
helper rejects changed receipts or binding, other accepted-card content,
result evidence, an incomplete/unreviewed/already-frozen menu, stale entitlement
or missing processing/scheduler readiness. Concurrent submissions, results and
cutover serialize under the same authoritative locks.

A successful cutover freezes the **complete reviewed menu in that transaction**.
It does not wait for the first replacement bet. That differs from the ordinary
first-bet freeze for future unopened weeks because this Week 2 already had
accepted play before the approved exception. Replacement submissions use those
frozen identities and fresh reviewed prices; known players can receive later
quotes without substitution.

Verify original receipts and hashes are unchanged, their cancellation is
auditable, the replacement generation has the original 1,000-credit allocation,
unrelated cards/history are unchanged and fresh mixed submissions work. Confirm
the affected member sees the reset, authorized historical receipts remain
readable with their canceled status, and stale intents/drafts cannot resurrect
old active picks. An exact operation retry returns the completed cutover;
different retry parameters must not create another reset.

If any readiness or pregame guard fails, leave accepted play and the Week 2
binding unchanged. Do not reset first, disable guards, or widen the scope.
If the window closes, report that the approved Week 2 cutover can no longer run.
After success, use compatible offer disabling and forward fixes while retaining
the cancellation audit, replacement receipts, processing and history. Never
reactivate canceled positions as recovery.
