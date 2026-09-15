# Player props: owner setup and controlled release

## September 15 continuation: approved Week 2 exception

PR #51's compatible application and five additive migrations are deployed with
props offers disabled. The secure Production account check verified the NFL key
and a 100-request daily allowance. This proves account access, not full provider
coverage or use/retention permission. Key creation and release approval do not
need to be repeated. The original preparation sequence below is retained for
its readiness gates and future-week path.

The owner subsequently requested props in the already-open pilot Week 2 and a
reset of the designated accepted card. Follow the
[Week 2 cutover amendment](../governance/2026-09-15-week2-props-cutover.md) for
that scope: immutable old receipts, recorded cancellation, a replacement card
generation and the same 1,000-credit allocation. Reset only in the transaction
that activates and freezes the reviewed complete props menu before every
published game's cutoff. Use the
[Week 2 operator runbook](week2-props-cutover.md) and its separate stage, catalog
and cutover phases; the ordinary future-week acquisition hold below does not
apply to this already-open week.
Until then, preserve existing play. This exception is being prepared; its
implementation, tests and execution must be reported separately.

The owner now reports completing the Odds API **20K subscription** setup and
installing its replacement key in the existing server-only Vercel variable.
Do not request another upgrade or key setup. The agent must verify a fresh
deployment and its live account allowance headers before the cap transition;
keep actual application caps at **90/day and 450/month** until that verification
passes. The protected account check is being prepared with a shared lease and
a zero-credit provider endpoint; its results must not expose the key or alter
usage history. The owner also authorized the dashboard verification check, but the site rejected the
attempt. No request was sent. The
[ready support draft](api-sports-permission-request.md) uses only the verified
official dashboard route. A provider response and the single commissioner menu
review remain readiness gates; neither requires another generic release
approval. No purchase is authorized.

## Original controlled-release preparation

This is the prepared release for [PR #51](https://github.com/alexpfeffer4/sunday-ledger-matchups/pull/51).
The September 15 owner response approves the combined release plan below and
authorizes provider use/retention clarification. That initial response reported
a free Odds API account and creation of `API_SPORTS_NFL_KEY`; the completed
20K setup and verified NFL-key status above supersede those setup tasks.
Preserve this approval:
merge, additive migrations, compatible deployment, configuration and conditional
future-week activation no longer require another release-approval request.
Purchases remain excluded. The paid-budget transition and live offers remain
blocked until actual entitlement and every source/readiness gate pass.

The integrated release preserves September 15 PR #52 (scheduled-day filters) and
PR #53 (historical matchups), based on main
`6be1f0efb22ea303ebff09196d0a0cd6b6a6dc04`. The PR's current release report records
the final tested head, actual deployment and remaining validation separately.

## Account actions and retained approvals

Current owner status: Odds API 20K purchase/key installation is complete by owner
report and awaits the agent's secure verification against a fresh deployment;
the NFL key and its 100-request daily allowance are already verified in
Production; provider clarification is authorized but unsent after the rejected
dashboard check; combined release is approved; commissioner menu review follows
source validation. Do not request completed setup or approval again.

| Action                                                                                                                                                               | Exact account or settings page                                                                                                                                                  | Cost and launch effect                                                                                                                                                | Agent's next step                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Completed by owner report: 20K Odds API subscription and replacement key installed in the existing server-only Vercel variable. No repeat purchase or setup request. | [Existing Odds API dashboard](https://dash.the-odds-api.com/), [Vercel environment variables](https://vercel.com/pfeffer/sunday-ledger-matchups/settings/environment-variables) | Advertised $30/month for 20K. Actual entitlement remains an agent verification gate; caps stay 90/day and 450/month until it passes.                                  | Verify fresh deployment, live allowance headers, remaining credits and reset evidence securely; then apply the tested cap transition without resetting usage. |
| Completed: usable API-Sports **NFL** key installed and verified in Production as server variable `API_SPORTS_NFL_KEY`.                                               | [NFL free plan](https://api-sports.io/sports/nfl), [Account / My Access](https://dashboard.api-football.com/profile?access=)                                                    | Target $0. The protected runtime check verified account access and a 100-request daily allowance. Coverage and source permission are separate gates.                  | Test 2026 game/player coverage, mapping, complete individual totals and participation. Never paste a key in chat or put it in a `NEXT_PUBLIC_` variable.      |
| Provider clarification and the verification attempt are authorized. An applicable permission response remains outstanding after the site's rejected dashboard check. | [API-Sports terms](https://api-sports.io/terms), [prepared official-dashboard request](api-sports-permission-request.md)                                                        | Cost unresolved; no purchase proposed. Blocks selection of this source for live settlement. The published terms alone do not settle the exact use/retention question. | Assess the response against the retained fields; keep source-validation flags false until resolved. Do not request outreach approval again.                   |
| Completed: release and compatible recovery approved, including the later conditional Week 2 reset/props exception.                                                   | [PR #51](https://github.com/alexpfeffer4/sunday-ledger-matchups/pull/51), [Week 2 amendment](../governance/2026-09-15-week2-props-cutover.md)                                   | No separate release fee. Source/readiness gates remain.                                                                                                               | Execute the approved operations after their required checks; do not ask the owner to edit SQL, code or quota rows or repeat release approval.                 |

The NFL account's real free coverage and source completeness remain unknown until
the secure checks run. A provider subscription purchase cannot establish them.
No separate hosting upgrade is currently justified: the existing Supabase
five-minute cron, pg_net and Vault path is installed, and Vercel's documented
Hobby Fluid duration supports the requested 120-second quote action. The release
sets `fluid: true` in `vercel.json` and retains explicit `maxDuration = 120` on the
server actions and worker route; verify the deployment accepts this configuration.

After deployment, the existing secret-authenticated worker supports
`POST /api/operations/player-results?check=statistics-account`. It makes only the
quota-free API-Sports status request and returns normalized allowance facts,
never the key or raw account response. It does not run jobs or change policy
flags. The release agent can invoke it through the existing Vault/pg_net path
without exposing or copying server credentials.

Expected incremental monthly cost is **$30 for odds + target $0 for statistics**,
plus existing hosting. Any additional statistics permission/coverage cost is
unresolved. This is not a claim that $30 covers every automatic-settlement
dependency.

## Ordinary future-week execution after setup and approval

This sequence is for unopened weeks. The approved already-open Week 2 uses the
[separate operator runbook](week2-props-cutover.md), with no acquisition hold and
a reviewed menu frozen in its atomic cutover. Do not run the future-week
activation or hold-abort helpers against Week 2.

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
