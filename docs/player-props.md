# Full-slate player props and explicit Submit recovery

The September 15 [nflverse primary amendment](governance/2026-09-15-nflverse-primary-pilot.md)
and [release approval and current status](operations/player-props-release.md)
supersede the original source assumptions and build-only boundary below. The later
[Week 2 cutover amendment](governance/2026-09-15-week2-props-cutover.md) permits
only its designated pregame Week 2 exception to the future-only/no-cancellation
rules. It does not relax provider readiness, immutable receipt retention or the
weekly credit limit. Consult that amendment before applying the ordinary
future-week activation instructions to the approved pilot scope.

Implementation and release preparation began under the owner's September 14,
2026 build-only handoff. PR #51 has since been deployed with props offers
disabled under the September 15 release approval. Purchases by the agent remain
excluded. The approved Week 2 exception is separately gated and is not activated
merely by documenting or deploying its support.

## Contract and compatible behavior

Ruleset **1.4 / Product Bible 3.3** extends the existing rolling contract. It
offers six canonical full-game player/statistic choices for each game in the
existing published slate: both QBs passing, both RBs rushing, and one WR/TE per
team receiving. Over and Under are sides of the same opportunity. Standard
DraftKings lines include overtime; there are no parlays, alternate lines, live
yardage counters, extra games, or separate credits.

All positions share the original 1,000 credits, cumulative 20-position limit,
minimum 50 whole credits, and existing heavy-favorite cap. Returns never fund
new bets. One accepted batch either commits entirely or writes no receipts.
Existing receipts and the old serializer remain immutable. New prop receipts
carry a versioned canonical representation, accepted label/team, subject,
statistic, period, price, line, stake, and governing identity.

The approved `NFLVERSE_PRIMARY` source uses the
`FEATURED_HIGHEST_STANDARD_LINES` nomination policy: for each team, choose the
mapped QB with the highest available standard passing-yardage line, RB with
the highest standard rushing-yardage line and WR/TE with the highest standard
receiving-yardage line. Current roster mappings establish position, team and
identity; a QB rushing market cannot fill the RB slot. Display these as featured
players, not confirmed starters. A posted line does not establish health,
availability or offensive participation.

Identity, team, date, duplicate and same-name ambiguity fails closed. Any tie
needs the recorded deterministic policy or a reviewed exception. All three
slots use the latest coherent per-game nomination snapshot within the existing
twelve-hour discovery window, with the bookmaker observation at most ten minutes
old when acquired. Review exposes that snapshot time. This evidence chooses an
identity; executable quotes retain the separate strict freshness gates below.
Missing standard lines do not trigger usage, depth-chart or alternate-line
fallbacks.

The explicit commissioner Prepare action queues shared automatic acquisition of
nflverse roster and schedule evidence plus bounded bookmaker identity/line
discovery. Depth-chart acquisition is not required by this selection policy.
The selected source/nomination policy and source revisions are retained with
the menu audit. API-Sports coverage, games, rosters and account credentials are
not dependencies of this explicit mode. The older `API_SPORTS_NFLVERSE` mode
keeps its own validation requirements. Routine preparation requires no
operator-authored player manifest.

For the ordinary future-week path, the first accepted bet by any member,
including a game-line bet, freezes the week's player identities under the
acceptance lock. The approved already-open Week 2 exception freezes its reviewed
complete menu inside the atomic cutover, reusing the exact completed independent
reset. In either path, a known frozen player can receive quotes later; an
unresolved identity stays unavailable. Explicit per-game quote refresh handles
late lines without substituting players.

Successful submission reveals one distinct game identity immediately. Player
names, pick counts, prices, amounts and batches remain behind the existing
reliable-start/authoritative-void gate. Existing whole-card aggregates retain
their approved timing. A scheduled kickoff closes betting but does not itself
authorize revealing picks.

## Submit and public quote evidence

An explicit Submit binds a durable economic intent using trusted snapshots and
the actor/card/week/rules identity. Proof and snapshot timestamps are not
economic consent. Authorization precedes replay. A committed retry returns its
original result before provider work.

The same Submit click may renew evidence once. Identical economics accept with
a new proof; changed terms, including better prices, require new explicit
consent and a new intent. Missing offers preserve the whole draft batch. No
timer, page read, focus event, or background worker submits a bet.

The policy keeps 60-second fetch reuse, 120-second successful-fetch age,
10-minute bookmaker-observation age and 30-second review expiry, each bounded
by authoritative event/week cutoffs. Shared public coverage is exact by source,
book, event and family. Private drafts and user reviews are not shared. Main
lines use bulk requests; props fetch only selected games/families. Main imports
still require exactly six main outcomes and cannot attest prop freshness.

