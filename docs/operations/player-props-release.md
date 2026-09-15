# Player props: owner setup and controlled release

This is the prepared release for [PR #51](https://github.com/alexpfeffer4/sunday-ledger-matchups/pull/51).
The build authorization permits public code, tests, documentation and an isolated
Preview. It does **not** permit purchases, provider outreach, Production changes,
merge or live activation. The final release report records the tested head and
outstanding verification separately.

## Owner account actions

| Action                                                                                                                                                                                                                                        | Exact account or settings page                                                                                                                                                                                                                 | Cost and launch effect                                                                                                                                                    | Agent's next step                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirm the existing Odds API subscription is 20K; upgrade that subscription if it is still the free tier. Use **Manage Subscription**, retaining the existing key. Do not buy a duplicate subscription.                                      | [Existing Odds API dashboard](https://dash.the-odds-api.com/), [upgrade instructions](https://the-odds-api.com/manage/upgrade-downgrade-cancel-a-subscription.html)                                                                            | Advertised $30/month for 20K. Required for the prepared live budget. The dashboard was signed out during this build, so the actual current account tier was not verified. | Verify actual entitlement, remaining allowance and reset evidence securely; apply the tested application-cap transition without resetting usage.                                            |
| Supply a usable API-Sports **NFL** account/key. Reuse an existing account if available; otherwise create the advertised free account. Store the key only as server variable `API_SPORTS_NFL_KEY` in the approved Production deployment scope. | [NFL free plan](https://api-sports.io/sports/nfl), [Account / My Access](https://dashboard.api-football.com/profile?access=), [Vercel environment variables](https://vercel.com/pfeffer/sunday-ledger-matchups/settings/environment-variables) | Target $0, advertised no card. A key was unavailable to the build. Blocks real-account validation and launch; does not block the disabled code release.                   | Verify the key and free allowance; test 2026 game/player coverage, mapping, complete individual totals and participation. Never paste a key in chat or put it in a `NEXT_PUBLIC_` variable. |
| Provide an existing applicable API-Sports permission covering this league's display and permanent normalized settlement evidence, or authorize the agent to obtain clarification.                                                             | [API-Sports terms](https://api-sports.io/terms)                                                                                                                                                                                                | Cost unresolved; no purchase proposed. Blocks selection of this source for live settlement. The published terms alone do not settle the exact use/retention question.     | Assess the specific permission against the implemented retained fields; keep source-validation flags false until resolved. The build did not contact the provider.                          |
| Approve the concrete tested release and its compatible disable plan after the required code gates pass. Approval may authorize a disabled deployment while retaining live-activation readiness gates.                                         | [PR #51](https://github.com/alexpfeffer4/sunday-ledger-matchups/pull/51) and this release plan                                                                                                                                                 | No separate release fee. Required before merge, Production migrations/deployment, scheduler/configuration changes or rules activation.                                    | Execute the approved operations in the order below; do not ask the owner to edit SQL, code or quota rows.                                                                                   |

The NFL account's real free coverage and source completeness remain unknown until
the secure checks run. A provider subscription purchase cannot establish them.
No separate hosting upgrade is currently justified: the existing Supabase
five-minute cron, pg_net and Vault path is installed, and Vercel's documented
Hobby Fluid duration supports the requested 120-second quote action. Verify the
effective deployment setting before activating offers.

Expected incremental monthly cost is **$30 for odds + target $0 for statistics**,
plus existing hosting. Any additional statistics permission/coverage cost is
unresolved. This is not a claim that $30 covers every automatic-settlement
dependency.

## Agent execution after setup and approval

1. Recheck that current main, the reviewed PR head and the intended deployment
   match the approval. Confirm the pilot's current season and first eligible
   unopened week. If the intended week opened, select the next unopened week;
   never repin an opened or completed week.
2. Apply the reviewed additive migrations in filename order and verify exact
   migration-ledger parity. Deploy the compatible application with new offers
   disabled. Keep legacy receipt hashes, game betting and global 1.3/3.2 catalogs
   unchanged.
3. Verify secure server settings. Reuse valid existing Odds API, Supabase and
   `SCORE_JOB_SECRET` values. Add only missing `API_SPORTS_NFL_KEY` in the approved
   scope. The disabled Preview must not inherit a writable Production backend.
4. Verify upgraded odds entitlement and actual usage, then run
   `scripts/player-props/quote-policy.sql`: 90/day → 1,000/day and 450/month →
   5,000/month, with 350/day and 2,000/month reserved for core lines/results.
   Preserve historical usage and independently reconcile provider resets.
5. Prepare and verify the existing five-minute dispatcher using the reviewed
   SQL template, then enable the separately gated metadata acquisition for the
   approved pilot using `scripts/player-props/catalog-setup.sql`.
   This records an acquisition hold at the first eligible unopened week without
   enabling offers or new rules. This helper applies to the existing active LIVE
   season and rejects initial drafts. Once the current week meets its ordinary FINAL
   prerequisite, publish the next eligible slate through the existing authority.
   The held week remains PLANNED under its inherited binding and atomically
   queues catalog work. It cannot open before readiness and scoped activation.
   Acquire and validate shared source mappings and role proposals under the
   independent 20-metadata-request/day allowance. A cold full-slate bootstrap
   requires 34–36 API-Sports requests across at least two UTC quota days and
   up to 48 Odds API credits for 16 games. These full-slate checks exceed the
   earlier 20-request/20-credit build smoke ceilings and belong in the approved
   release-validation allowance. Page reads do not fetch data and a missing
   source never creates a fictional player. Keep offer acceptance disabled.
6. Validate real current-season quote coverage, complete player results,
   offensive participation/zero/DNP edge cases, correction revisions and a
   credible eventual evidence path for every offered prop. Record source rights
   and attribution. Set result-source validation flags only when evidence passes.
7. Enable the validated result-processing policy. Keep the 80 result / 20 metadata daily split and maximum eight
   API-Sports requests per minute. Verify delivered job calls, quotas, retries,
   incidents and member-visible results; measure actual final-to-visible latency.
8. Record a readiness manifest and run the scoped activation under the same
   season locks used by week opening. Use the immutable LIVE 1.4 / 3.3 package
   only for the eligible future pilot week. The held PLANNED week adopts the
   prospective package when opened; no opened binding changes. Prepare the full menu for one
   commissioner review, confirm exceptions, then open entry. The first accepted
   bet freezes player identities; delayed quotes may serve those same players.
9. Verify ordinary game lines, mixed submission/recovery, reliable-start privacy,
   pending player results, history, job delivery and budget protection. Monitor
   actual operation without placing synthetic bets in the real league.

The five additive migration files, in execution order, are:

1. `20260914230141_player_props_authority.sql`
2. `20260914230233_player_prop_results.sql`
3. `20260914230314_selective_player_prop_quotes.sql`
4. `20260914230353_card_submission_intents.sql`
5. `20260914234839_player_catalog_acquisition.sql`

The acquisition hold is part of the combined release approval. It does not waive
the ordinary preceding-week finality requirement or permit opening an unvalidated
props week. If an eligible week opens before setup, select the next unopened
week. If source validation fails while a week is held, the prepared
`scripts/player-props/abort-catalog-hold.sql` can release that exact untouched
PLANNED week for ordinary game-only play under 1.3. It requires the same combined
approval, exact scope and recorded reason; it rejects activated props, receipts,
stale targets and closed entry windows. A later attempt targets the next eligible
unopened week. Never bypass the readiness guard or repin an opened week.

## Compatible disable and remaining validation

`scripts/player-props/disable.sql` stops new prop offers and acceptance while
preserving the supported package and all accepted-prop processing, reveal,
corrections, receipts and history. Keep a compatible application deployed. An
old binary that cannot interpret prop receipts is not an acceptable rollback.
New capability never triggers recalculation of completed weeks.

The hosted Preview is a labeled fictional UI with submission disabled. Native
disposable Supabase/Auth/browser checks establish application behavior; they do
not prove real provider coverage, an isolated hosted Auth backend, physical
iPhone behavior or the 5–15-minute settlement target. No physical-device action
is required from the owner solely because emulation is used; ask only if a
specific remaining device risk is discovered.
