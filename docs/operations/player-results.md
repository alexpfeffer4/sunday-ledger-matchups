# Player results: operational contract and recovery

Read with the [approved nflverse primary pilot](../governance/2026-09-15-nflverse-primary-pilot.md)
and [release/exception runbook](nflverse-primary-pilot.md). The selected policy is
explicit: `NFLVERSE_PRIMARY` uses published nflverse totals and PFR offensive
snap evidence; `API_SPORTS_NFLVERSE` retains the earlier dual-source path.
The primary pilot's `FEATURED_HIGHEST_STANDARD_LINES` menu selects each team's
QB, RB and WR/TE from the highest standard passing, rushing and receiving lines
respectively, using verified roster positions. These are featured players,
not confirmed starters; a QB rushing market cannot fill the RB slot. No depth
feed or API-Sports key is needed for primary mode.

New offers remain separately gated. Current-season real-data checks and fixture
tests do not establish complete inactive coverage or hosted settlement latency.
The approved primary-mode expectation is overnight results, with later updates
possible; it supersedes the earlier unverified 5–15-minute target for this mode.

## Result authority

`private.position_receipts` remains the accepted allocation authority. Player receipts use the same `recompute_stage1_week` and centicredit-return rules as game lines. A reliable final team result by itself never creates a pending player's settlement row. Earlier complete results can settle while the rolling week is still open; unresolved accepted props prevent complete scores and required finality.

The shared source tables use the published Odds API event ID and canonical
player UUID. Source event/player IDs require verified game/team/date mappings;
display-name resemblance is insufficient. Each primary-mode mapping and menu
retains its source-policy validation identity. API-Sports event IDs are genuinely
absent in primary mode, never placeholders invented to satisfy the older path.

In `NFLVERSE_PRIMARY`, published nflverse player totals and PFR offensive snaps
supply the result evidence. The normalizer checks the claimed final game,
source times, exact game/team rows and explicit values; download success is not
a blanket completeness assertion. Missing player values stay missing even when
other players in the game have complete rows. In the separate
`API_SPORTS_NFLVERSE` mode, API-Sports supplies candidate initial totals and
nflverse supplies complete fallback/reconciliation totals and offensive snaps.
Source/fetch times, content hashes and individual statistic/participation
revisions remain separate. Persist only permitted normalized evidence; discard
full response bodies and account details.

Verified offensive participation plus complete final yardage grades normally, including zero, negative values and overtime. Exact equality pushes. Verified no offensive snaps voids; injury after offensive participation does not void. Missing rows, an active designation or an unverified zero do not prove DNP or a complete zero.

In the dual-source mode, an API-Sports response with no source revision time retains a null timestamp; its content hash versions the evidence. Changed results without a provably later source revision become an operator candidate. A later network response never automatically wins a source disagreement. Stat-only and participation-only successors preserve team score versions and accepted receipt bytes. Their audit entries use the existing corrections ledger plus explicit before/after player bundle references.

## Jobs, cadence and budgets

`POST /api/operations/player-results` uses the existing server-only
`SCORE_JOB_SECRET`; request bodies cannot select games or players. The dispatcher
hook is source-agnostic and the worker follows the stored selected policy.
`API_SPORTS_NFL_KEY` is required only by the dual-source path and remains
server-only. Primary mode performs no API-Sports status or box-score requests.
`scripts/sql/prepare-player-results-dispatch.sql` integrates with the existing
Supabase five-minute score checkpoint job under retained release approval; it
does not enable processing, metadata or offers. It reuses the existing Vault
score secret and requires no new Vercel Cron or hosting subscription.

For accepted props, reliable finish detection reuses the bulk Odds API score pipeline at five-minute intervals from kickoff +165 through +300 minutes. Other score timing and the existing final/correction checks continue unchanged. The separate protected Odds API budget pays for those bulk score requests. This detection cadence does not imply equally fast player-result availability.
For `NFLVERSE_PRIMARY`, overnight settlement is the approved expectation, not a
guaranteed deadline. Measure final detection, separate totals/snap publication,
scheduling, import and member-visible grading in the hosted pilot. The older
5–15-minute aspiration applies only to the candidate dual-source path and was
never established by synthetic tests.