Each network request reserves conservatively; unknown failures retain cost.
Claims and leases deduplicate shared coverage, with three-second global start
spacing, at most four workers, ten-second fetch timeouts and a 90-second action
deadline. A mixed 20-position batch can require one main request plus 16 event
requests. The routes request a 120-second host duration. Hosted verification
must confirm that duration is supported for this project before live use.

## Evidence and settlement

The approved `NFLVERSE_PRIMARY` policy uses published nflverse player totals
and PFR offensive snap evidence as its primary result path. Its source and
nomination policy are explicit and auditable. No API-Sports or SportsGameOdds
integration is required for this mode. A newer network response alone does not
override authoritative evidence; disagreement becomes a correction candidate.

Only a final game plus complete individual statistics and verified offensive
participation grade a prop. Zero and negative values grade normally; equality
pushes. Verified no offensive snaps, including special-teams-only participation,
voids. Injury after offensive participation does not refund the position.
Missing data, an active designation or a zero-only row cannot prove DNP.

Player observations, participation evidence, bundles and settlements have
independent append-only revisions. Stat-only changes do not invent different
team scores. Pending props have no settlement row and block required finality;
unselected players create no result obligation. Earlier games can settle while
later games remain open. The existing automatic-finalization and protected
postseason/history authorities remain in force.

The result worker uses shared event jobs, leases and bounded retries. The
nflverse mode checks real per-game completeness and independent totals/snap
revisions; a successful file download is not a blanket completeness assertion.
Unresolved evidence creates an incident and an authorized verified-evidence
exception path, never an invented result or void. Browser reads do not fetch
provider data. The separate API-Sports mode retains its own shared quota rules.

For this pilot, **overnight settlement** replaces the original unverified
5–15-minute target. It is an expectation, not a deadline: totals and snap feeds
can arrive later. Measure final detection, source availability, import and
member-visible settlement in hosted operation. The source's later
Wednesday-night/Thursday corrections still use the existing review boundaries;
no retry horizon, correction clock or protected history is changed by this
source-policy decision. Follow the [verified-exception runbook](operations/nflverse-primary-pilot.md).

## Historical September 14 starting point

This section preserves the original inspection, not current entitlement or
release state. The September 15 source index and release record supersede it.

Read-only inspection matched main and READY Production at
`56d1cbfc83d833a90d35d2a9a9c1640751a9c57b`, deployment
`dpl_ByXjuUkpxRa3DKhBxP8wYeLEaeiW`, with all 56 original migrations.
Both global catalogs are 1.3/3.2; already-open weeks include older 1.1/1.2
bindings. Earlier preparation prose saying global 1.2 was active is stale.
There were zero duplicate exact market observations in the migration preflight.

Production's existing pg_cron job is enabled at `*/5 * * * *`, and pg_net and
Vault are installed. Vercel is Hobby. No paid test database was created.
Existing Production limits remain 90/day, 450/month and provider floor 30.
At inspection, recorded app usage was 26/day and 94/month, with stored provider
remaining 394. Stored remaining is historical accounting, not current entitlement.
No Odds API or API-Sports request has been made by this implementation workflow.
Read-only public nflverse checks returned current 2026 data from all three
catalog URLs: 2,963 roster rows, 272 scheduled games and 1,041 player-stat rows.
Required columns and the roster's less-than-48-hour source timestamp were
verified. These checks do not establish API-Sports account access, complete
participation coverage or cross-provider identity readiness.

## Candidate operating budget and costs

The owner has completed the Odds API 20K subscription/key setup, and secure
entitlement verification and the protected budget transition have completed.
Do not request another purchase, replacement key or setup confirmation. Guarded
operations still need current entitlement evidence; preserve actual usage and
provider reset accounting.

The approved application configuration is 1,000 app credits/day and 5,000/month, with genuine
protected core/result capacity of 350/day and 2,000/month. Optional props cannot
consume that remaining reserve. Applying the configuration requires fresh
verified 20K entitlement and does not reset recorded usage or enable offers.

Illustrative demand, not a polling schedule: ten three-family refresh
equivalents per game/week, one catalog quote fetch, 20 bulk main fetches, four
disjoint finish windows with 112 two-credit score calls, plus 15% headroom:

| Eligible games | Four-week month | Five-week month |
| -------------- | --------------: | --------------: |
| 14             |           3,432 |           4,290 |
| 16             |           3,736 |           4,670 |

