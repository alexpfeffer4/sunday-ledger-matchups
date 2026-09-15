# Restricted nflverse primary pilot

Owner decision, September 15, 2026. After reviewing current-season nflverse
evidence and the limits of the API-Sports free account, the owner approved
implementing nflverse as the primary player-results source for the limited menu
below, accepting overnight settlement and verified handling of exceptions.
The owner's subsequent instruction selects the highest standard passing and
rushing lines in the same way as receiving, superseding the earlier requirement
for depth-chart starting QB/RB nominations. These are featured players selected
from available pregame markets, not confirmed starters.
This dated decision supplements the [player-props contract](../player-props.md)
and [Week 2 exception](2026-09-15-week2-props-cutover.md).

## Scope and rules identity

Use explicit `NFLVERSE_PRIMARY` source and `FEATURED_HIGHEST_STANDARD_LINES`
selection policies for the approved pilot. The existing
`API_SPORTS_NFLVERSE` policy remains a separate supported configuration; its
validation does not transfer to the new policy. Record the selected policy and
its nomination evidence with the catalog and readiness audit. Changing source
configuration must not reinterpret an accepted receipt or silently replace a
frozen player.

Ruleset **1.4 / Product Bible 3.3** remains the immutable competitive package.
Its existing canonical terms already specify these six slots, full-game
statistics including overtime, shared credits, identity freeze and offensive
participation grading. Provider selection and nomination ranking are operational
policy; this amendment does not rewrite that canonical JSON or assign another
rules version. Existing 1.3 and earlier bindings remain unchanged outside the
already approved, guarded Week 2 exception.

## Six choices per game

For every eligible published game, nominate one player for each of these slots
on each team:

| Slot                  | Required pregame nomination evidence                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| QB passing yards      | The mapped **QB** with the highest available standard passing-yardage line for that team.                                              |
| RB rushing yards      | The mapped **RB** with the highest available standard rushing-yardage line for that team. A QB rushing market cannot fill the RB slot. |
| WR/TE receiving yards | The mapped **WR or TE** with the highest available standard receiving-yardage line for that team.                                      |

Each choice uses the posted pregame line in the latest coherent per-game
nomination snapshot from the configured reference book. It does not use
postgame totals or a prediction presented as fact. Shared acquisition runs in
bounded batches; the existing discovery window permits a snapshot fetched
within twelve hours. The bookmaker observation must have been no more than ten
minutes old at acquisition, with no future timestamps. Record and show the
nomination snapshot time during review. These prices are not automatically
executable: member quote review retains the separate 120-second fetch and
ten-minute observation gates.

Verify current roster position, stable player identity, team and game before
ranking. A market label alone is not position evidence. Depth charts are not a
required acquisition dependency for this policy. Display these choices as
featured players; the highest line neither confirms a starter nor guarantees
health, availability or offensive participation. A tied or ambiguous nomination
needs the recorded deterministic policy or an explicit reviewed exception.
Missing standard lines do not permit a silent usage, depth or alternate-line
fallback.

Keep The Odds API and standard DraftKings full-game Over/Under markets. Do not
add alternate lines, additional players, extra games or another wallet. One
commissioner review covers the proposed full slate and its flagged exceptions.
Actual matching and posted lines must be verified before claiming a complete
menu. A known frozen player may receive a quote later; an unresolved identity
remains unavailable, and quote refresh never substitutes a player.

For ordinary future weeks, the first accepted bet by any member, including a
game-line bet, freezes identities across the week. The approved already-open
Week 2 exception freezes its complete reviewed menu inside the cutover
transaction. Later injuries, role changes or withdrawn markets cannot replace
those players, rewrite accepted terms or automatically refund their bets.

## Evidence, timing and corrections

Use published nflverse player totals and PFR offensive snap counts with stable
player/game/team joins, independent source revisions and explicit completeness
checks. A successful download, recent file timestamp or final team score alone
does not prove a complete player result. No homemade play-by-play statistics
engine or routine manual box-score entry is introduced.

The pilot accepts **overnight settlement** when complete evidence becomes
available. This supersedes the original unverified 5–15-minute target for this
source policy. It is an operating expectation, not a guaranteed deadline:
separate totals and snap feeds can arrive later. Measure real final detection,
source availability, import and member-visible settlement in the hosted pilot.
The [nflverse publication schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html)
describes nightly player-stat updates and PFR snap updates at 00/06/12/18 UTC,
subject to upstream availability.

The existing grading rules are unchanged:

- Explicit zero and negative yardage grade normally after verified offensive
  participation; equality with the accepted line pushes.
- Explicit, verified zero offensive snaps permits a void, including a player
  who appeared only on special teams. Absence from a table, an inactive label,
  a zero yardage row or a retry timeout is not that proof.
- Missing or conflicting totals, identity or participation evidence stays
  pending. An unresolved accepted prop continues to block required finality.
- Exhausted automatic retries create an actionable incident. Exceptional
  resolution requires independently verifiable published evidence, source
  references, an authorized operator and append-only correction history.
  An operator cannot invent a total or declare DNP to clear a pending week.

Later published corrections, including the provider's Wednesday-night/Thursday
refresh, use the existing applicable correction authority. This decision does
not extend the retry horizon, restart a review clock, add a mandatory waiting
period or silently change protected qualification, bracket, champion or archive
results. Preserve earlier evidence and present disagreements for review.

## Accounts, release and Week 2

The existing Odds API 20K entitlement and protected application budget transition
have been verified. Do not request another odds purchase or key setup; refresh
entitlement evidence when a guarded operation requires it. nflverse's published
data needs no API key or additional statistics subscription. API-Sports account
coverage or a provider support response is not a dependency of this explicit
policy. SportsGameOdds was evaluated as a possible supplement and is not part
of this implementation.

Preserve nflverse attribution, the
[published CC BY 4.0 license](https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md)
link and a notice that Sunday Ledger normalizes the data and applies league
rules. Do not imply endorsement or invent a separate permission requirement for
ordinary use covered by the published license.

The existing release approval covers reviewed additive implementation,
migrations, compatible deployment and conditional activation. Purchases remain
excluded. The designated independent reset has already completed; preserve its
audit and restored original allocation. It must not run again. Week 2 props
still requires source readiness, the real commissioner menu review and all
pregame/race guards. A new accepted bet by any member or a closed entry window
blocks that exception and does not authorize cancellation of new bets.

Follow the [nflverse pilot runbook](../operations/nflverse-primary-pilot.md) and
[Week 2 runbook](../operations/week2-props-cutover.md). These instructions record
authority and acceptance requirements, not a claim that live props are enabled.