Only in `API_SPORTS_NFLVERSE`, API-Sports jobs are shared per external game. One box-score request covers its selected canonical players. Attempts are due at reliable final detection +0, +5, +15, +30 and +60 minutes. Claims reserve requests before networking, use ninety-second leases and cannot exceed eight requests per rolling minute or eighty result attempts per UTC day. Twenty additional daily metadata attempts share the same overall provider allowance and minute limit. Unknown failures remain reserved; duplicate completion is idempotent. Exhausted jobs become incidents and cannot void anything by timeout.

For that dual-source mode, API-Sports documents quota reset at 00:00 UTC. The private policy stores that provider day, holds available quota at zero until fresh account proof, preserves all request history, and rejects old-day response headers as evidence for the new day. A leased, quota-free `/status` probe confirms active subscription and actual remaining allowance before the worker's first box-score calls of the new day. Only sanitized quota fields are retained. Lower response limits and 429 backoff reduce the application's limits.

The shared nflverse job path is the primary results path for `NFLVERSE_PRIMARY`
and the fallback/reconciliation path for `API_SPORTS_NFLVERSE`. It shares one
seasonal statistics/snaps download across up to sixteen games; malformed
individual game contexts fail closed without discarding valid peer contexts. At most seven automatic attempts are scheduled at final +0, +1, +2, +6, +12, +24 and +48 hours; missed intervals are skipped. Independent source timestamps keep a newer snap revision from being replaced by an older file merely fetched later. At the last available window, an unresolved job becomes an incident even when missed windows meant fewer than seven attempts. The existing dispatcher also closes unresolved jobs after 49 hours before its no-due-work return, without needing an API key, quota or another fetch; valid in-flight leases are allowed to finish. Recovery requires verified source evidence through the existing import authority, never a timeout void or an hourly poll forever.

## Incidents and corrections

Operator tables are private: `player_result_jobs`, `player_result_candidates`, `player_result_observations`, `player_evidence_bundles` and `player_result_decisions`. Member payloads contain only authorized own/revealed receipt results and readable correction reasons. Before reliable reveal, player evidence does not add rows or disclose hidden identities.

1. For a missing result, inspect the mapped source event/player/team/date, exact
   selected policy and source completeness. Mapping corrections require verified
   evidence and cannot change an accepted canonical identity. Incomplete or
   absent stat/snap rows remain pending. API-Sports credential/account problems
   concern only the dual-source path.
2. When a newer verified publication resolves the gap, import normalized
   observations through service-only `api.import_player_result_observations`.
   Mapping validation and the same weekly authority apply. Exceptional recovery
   may occur after automatic attempts end; routine commissioner stats entry is
   not required.