Five separate finish windows in the 16-game case approach 4,995/month. Demand
above these assumptions throttles optional props; 5K is a tested candidate pilot
cap, not a guarantee of unlimited traffic. A full 16-game catalog fetch can cost
48 credits. The authorized 20-credit build smoke ceiling cannot prove all 48
families in a single full-slate fetch.

The approved nflverse path requires no statistics account, API key or new
subscription. API-Sports' free account did not establish current-season access;
its key and unresolved permission request are not launch requirements for
`NFLVERSE_PRIMARY`. SportsGameOdds remains outside this implementation.

nflverse sources require [CC BY 4.0 attribution](https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md).
Ledger normalizes their published totals and snap evidence and applies league
rules; it does not reconstruct statistics from play-by-play. See the
[publication schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html).
The existing odds subscription covers odds capacity; no additional statistics
or hosting purchase is established as necessary for this pilot.

## Release sequence and owner boundaries

The sequence below describes the ordinary future-week path. For the approved
already-open Week 2 exception, follow the
[Week 2 operator runbook](operations/week2-props-cutover.md); do not apply an
unopened-week hold or defer the menu freeze until a replacement bet.

1. Finish the final-head quality, migration/pgTAP, native concurrency, real Auth
   desktop/mobile and regression gates. A rendered fixture Preview is separate
   from authenticated acceptance. See the Phase 8C workflow and retained artifacts.
2. Owner odds setup and secure 20K entitlement verification are complete. Refresh
   entitlement evidence where the operation requires it and use the explicit
   nflverse source policy. No NFL statistics key or new account is required.
   Do not repeat completed setup or release-approval requests.
3. Execute under the retained release approval: apply reviewed additive
   migrations in filename order, deploy compatible code with props offers
   disabled, and verify parity. PR #51's five migrations and disabled deployment
   are complete; do not reapply them. The Week 2 amendment's new migration and
   deployment evidence must be recorded separately.
4. Agent verifies secure server keys, current entitlement and provider source
   policy; configures the approved cap transition, scheduler and acquisition hold.
   After ordinary preceding-week finality, the next eligible publication remains
   PLANNED under its inherited rules and queues bounded catalog acquisition.
   Agent validates bulk catalog/result mappings and proves quote/result readiness
   before the held week may open.
5. Agent runs pilot activation under the same locks as week opening. Select the
   first eligible unopened week at activation; if the intended week has opened,
   use the next eligible unopened week. Global game-only catalogs and all opened
   or completed bindings are preserved. No past week is recalculated for adoption.
6. Agent verifies live quote coverage, acceptance, pending/result behavior, quotas
   and incidents. Measure actual final-to-visible latency rather than inferring it
   from fixture success.

`scripts/player-props/preflight.sql`, `activate.sql`, and `disable.sql` prepare
the reviewable database operations. Disabling offers must preserve processing,
reveal, corrections, receipts and history for accepted props. After any prop is
accepted, rolling back to an old binary that cannot read those receipts is unsafe;
use a compatible disable or forward fix.

## Evidence status

The integration milestone `3e2b087f` passed formatting, lint, TypeScript, 650 unit
tests in 98 files, the production build, all 45 native SQL suites with 1,673
assertions, all four native concurrency scripts, scheduler verification and
generated-type parity. Final-head results, later regression additions and the
real authenticated desktop/mobile gate are recorded on [PR #51](https://github.com/alexpfeffer4/sunday-ledger-matchups/pull/51).
Use the exact head and CI result there as PR #51's release evidence. Approval is
already retained; the later Week 2 amendment requires its own tested-head and
deployment evidence without repeating the owner approval.

Local SQL diagnostics use PostgreSQL-compatible PGlite because this workspace
cannot start native PostgreSQL or Docker. The scheduler migration is omitted
from those diagnostics; they are not native concurrency or authenticated
end-to-end proof. Required CI uses real disposable Supabase/PostgreSQL/Auth,
separate sessions and Playwright. Physical-device certification is not claimed.
The disabled Preview has no writable Production backend; its exact deployed
commit, browser checks and screenshots are recorded in the
[Preview report](operations/player-props-preview-verification.md).

Real menu identity/line coverage, conservative participation/completeness checks,
a credible executable exception path and actual commissioner review remain
activation gates after CI passes. Hosted overnight result timing is pilot
measurement, not a proven guarantee. Buying odds capacity alone does not
establish readiness to accept live props.
