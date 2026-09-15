# Week 2 props cutover and recorded card reset

Owner decision, September 15, 2026. This amendment records the owner's request
to include props in the already-open pilot Week 2 and reset the designated
member's accepted picks so that member can choose again. It supplements the
[full-slate props contract](../player-props.md) and
[rolling-submission amendment](2026-09-14-rolling-submissions.md).

The owner has approved implementation and the conditional migration, merge,
deployment and activation workflow. No repeated release approval is required
for this scope. Purchases remain excluded. This document records authority and
acceptance requirements; it does not certify that the reset or activation ran.

The owner's subsequent explicit instruction to clear the designated member's
picks authorizes that exact reset independently of unfinished props readiness.
This supersedes the earlier requirement to wait for a combined reset and props
activation. It does not authorize another reset or cancellation of new picks.

## One-time exception

The exception applies only to the designated pilot league, season, already-open
Week 2 and accepted card generation identified in the private execution record.
Participant identities, card identifiers, accepted selection details and actual
submission counts must not be committed to public source or release notes.

The original future-week-only rule is superseded solely to let this Week 2 adopt
the supported Ruleset 1.4 / Product Bible 3.3 props package before any published
game starts. The original no-cancellation/no-redeployment rule is superseded
solely to retire the designated accepted card generation and restore that
member's original weekly allocation. Neither exception is a reusable member or
commissioner cancellation feature. Other opened or completed weeks, global
catalogs and unrelated leagues retain their existing bindings and behavior.

Accepted receipts remain permanent and byte-for-byte unchanged. Record an
append-only cancellation with the owner decision, reason, trusted time and
retired generation. Create a new active generation for fresh submissions.
Canceled picks contribute no stake usage, position usage, settlement obligation,
score, selected-game disclosure or attendance to the replacement generation.
The retained audit explains their cancellation without treating them as active
bets or exposing hidden selections to another member.

The member receives the same **1,000 total weekly credits**, not an additional
grant. New bets use current reviewed terms, the existing minimum stake and
cumulative position limits, and ordinary game-specific entry cutoffs. Historical
returns and canceled positions cannot fund further bets. Other members' cards,
accepted terms and credit allocations do not change. Scores, standings,
qualification, pairings and completed history are not recalculated by cutover.

## Independent reset, atomic activation and race protection

Prepare the complete role-correct slate and pass all existing source, identity,
results, participation, quote, quota and commissioner-review gates before the
cutover. The owner reports completing the 20K Odds API subscription and key
installation; the agent must verify live entitlement from a fresh deployment
before changing the current 90/day and 450/month caps. No repeat owner upgrade
or key-setup request is needed. Account authentication alone is not evidence of
coverage or permission to retain settlement facts.

Two execution sequences are supported under the authoritative season/week/card
locks:

1. With the original card still active, reset it and activate the validated props
   slate in one transaction.
2. Following the explicit independent-reset instruction, retire the exact staged
   card first. The member may submit fresh game picks under the unchanged rules.
   A later props cutover may reuse that immutable reset only while nobody has
   accepted any new bet in the week. It must never reset the card again.

Both paths require the complete, reviewed menu to freeze **inside the props
cutover transaction**, alongside the Week 2 rules transition. Source readiness
does not block the separately approved reset, and the reset does not establish
source readiness. The ordinary first-accepted-bet freeze remains the rule for
future unopened weeks; this already-open exception does not defer its menu
freeze until a replacement bet.

Immediately before committing, recheck the exact private scope, expected rules
binding, active generation and accepted-receipt fingerprint. Recheck every
published game's trusted start/cutoff evidence and require all to remain in the
permitted pregame window. Reject stale scope, changed submissions, any started
or closed game, a settled card, an unrelated or mismatched reset, or incomplete
readiness. A reused reset must match the staged league, season, week, card,
original receipt IDs and fingerprint, and the unchanged original rules binding.
It must be the week's only reset, recorded after staging, with its replacement
generation still empty. The independent instruction may have its own approval
reference; preserve both immutable approval records. A new accepted bet by any
member invalidates the recorded receipt
manifest and prevents cutover; it does not authorize canceling additional bets.
Competing submission, result and cutover paths must serialize. A
failure rolls back that attempted cutover. A previously committed independent
reset remains effective and auditable.

Old submission intents, review proofs, retries and browser drafts must not become
new-generation bets or return a misleading active-success result. Preserve the
old receipt for authorized audit; require fresh review and consent for new
submissions. The affected member must see the reset and restored allocation
clearly through normal authenticated pages. Existing opponent privacy remains.

## Required evidence and release order

The [operator runbook](../operations/week2-props-cutover.md) documents the
reviewable stage, catalog and cutover phases and their private inputs.

1. Implement the additive generation/cancellation authority and its supported
   application projections on current main. Preserve PR #52's scheduled-day
   filters and PR #53's historical matchup navigation and privacy behavior.
2. Prove the one-time scope, pregame guard, immutable receipts, unchanged other
   cards, replacement budget, canceled-pick exclusion and stale-intent rejection
   in disposable database tests. Prove submission/cutover ordering, rollback and
   idempotent recovery, including a retry after successful cutover.
3. Verify authenticated owner/member/opponent behavior, fresh submission,
   game/prop mixtures, reliable-start reveal, settlement and historical audit.
   Run the required regression CI and inspect the isolated Preview. Record
   actual evidence separately from this governing decision.
4. Apply the reviewed additive migration and deploy compatible code. An
   independently approved reset uses the existing guarded reset authority;
   verify its restored allocation and receipt audit immediately. Source setup,
   entitlement, full-slate validation and commissioner review remain separate
   requirements for props activation.
5. Capture private before-state evidence, execute the narrowly scoped atomic
   cutover only while every guard still passes, either recording the reset or
   reusing the exact earlier audit. Verify after-state evidence:
   old receipt hashes unchanged, replacement allocation correct, unrelated
   records unchanged, props menu ready and normal submission available.

If any props launch gate fails, **do not change the Week 2 binding**. An
independently approved reset does not depend on those launch gates, but still
requires its own exact scope, immutable evidence and pregame checks.
If the pregame window closes, this amendment cannot be applied later to that
week; report the limitation and retain the current generation and accepted play. After a
successful cutover, use the compatible props-disable path if necessary while
retaining replacement receipts, processing, corrections and history. Do not
reactivate canceled bets or use an old application binary as recovery.
