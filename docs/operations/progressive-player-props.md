# Progressive player-props release and Week 2 cutover

**Scope amendment:** [Version 2.2](../governance/2026-09-16-season-automation.md) supersedes the weekly human review
requirement below only for explicitly enrolled future weeks. Those weeks use
standing season consent and automatic SYSTEM validation. The historical Week 2
cutover and unenrolled manual scopes retain their original requirements.

Use with the [owner's progressive availability decision](../governance/2026-09-15-progressive-player-props.md),
[nflverse pilot runbook](nflverse-primary-pilot.md), and retained
[Week 2 reset/cutover safeguards](week2-props-cutover.md). The owner authorized
the behavior and conditional release; no repeated blanket approval is needed.
Actual authenticated review of the initial choices and continuation policy is
still required. This runbook does not claim that live offers are enabled.

## Prepare the tested successor

1. Start from current main, preserving all prior PRs. Verify the additive 1.5 /
   Product Bible 3.4 LIVE and Simulation packages against their canonical SQL
   representations. Existing 1.4 bytes, hashes, bindings and receipts remain
   unchanged. Do not change global defaults to upgrade unrelated weeks.
2. Pass final-head format, types, unit/property, complete native pgTAP,
   publication/cutoff/acceptance concurrency, shared browser UI and actual
   Auth/server-action/RPC journeys. Inspect the isolated partial-menu Preview;
   Preview must not inherit a writable live backend.
3. Apply only the reviewed new migration and deploy compatible code with offers
   disabled. Verify installed SQL hashes, prior migration-ledger preservation
   and exact repository/hosted version identities. If installation timestamps
   differ, align repository filenames byte-for-byte in a tested follow-up PR;
   never rewrite the hosted journal.
4. Recheck the current Week 2 stage, exact independently completed reset,
   replacement generation, zero new effective picks, original rules binding and
   all published games' initial pregame windows. Preserve receipts, credits,
   cards, score history, source validation and prior audits. A new accepted pick
   blocks this initial exception without authorizing another reset or a hold.

## Authorize the initial partial menu

The operator uses `scripts/player-props/progressive-week2-cutover.sql`. It is a
no-change dry run unless `sunday_ledger.progressive_apply=true` is supplied.
Private identifiers, receipt manifests and operation records do not belong in
public commits, PR descriptions or screenshots.

For `progressive_phase=authorize`, supply `props_week_id`, the exact tested and
deployed `props_release_sha`, and the retained `props_approval_reference`.
`private.authorize_progressive_player_props(uuid,text,text)` records the scoped
standing policy with offers disabled; it is not a substitute for commissioner
review and does not activate rules or perform another reset.

Read `private.progressive_initial_menu_ready(week_id)` and the actual menu.
Initial readiness requires the complete structural published slate with truthful
states. Every offered player needs current verified highest-standard-line
evidence. Empty slots remain unavailable; missing or ambiguous data cannot be
turned into a player. Preserve the source snapshots and initial menu hash.

Have the actual commissioner review available names, teams, roles and snapshot
times, along with the disclosed automatic policy for empty slots, through the
normal authenticated menu controls. The explicit
`api.confirm_progressive_player_prop_menu(text,jsonb,text)` interface requires
the `AUTOMATIC_BEFORE_EVENT_CUTOFF` policy acknowledgment and records that actual
review. Legacy confirmation forms cannot approve this policy. Do not impersonate the commissioner or
manually mark unknown future players as reviewed.

## Atomic initial cutover

After actual review, read `private.week2_props_menu_hash(week_id)` and record a
readiness-evidence hash. Verify the current 20K entitlement within the existing
freshness gate, protected application budgets, validated nflverse result and
offensive-participation paths, processing readiness, existing dispatcher and
recent genuine delivery. No new key, subscription or provider account is needed.

Use `progressive_phase=cutover` with the exact `props_week_id`,
`week2_menu_hash`, `props_readiness_sha`, `props_release_sha`,
`week2_operation_key` and `week2_reason`.
`private.cutover_open_week2_progressive_props(uuid,text,text,text,text,text)`
requires the recorded scoped authorization and authenticated review. It reuses
the existing reset, binds 1.5 atomically, preserves initial offered identities
and records exactly which empty slots may receive one later player. The helper
retains the original no-new-picks, initial pregame, source, entitlement,
processing and immutable-evidence guards.

If any check fails, leave the current generation, original binding, accepted
play and completed reset unchanged. Never bypass the helper with direct menu,
card, receipt, rules-binding or policy updates. Do not use the legacy 1.4
cutover to silently adopt a partial progressive menu.

## Later unopened weeks in the same pilot season

The successful initial Week 2 transition records the scoped season standing
policy. Later PLANNED weeks in that exact season inherit 1.5 and a new per-week
pre-review authorization through the existing held preparation flow. They still
require an actual initial menu/continuation review before the ordinary opening
authority records activation and that week's exact empty-slot allowlist. Do not
reuse a previous week's menu hash or commissioner review, and do not open a week
automatically. Other seasons and historical weeks retain their existing rules.

## Automatic continuation

The existing scheduler claims due eligible empty slots. It requests only their
event/statistic families, reusing the original source observations and shared
cache. Pending slots are checked on the configured six-hour horizon, shortened
to three hours within 24 hours of their own cutoff, subject to provider backoff,
runtime limits and daily/monthly budget protection. Reading a cache is not a new
observation and must not postpone the next check indefinitely.

Thursday starting or another member accepting a bet does not prevent an
authorized first publication for an independently open Sunday/Monday game.
The target game's authoritative entry gate remains decisive. Closed unresolved
slots are unavailable for that game; later schedule changes cannot reopen the
earlier cutoff. Participants cannot directly write the authorization, allowlist,
source observations or publication audit.

Each successful first addition is one atomic, idempotent system publication
with its player, event, slot, source evidence and authorization provenance. It
does not replace the initial manual review or the whole-week nomination head.
An already offered player never changes because of line movement, injury or
market withdrawal. Evidence cache expiry does not erase that identity. Fresh
member prices still use the existing separate quote-consent gates.

After cutover, verify ordinary game bets, mixed drafts/Submit recovery, fixed
players, unavailable/closed states, privacy, fresh quote consent and immutable
receipt/card/credit history. Confirm one publication per eligible slot and
honest pending reasons. Never create live test bets to manufacture evidence.

## Failure handling

Missing lines, stale or ambiguous identities, quota exhaustion and provider
failures leave affected slots unavailable. Record operational evidence and let
normal bounded retries continue; do not buy capacity, reset usage, force leases,
change source timestamps or substitute bookmakers to make a slot look ready.
If no eligible empty slots remain, stop their acquisition work.

Disable new offers through compatible controls if needed, while retaining
accepted-prop result processing, published-player history, immutable receipts
and the prior reset. There is no second cancellation or historical rollback.
Measure actual postgame settlement after genuine props complete; overnight
results remain an expectation rather than a measured guarantee.
