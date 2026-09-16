# Player props with later publication of initially empty slots

Owner decision, September 15, 2026. After live acquisition returned requested
DraftKings props for one of sixteen published games, the owner instructed that
currently empty choices should display as unavailable and be checked through
the week so they can become available later. Market absence is observed; how
far a game is away is a plausible explanation, not a verified provider reason.

This decision supplements the [player-props contract](../player-props.md),
[nflverse primary policy](2026-09-15-nflverse-primary-pilot.md) and
[already-open Week 2 exception](2026-09-15-week2-props-cutover.md). It supersedes
their requirement for every Week 2 slot to have a nominated player before
cutover and the permanent unavailability of initially unresolved identities in
the explicitly authorized progressive scope. All other guards remain in force.

## Immutable rules identity and scope

Ruleset **1.5 / Product Bible 3.4** records the successor competitive behavior:
`menuFreeze: FIRST_PUBLICATION_PER_SLOT` and
`emptySlotPublication: AUTOMATIC_BEFORE_EVENT_CUTOFF`. The immutable 1.4 package
explicitly freezes the whole menu on first accepted submission, so its bytes,
hashes and existing bindings cannot be reused for this different behavior.

Prepare additive LIVE and Simulation packages, but do not globally change
existing defaults or silently upgrade any opened/completed week. The initial live use is the existing designated Week 2 scope, through its
guarded exception. The same approved pilot season may carry the behavior into
later unopened weeks through the ordinary reviewed preparation/opening path,
with a new per-week authorization, actual initial menu review and empty-slot
allowlist. Do not silently downgrade that season to 1.4 or upgrade other scopes.
Previously accepted receipts retain their original package and canonical hashes.

The original 1,000-credit allocation, shared wallet, cumulative position limit,
minimum stake, favorite cap, Over/Under terms, full-game overtime statistics,
participation grading, reveal rules, result policy and correction authority do
not change. Newly available props do not grant more credits, fund new bets from
returns or cancel any existing position.

## Initial review and first publication

The initial menu contains all six structural player/statistic slots for every
published game. Each slot must honestly show a verified player or an unavailable
state. A missing line or identity is not replaced by a predicted starter,
depth-chart guess, usage leader, alternate market or different bookmaker.

The commissioner reviews the actually available choices and the disclosed
automatic policy for the exact initially empty slots. Record that authenticated
review, initial menu snapshot, rules package, source/selection policy and
approved scope. Do not claim that the commissioner reviewed future unknown
players. Fixture data and an operator's technical access are not that review.

At cutover, preserve the initially offered player identities and record an
immutable allowlist of the slots that are still empty. Later workers may publish
one first player into an allowlisted slot, with a separate immutable system
publication record linked to the initial authorization and real source evidence.
An initially offered slot never enters that allowlist. Retain initial review
history and distinguish automatic publication in the supported projections.

Once a player has been offered for a slot, the player remains fixed, including
before the first accepted prop. A higher later line, injury, changed depth role
or withdrawn market cannot substitute a different player. Fresh executable
prices can return for the same player. Accepted prices, lines, stakes and
receipts remain immutable.

## Eligibility and evidence for an automatic addition

Use `NFLVERSE_PRIMARY` and `FEATURED_HIGHEST_STANDARD_LINES`: the verified QB with
the highest standard passing line, RB with the highest standard rushing line,
and WR/TE with the highest standard receiving line for that team. Roster
evidence establishes identity, position and team; a QB rushing market cannot
fill an RB slot. These are featured players, not guaranteed starters.

Automatic publication requires a unique, unambiguous, role-correct candidate,
exact event/team/player mapping, current source validation and qualifying
standard DraftKings nomination evidence. Ties, warnings that undermine that
choice, stale evidence and missing identities leave the slot unavailable. A
deterministic text sort cannot turn an unresolved tie into automatic consent.
The audit retains actual source and fetch times; cache reuse is not a new
observation. Executable member quotes keep their independent 120-second fetch
and ten-minute bookmaker freshness requirements.

The target game must still accept entries under its authoritative cutoff and
start/terminal-state rules. A later schedule change must not reopen an earlier
closed entry window. Other games may already have started or received bets;
that does not prevent a first publication for an independently open later game.
No slot can fill after its own entry cutoff. Closed unresolved slots remain
unavailable for that game.

Publication, entry closure and acceptance use compatible authoritative locks.
Duplicate workers produce one publication, and exact retries are idempotent.
Only the narrowly audited empty-to-first-player transition is allowed; existing
nonempty menu rows and accepted receipts remain unchanged. Participant roles
cannot write the authorization, allowlist, publication audit or source evidence.

## Bounded checks through the week

Use the existing five-minute dispatcher; do not fetch providers from page reads,
browser timers or focus events. Acquire only events and statistic families with
eligible empty slots. Recheck that pending evidence after six hours when the
game is more than 24 hours away, and after three hours in its final 24 hours.
Derive due time from the original observation/fetch time; reading the same cache
must not renew its negative lifetime. A partly populated family can still be
checked for its other empty team slot without changing already offered players.

Preserve twelve-hour positive discovery evidence, sequential provider pacing,
the sixteen-request ceiling, the absolute worker deadlines and bounded backoff.
Keep the existing 1,000/day and 5,000/month limits and protected core capacity of
350/day and 2,000/month. A full sixteen-game three-family cycle would reserve up
to 48 credits. Checks narrow as slots fill, but repeated failure/missing evidence
can still exhaust a budget: defer honestly instead of bypassing it or promising
a guaranteed polling interval. No subscription upgrade or purchase is implied.

Continue due eligible work automatically until slots publish or close. Published
identities do not expire when their discovery cache expires. Insufficient new
evidence must not erase a known player, clear the initial review, or prevent
ordinary game-line play.

## Week 2 cutover and acceptance contract

The existing designated independent reset is retained and must not run again.
Initial cutover still requires the exact current stage and reset, unchanged
original rules binding, no new accepted Week 2 picks, all published games within
the initial pregame window, fresh entitlement, protected budgets, validated
result/participation evidence, processing and scheduler readiness, the exact
reviewed initial menu/policy, tested release and immutable readiness audit.

The scoped atomic transition adopts the 1.5 package and authorizes only the
reviewed initially empty slots. It does not bypass those checks by changing
`player_catalog_complete` globally. A new accepted pick before cutover still
blocks that exception; there is no further reset, cancellation or entry hold.
After successful cutover, ordinary accepted game bets and props may coexist with
later authorized first publications for other eligible slots.

Required verification includes partial initial coverage, actual initial review,
one-time addition, duplicate and conflicting retries, accepted-pick and
published-player preservation, target cutoff races, later games after Thursday
starts, stale/ambiguous/missing sources, nonrenewing negative caches, shared
budget protection, participant privilege isolation, accurate unavailable text,
and unchanged historical packages/receipts. Finish the exact tested PR, native
database/concurrency and authenticated UI gates before live configuration.

No additional blanket release approval, provider key, account purchase or
statistics subscription is requested by this amendment. Actual authenticated
initial menu/policy review remains the owner's concrete product action once
the new behavior has been deployed and the real partial menu is ready.
