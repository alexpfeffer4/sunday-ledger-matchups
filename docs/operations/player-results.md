# Player results: operational contract and recovery

This release is disabled by default. No current-account provider coverage or settlement latency is established by synthetic fixtures.

## Result authority

`private.position_receipts` remains the accepted allocation authority. Player receipts use the same `recompute_stage1_week` and centicredit-return rules as game lines. A reliable final team result by itself never creates a pending player's settlement row. Earlier complete results can settle while the rolling week is still open; unresolved accepted props prevent complete scores and required finality.

The shared source tables use the published Odds API event ID and canonical player UUID. API-Sports and nflverse source event/player IDs are verified mappings, never display-name joins. API-Sports supplies the candidate initial individual totals; nflverse supplies candidate complete totals and offensive snap participation. Source/fetch times, content hashes and individual statistic/participation revisions are retained separately. Only normalized evidence is persisted; full response bodies and account details are discarded.

Verified offensive participation plus complete final yardage grades normally, including zero, negative values and overtime. Exact equality pushes. Verified no offensive snaps voids; injury after offensive participation does not void. Missing rows, an active designation or an unverified zero do not prove DNP or a complete zero.

An API-Sports response with no source revision time retains a null timestamp; its content hash versions the evidence. Changed results without a provably later source revision become an operator candidate. A later network response never automatically wins a source disagreement. Stat-only and participation-only successors preserve team score versions and accepted receipt bytes. Their audit entries use the existing corrections ledger plus explicit before/after player bundle references.

## Jobs, cadence and budgets

`POST /api/operations/player-results` uses the existing server-only `SCORE_JOB_SECRET`; request bodies cannot select games or players. `API_SPORTS_NFL_KEY` is server-only. `scripts/sql/prepare-player-results-dispatch.sql` prepares integration with the existing Supabase five-minute score checkpoint job after release approval; it does not activate jobs or offers. It reuses the existing Vault score secret and requires no new Vercel Cron or hosting subscription.

For accepted props, reliable finish detection reuses the bulk Odds API score pipeline at five-minute intervals from kickoff +165 through +300 minutes. Other score timing and the existing final/correction checks continue unchanged. The separate protected Odds API budget pays for those bulk score requests. Five-to-fifteen-minute member-visible settlement remains a target requiring a real observation across detection, source delivery, scheduling and grading.

API-Sports jobs are shared per external game. One box-score request covers its selected canonical players. Attempts are due at reliable final detection +0, +5, +15, +30 and +60 minutes. Claims reserve requests before networking, use ninety-second leases and cannot exceed eight requests per rolling minute or eighty result attempts per UTC day. Twenty additional daily metadata attempts share the same overall provider allowance and minute limit. Unknown failures remain reserved; duplicate completion is idempotent. Exhausted jobs become incidents and cannot void anything by timeout.

API-Sports documents quota reset at 00:00 UTC. The private policy stores that provider day, preserves all request history, and rejects old-day response headers as evidence for the new day. A leased, quota-free `/status` probe confirms active subscription and actual remaining allowance before the worker's first box-score calls of the new day. Only sanitized quota fields are retained. Lower response limits and 429 backoff reduce the application's limits.

nflverse reconciliation shares one seasonal statistics/snaps download across up to sixteen games. At most seven automatic attempts are scheduled at final +0, +1, +2, +6, +12, +24 and +48 hours; missed intervals are skipped. Independent source timestamps keep a newer snap revision from being replaced by an older file merely fetched later. At the bound, an unresolved job remains an incident requiring verified source evidence, not an hourly poll forever.

## Incidents and corrections

Operator tables are private: `player_result_jobs`, `player_result_candidates`, `player_result_observations`, `player_evidence_bundles` and `player_result_decisions`. Member payloads contain only authorized own/revealed receipt results and readable correction reasons. Before reliable reveal, player evidence does not add rows or disclose hidden identities.

1. For a missing result, inspect the job's mapped source event/player/team/date and source coverage. Correct source mapping requires verified evidence and does not change an accepted canonical identity. A missing API key, suspended account, incomplete source row or absent snap row remains pending.
2. When verified source evidence becomes available, the operator imports normalized observations through the service-only `api.import_player_result_observations`. This performs canonical mapping validation and invokes the same weekly authority for all affected Live leagues. The operator may perform this exceptional recovery after automatic attempts end; no commissioner routine statistics entry is required.
3. For an in-window disagreement, the commissioner uses `api.resolve_player_result_candidate(candidate, statisticObservation, participationObservation, reason)` with existing immutable evidence IDs. No arbitrary new value can be submitted. The candidate ID is content-bound on replay, and the existing correction deadline is preserved.
4. For a finalized Week 17 correction, `api.resolve_finalized_week17_player_candidate` extends the existing protected Week 17 correction process. It appends the player evidence/correction, finalizes successor weekly versions, appends champion publication, applies the existing protected Week 18 pairing rule, appends an archive successor when required and checks terminal lineage. Team result IDs can remain unchanged. The ordinary correction endpoint cannot bypass this process.
5. Other closed/protected weeks remain subject to their existing rule: a candidate is recorded for review and cannot silently recalculate completed qualification or bracket history. A requested policy exception would need a separate governing decision; it is not an automatic repair.

Activation requires a credible verified-evidence path for every offered player, including absence from both data sets. Buying odds capacity does not resolve a missing participation/DNP source. If the proposed free sources cannot establish those cases or permitted use/retention, that remains a launch blocker; the operator must not manufacture a zero, timeout void, or provider attribution.

## Verification and release limits

The player result unit tests cover zero/negative/equality/participation cases, missing/ambiguous mappings, hashes, CSV handling and retry offsets. `supabase/tests/player_prop_results.test.sql` starts with real mixed accepted receipts, tests pending team finality, early rolling settlement, stat/participation corrections with unchanged scores, source disagreement, append-only data, protected window rejection, provider rollover and the independent daily budgets. `scripts/verify-player-result-concurrency.mjs` runs real separate native PostgreSQL sessions for sixteen final accepted game obligations, eight-per-minute global claims and idempotent completion. Its queue is explicitly seeded for Simulation because external workers must not discover Simulation; it does not establish real-provider delivery.

The candidate API-Sports wire parser follows the provider's documented `/games/statistics/players?id=GAME_ID` endpoint. The current account's exact response shape, current-season coverage, complete box scores, zero/DNP evidence, source revision behavior, free tier entitlement, permitted retention and actual final-to-visible latency still require real-data validation. The two contract-validation flags must remain false until those checks pass.

Disable **new offers/acceptance** separately from `player_result_policy.processing_enabled`. After a prop receipt exists, keep accepted-prop reveal, processing, corrections and history active. Rolling back to an application that cannot interpret player receipts is unsafe.

Primary provider references: [API-Sports NFL pricing and reset](https://api-sports.io/sports/nfl), [official NFL endpoint guide](https://www.api-football.com/news/post/how-to-get-started-with-api-nfl-the-complete-beginners-guide), [API-Sports NFL documentation](https://api-sports.io/documentation/nfl/v1), [nflverse snap dictionary](https://nflreadr.nflverse.com/articles/dictionary_snap_counts.html), [nflverse publication schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html).
