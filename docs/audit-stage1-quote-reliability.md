# Audit Stage 1: dependable card quotes

Status: A01 policy and production rollout approved by the owner on 2026-09-10.
The production migration is applied with the policy disabled; activation still
requires verified existing provider allowance and server configuration.
Baseline: main `d6e666e2575b534cf1d2954f4988a19f1fe2fd4a` (PR #28).
The existing importer, quote heads, whole-card acceptance engine, immutable
receipts, frozen Ruleset versions, and owner rehearsal already existed. This
change extends those paths. Invite/account work from #28 is retained.

## Approved governing amendment

The owner approved the following technical Live operating contract as an amendment to
Architecture revision 1.1 section 10 and the commissioner-only ingestion
restriction in D-009. Approval includes the database migration, PR #29 merge,
deployment, and activation within the existing provider plan, with no additional
spending. It does not authorize a subscription upgrade or purchase.

1. `observed_at` / receipt `quote_observed_at` remains the provider market's
   `last_update`. It is never replaced with fetch or review time.
2. A server fetch must finish successfully and persist the complete published
   slate. Its `fetched_at` must be no more than **120 seconds old** at review
   and acceptance. Only a server service credential can attest to that fetch,
   using an authenticated, database-issued lease for the selected slate.
3. The provider observation must be no more than **10 minutes old**, no later
   than the fetch, and no later than confirmation. Older responses fail closed
   even when the HTTP request succeeds. Ten minutes is the approved initial
   technical availability bound, not a claimed provider guarantee.
4. A database-issued review binds the actor, card, every snapshot/hash/stake,
   review time, and fetch evidence. Confirmation must occur within **30 seconds**
   and before the common lock. Odds are not held. All snapshots must still be
   current; changed terms require another review and explicit per-pick approval.
5. An explicit member review may request a server refresh. A page render,
   navigation, timer, or browser polling cannot call the provider. The existing
   commissioner refresh shares the same coordinator while enabled. Existing
   roster opening uses the same fetch/source checks. Initial slate publication
   and later-week publication retain their existing commissioner prerequisites.
6. Weekly credits, stake caps, cardinality, frozen Rulesets, game-start checks,
   common lock, immutable accepted terms, correction history, and event-based
   opponent visibility retain their existing authority. Simulation is unchanged.

The audit identified that a new fetch can still carry a provider timestamp
older than the two-minute acceptance window; it did not measure production
rejection frequency. A read-only check on September 10 of the latest 50 stored
Live imports (excluding owner rehearsals and requiring provider-shaped event
IDs) found 15 imports containing 1,440 market observations, fetched August 27
through September 1. Source age at fetch ranged from 4.3 to 103.3 seconds;
median 49.8 seconds, 95th percentile 103.3 seconds. None exceeded 120 seconds
at fetch. The oldest responses therefore left less than 17 seconds under the
old source-only acceptance gate. This sample supports separating the clocks;
it does not establish a stale-fetch failure rate or validate a ten-minute
ceiling near kickoff. The approved ceiling still requires monitoring.
No new provider request was made for this evidence.

The five-minute-old unchanged-source case runs through the database and
full-stack lane; the 25-minute-old rejected-source case runs in pgTAP. Both are
explicit fixtures, not measured production observations.
The provider documents featured-market
updates around 60 seconds pregame, accelerating near kickoff; that is not a
promise that every bookmaker market timestamp changes on every request.
See [update intervals](https://the-odds-api.com/sports-odds-data/update-intervals.html)
and the [V4 API reference](https://the-odds-api.com/liveapi/guides/v4/).

## Cadence, quota, and failure behavior

- Demand-driven during the current published pre-lock window; no scheduler.
  A successful fetch is reused for 60 seconds across the league. The review
  window is 30 seconds and does not extend fetch/source validity.
- One 45-second database lease per week. Concurrent callers receive a short
  retry message; there is no automatic retry loop. Success or failure enforces
  a 60-second per-week interval, and a global three-second request interval.
- Requests use the server-selected event IDs, DraftKings, and the existing
  moneyline/spread/total markets. The V4 documented cost is three credits for
  these three markets and one bookmaker. Reserve three credits before each
  attempt, including failures, and never refund the conservative reservation.
- Default caps: 300 credits per UTC day, 1,500 per UTC calendar month. Stop when
  the provider's reported remaining balance would fall below a 30-credit
  reserve. Concurrent responses cannot increase the recorded balance. At a
  verified provider billing reset, an operator must reconcile that balance;
  the application does not assume the provider's reset matches a UTC month.
- Example assumption: one league, ten members, two uncached reviews each week
  costs at most 60 credits/week, or 240 in four weeks. Deduplication reduces
  this. Separate leagues have separate caches. The default monthly ceiling is
  500 attempts, not a claim about the subscribed plan's included allowance.
- Initial commissioner imports, discovery, and score ingestion remain outside
  these new reservation counters. The provider balance includes their usage
  when next reported. Stage 2 must coordinate them before enabling automation.
- The actual account plan, billing reset, available credits, deployment secret,
  and production request behavior have not been verified. No plan change or
  added subscription is proposed. Verify allowance and lower caps to fit the
  existing approved plan before activation; any additional charge needs a
  concrete separate decision. Do not interpret default caps as spend approval.

Provider errors, omitted events, backward observations, stale timestamps,
expired leases, budget exhaustion, and unavailable configuration preserve the
draft and fail closed. The refresh transaction rolls back imports and quote
heads together; the coordinator records a failed attempt. A changed price
preserves the stake, displays old/current terms by game, and requires approval.
If the new price makes the stake invalid, the member must edit it; there is no
silent reduction. A lock-time rejection creates no partial receipts. A repeated
successful confirmation returns its existing command receipt, including after
lock. Concurrent confirmations recheck that receipt after acquiring card locks.
Live confirmation and roster opening read wall time after locking, so a
transaction started before lock cannot bypass the deadline by waiting on a lock.
The canonical Simulation clock retains its existing meaning.

## Rollout and rollback

1. Review/approve the exact amendment above and PR evidence. Merge requires
   separate authorization. Recheck current main and required checks first.
2. Apply `20260910202847_dependable_card_quotes.sql` only through the normal
   authorized production migration process. It creates private operational and
   append-only review evidence tables, adds a nullable verification link to
   current quote heads, and extends existing functions. It performs no receipt
   backfill or competitive-history rewrite. Policy is disabled by default.
3. Deploy the reviewed application with the existing `ODDS_API_KEY` and
   server-only `SUPABASE_SECRET_KEY`. The latter is used only to complete a
   claimed provider refresh; participant reads continue using the member JWT.
   Never put this secret in a `NEXT_PUBLIC_` variable.
4. After explicit activation approval, reconcile the real allowance and set
   the single private policy row's limits, verified `requests_remaining`, and
   `enabled=true` using the authorized database operator. No public toggle or
   participant-admin grant is introduced. Leave the mechanism disabled if the
   plan or secret is unavailable. Test a designated league before broader use.
5. Inspect policy counters, refresh lease/state/fetched time, and the separate
   provider observation timestamps. Confirm a member can seal without an
   operator refreshing on cue. Verify production receipt immutability/privacy
   without inspecting another member's unrevealed picks.

Immediate disable: an authorized operator sets
`private.odds_refresh_policy.enabled=false`. No new coordinated calls or review
acceptances run. Existing in-flight reviews fail closed. The legacy manual
two-minute source path remains available; it retains the original availability
limitation. Keep review evidence and receipt links; do not delete or rewrite
them. Roll the application back only after disabling the policy. There is no
new job, paid service, or scheduler to remove.

## Approved rollout record — 2026-09-10

- Rechecked main and production at `d6e666e2575b534cf1d2954f4988a19f1fe2fd4a`.
  All four PR workflows passed at `1e1a4e3254d24f9020a63ce642539ff7349f3245`.
- Applied the reviewed migration through Supabase's migration API. Hosted
  version is `20260910202847`; the repository filename was aligned before
  merge. SQL is byte-identical (MD5 `bf57d0b0f3147396d1ef58327e198b9e`).
- Post-apply checks confirmed the policy is disabled, counters are zero,
  member claim access is present, and only the server role can complete a
  refresh. The exposed schema remains `api`; operational tables remain private.
- The provider account requires sign-in. Account allowance and production
  secret configuration remain activation prerequisites. No provider request,
  new charge, participant card, or competitive record was created by rollout.
- Read the latest PR rollout record and standalone Stage 1 completion note for
  the final deployment and activation state; approval alone is not activation.

## Stage 2 handoff

Read the completion note and verify merge/rollout state before continuing A02
and A10. Reuse the global quota row and provider balance, but do not hold a
database transaction across an HTTP request. Preserve the order of locks
(quota policy, season when needed, week, refresh lease) when extending work.
Quote leases cover only pre-lock selected odds; scores need their own window,
cost reservation, overlap protection, final-score retention, and stop rules.
The 30-credit reserve is a stop threshold, not a complete scoring allocation.
Browser refresh must only read authorized stored state. This stage introduces
no score ingestion, scheduled kickoff reveal, automatic finalization, or new
rehearsal engine. Provider observation, successful fetch, and review time must
remain distinct in later freshness UI.
