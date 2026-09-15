# Full-slate player props and explicit Submit recovery

Implementation and release preparation for the owner's September 14, 2026
handoff. This feature is **disabled for Production**. This document does not
authorize a purchase, migration, merge, deployment, scheduler change, or rules
activation. The public feature branch and isolated Preview are authorized.

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

Bulk verified directory/crosswalk/role manifests feed
`buildPlayerCatalogBootstrap`; the service imports canonical mappings and
proposes a full slate for one commissioner review. It never infers an RB from
a rushing market or a WR/TE from a receiving market. Same-name, suffix, team,
date, and result-path ambiguity fails closed. A highest-line fallback is labeled
as a projection rather than starting-role evidence. Acquisition of a usable live
crosswalk remains a provider validation gate; fictional fixtures are not one.

The explicit commissioner Prepare action now queues shared automatic acquisition:
API-Sports season coverage, games and team rosters; nflverse season roster,
schedule and recent usage; and bounded bookmaker identity discovery. Persisted
source leases/cache and job progress resume through the existing scheduler.
Routine preparation does not require an operator-authored player manifest.
Previously verified bookmaker aliases allow a known player to remain in the
menu before this game's line appears. Missing or ambiguous identities fail closed.

The first accepted bet by any member, including a game-line bet, freezes the
week's player identities under the acceptance lock. A known frozen player can
receive quotes later; an unresolved identity stays unavailable. Explicit
per-game quote refresh handles late lines without substituting players.

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

API-Sports NFL is the candidate initial individual-totals source. nflverse is
the candidate later reconciliation and snap-evidence source. Their roles are
persisted and deterministic. A newer network response alone does not override
authoritative evidence; disagreement becomes a correction candidate.

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

The result worker uses shared event jobs, leases, bounded retries at initial,
+5/+15/+30/+60 minutes, and bounded reconciliation. API-Sports has an independent
80/day result-attempt budget plus 20/day other calls, no more than eight/minute,
with lower observed limits and 429 backoff honored. Missing evidence produces
an incident, never an invented void. Browser page reads make no provider calls.

The existing score pipeline checks accepted-prop games in bounded finish windows
starting about kickoff +2h45. The target 5–15 minutes from final is **unmeasured**:
it depends on final detection, scheduler execution, source completeness and
member-visible settlement. nflverse snaps can arrive later, so this is not a
promise for DNP/ambiguous cases.

## Verified starting point

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

The existing [Odds API dashboard](https://dash.the-odds-api.com/) supports
Manage Subscription. The advertised [20K plan](https://the-odds-api.com/) is
$30/month. Its [upgrade instructions](https://the-odds-api.com/manage/upgrade-downgrade-cancel-a-subscription.html)
say the same key is retained. Do not create a duplicate subscription or rotate a
working secret without evidence. Provider usage resets and subscription billing
dates are distinct; verify entitlement and cycle rather than resetting usage.

The prepared configuration is 1,000 app credits/day and 5,000/month, with genuine
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

API-Sports [NFL free access](https://www.api-football.com/news/post/how-to-get-started-with-api-nfl-the-complete-beginners-guide)
advertises 100/day, ten/minute and no card. Its key is in
[Account / My Access](https://dashboard.api-football.com/profile?access=).
Use server-only `API_SPORTS_NFL_KEY`, never a `NEXT_PUBLIC_` name. Current-account
2026 coverage, mapping, complete statistics, participation and use/retention
remain unverified. [Terms](https://api-sports.io/terms) do not themselves grant
publication/commercial rights; applicability and permanent normalized evidence
retention require resolution before selecting it for live settlement.

nflverse sources require [CC BY 4.0 attribution](https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md).
Ledger normalizes their published totals and snap evidence; it does not
reconstruct statistics from play-by-play. See the [publication schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html).

Expected incremental cost: $30/month odds, target $0 extra statistics, existing
hosting separately. No hosting upgrade is currently established as necessary:
the existing Supabase scheduler supplies five-minute dispatch. Statistics rights,
coverage and any associated additional cost remain unresolved.

## Release sequence and owner boundaries

1. Finish the final-head quality, migration/pgTAP, native concurrency, real Auth
   desktop/mobile and regression gates. A rendered fixture Preview is separate
   from authenticated acceptance. See the Phase 8C workflow and retained artifacts.
2. Owner upgrades the existing odds subscription, supplies any missing NFL stats
   key securely, and resolves the concrete provider validation/access requirements.
   Do not paste secrets into chat. The server setting route is
   [Vercel environment variables](https://vercel.com/pfeffer/sunday-ledger-matchups/settings/environment-variables).
   Production settings are not changed during build preparation.
3. After a concrete release approval, apply the additive migrations in filename
   order, deploy the compatible app with props offers disabled, and verify parity.
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
Use the exact head and CI result there when approving release.

Local SQL diagnostics use PostgreSQL-compatible PGlite because this workspace
cannot start native PostgreSQL or Docker. The scheduler migration is omitted
from those diagnostics; they are not native concurrency or authenticated
end-to-end proof. Required CI uses real disposable Supabase/PostgreSQL/Auth,
separate sessions and Playwright. Physical-device certification is not claimed.
The disabled Preview has no writable Production backend; its exact deployed
commit, browser checks and screenshots are recorded in the
[Preview report](operations/player-props-preview-verification.md).

Real player coverage, source permissions, zero/DNP edge completeness and measured
5–15-minute settlement remain activation gates even after CI passes. Buying odds
capacity alone does not establish readiness to accept live props.