3. If a primary-mode accepted prop still lacks complete evidence, an authorized
   service operator can use `api.resolve_verified_player_result_exception` after
   the identified league commissioner verifies the exact published facts.
   Supply the event, subject, statistic, explicit offensive snaps, published
   statistic/participation URLs, evidence hash, commissioner actor, reason and
   idempotency key. Offensive participants require an explicit yardage value.
   Verified zero offensive snaps may retain a null yardage value; do not invent
   zero merely to fill the field. Only the permitted NFL, nflverse or PFR source
   URLs are accepted. This creates append-only `VERIFIED_EXCEPTION` evidence
   with its own audit and uses the existing publishing/correction authority.
   It cannot replace already complete or settled evidence, claim a false
   nflverse publication or bypass protected review windows. See the
   [full exception procedure](nflverse-primary-pilot.md#overnight-results-and-verified-exceptions).
4. For an in-window disagreement, the commissioner uses `api.resolve_player_result_candidate(candidate, statisticObservation, participationObservation, reason)` with existing immutable evidence IDs. No arbitrary new value can be submitted. The candidate ID is content-bound on replay, and the existing correction deadline is preserved.
5. For a finalized Week 17 correction, `api.resolve_finalized_week17_player_candidate` extends the existing protected Week 17 correction process. It appends the player evidence/correction, finalizes successor weekly versions, appends champion publication, applies the existing protected Week 18 pairing rule, appends an archive successor when required and checks terminal lineage. Team result IDs can remain unchanged. The ordinary correction endpoint cannot bypass this process.
6. Other closed/protected weeks remain subject to their existing rule: a candidate is recorded for review and cannot silently recalculate completed qualification or bracket history. A requested policy exception would need a separate governing decision; it is not an automatic repair.

Activation requires an executable verified-evidence path for unresolved offered
players, including absence from both data sets. Missing rows, a timeout or a
line offered before kickoff never proves zero offense. If evidence remains
insufficient, retain the incident and pending bet. A verified zero-offense fact
may void; a guessed DNP cannot.

The published nflverse data carries CC BY 4.0 attribution, retained on `/trust`
with a normalization notice. No nflverse account, key, paid statistics plan or
separate API-Sports permission response is required by the primary policy.
Wednesday-night/Thursday source corrections follow the existing applicable
review authority. Do not extend automatic retry horizons, restart correction
clocks or silently recalculate protected qualification, bracket or archive
history to match that publication schedule.

## Verification and release limits

The player result unit tests cover zero/negative/equality/participation cases, missing/ambiguous mappings, hashes, CSV handling and retry offsets. `supabase/tests/player_prop_results.test.sql` starts with real mixed accepted receipts, tests pending team finality, early rolling settlement, stat/participation corrections with unchanged scores, source disagreement, append-only data, protected window rejection, provider rollover and the independent daily budgets. `scripts/verify-player-result-concurrency.mjs` runs real separate native PostgreSQL sessions for sixteen final accepted game obligations, eight-per-minute global claims and idempotent completion. Its queue is explicitly seeded for Simulation because external workers must not discover Simulation; it does not establish real-provider delivery.

`supabase/tests/player_prop_terminal_correction.test.sql` progresses the authoritative season lifecycle through an archived championship, then applies a protected stat-only correction that reverses the champion. It verifies commissioner authority, successor publication/archive lineage, unchanged team scores and accepted receipt bytes, protected Week 18 pairings and idempotent replay.

The candidate dual-source API-Sports parser follows the documented
`/games/statistics/players?id=GAME_ID` endpoint. Current-account coverage,
complete box scores, participation, source revisions and permitted retention
must pass their own validation before that mode is used; the tested free account
did not provide current-season access. These are not primary-mode dependencies.

For primary mode, record the validation hash and approval using
`private.configure_nflverse_primary_pilot(text,text)`. It records source and
selection policy with immutable evidence; it does not enable metadata,
processing, contract flags or offers. Enable `nflverse_contract_validated` only
after the selected source's checks pass, and verify
`private.player_source_policy_validated()`. The API-Sports flag must not be set
to bypass an obsolete two-source prerequisite. Dual-source mode still requires
both genuinely validated contract flags.

Primary-specific unit and database suites cover policy selection, roster/line
nomination, per-game result completeness, source isolation and audited missing
result exceptions. Use the exact final CI run for pass counts and evidence;
the test files' presence is not proof of execution or hosted delivery.

Disable **new offers/acceptance** separately from `player_result_policy.processing_enabled`. After a prop receipt exists, keep accepted-prop reveal, processing, corrections and history active. Rolling back to an application that cannot interpret player receipts is unsafe.

Primary provider references: [API-Sports NFL pricing and reset](https://api-sports.io/sports/nfl), [official NFL endpoint guide](https://www.api-football.com/news/post/how-to-get-started-with-api-nfl-the-complete-beginners-guide), [API-Sports NFL documentation](https://api-sports.io/documentation/nfl/v1), [nflverse snap dictionary](https://nflreadr.nflverse.com/articles/dictionary_snap_counts.html), [nflverse publication schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html).
