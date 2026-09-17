# Finding the authority for a change

Start with [current governing sources](governance/current-source-index.md).
Later scoped amendments supersede the historical base only where stated. The
older implementation milestone numbers in historical records are not the
September 16 simplification stages. Database functions own competitive changes;
application code orchestrates them and browser state represents unfinished drafts.

| Behavior                                                    | Governing source                                                                                                                             | UI / application entry                                                                                                                                         | Database authority                                                                                                                                                                  | Verification                                                                                                                                                          |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Draft identity, economic changes, Review and Submit         | [Shared-refresh amendment](governance/2026-09-16-shared-odds-refresh.md), [rolling submissions](rolling-submissions.md)                      | `src/components/card/stage1-card-builder.tsx`, `reconcile-reviewed-quotes.ts`, `card-draft-storage.ts`; `src/application/actions/submit-card-intent.ts`        | `api.review_live_card_quotes`, `api.bind_card_submission_intent`, `api.revalidate_card_submission_intent`, `api.accept_stage1_card`                                                 | `reconcile-reviewed-quotes`, `stage1-card-builder`, `card-draft-persistence`, `submission-intent` unit tests; existing rolling/props real-Auth and concurrency suites |
| Stored pages, private opponent details, historical matchups | [Game identity / event reveal](governance/2026-09-14-rolling-submissions.md), [historical browsing](historical-matchup-browsing.md)          | `src/application/queries/get-live-stage1-league.ts`, `src/app/l/[leagueSlug]/matchup/page.tsx`                                                                 | `api.get_stage1_state`, `api.get_league_matchup_cards`, `api.get_weekly_close_state`                                                                                                | Stage 2 read tests, privacy/RLS, historical-matchup and member journeys                                                                                               |
| Public quote acquisition and stored-board updates           | [Shared refresh](operations/shared-odds-refresh.md)                                                                                          | `src/adapters/providers/the-odds-api/refresh-card-quotes.ts`, `src/application/quotes/background-runner.ts`, `src/components/card/use-stored-quote-updates.ts` | `api.plan_live_quote_refresh`, `api.apply_live_quote_plan`, background claim/application wrappers → `private.apply_shared_quote_events`; legacy commissioner lease remains separate | Shared/background quote pgTAP and native concurrency; stored polling/focus tests                                                                                      |
| Player selection and first publication                      | [Progressive publication](governance/2026-09-15-progressive-player-props.md), [standing policy](governance/2026-09-16-season-automation.md)  | `src/app/l/[leagueSlug]/player-prop-actions.ts`, `src/application/players/`                                                                                    | `api.get_player_prop_menu`, catalog completion, menu confirmation and automatic validation wrappers                                                                                 | Progressive props SQL, native races and real-Auth journeys                                                                                                            |
| Weekly preparation/opening and season consent               | [Standing automation](operations/season-automation.md)                                                                                       | `src/application/automation/runner.ts`, `src/app/api/operations/season-automation/route.ts`                                                                    | `api.claim_season_automation`, `api.complete_season_automation` and private lifecycle functions                                                                                     | Stage 1 actual worker PREPARE/retry/opening scenarios, season automation pgTAP/native                                                                                 |
| Settlement, correction and finality                         | [Current source index](governance/current-source-index.md), [automatic finalization](governance/2026-09-14-automatic-weekly-finalization.md) | `src/app/api/operations/`, commissioner actions, weekly-close queries                                                                                          | Result completion and canonical private settlement/finality functions                                                                                                               | Complete pgTAP, player-result/native, Phase 6–8 and archive journeys                                                                                                  |

## Read the effective SQL, not just the original migration

Migrations are the editable authority. Some later migrations rename/wrap or
transform earlier function bodies. Generated TypeScript tells you the signature,
not the effective body or privileges.

The existing clean-database acceptance job now runs:

```bash
node scripts/export-effective-authorities.mjs
```

It requires `TEST_SUPABASE_DB_URL` to name the disposable loopback database. It
reads PostgreSQL's effective definitions after all migrations, starting with 17
important entry points and following literal `api`/`private` function references.
The `database-acceptance` artifact contains `effective-authorities.md` (index) and
`effective-authorities.json` (bodies, hashes, effective execution roles, security
mode, volatility, search path and migration file hashes). These are deterministic
outputs: no timestamp, fixture data, auth state or manual snapshot maintenance.
Use the artifact for the exact PR tree. Do not apply or hand-edit it.

Literal references are navigation hints, not a complete dynamic dependency graph.
Overloads with the same name are included; dynamically assembled names and
application callers still need inspection. This tool replaces no parity,
privilege, signature or behavior test. Existing release parity files remain
unchanged and continue to run before export.

## Diagnose a failed read

The base league, quote heads, player menu, review context and weekly-close loaders
emit `league_query_failed` only when their existing error path throws. The record
contains a fixed operation, allowlisted database code (or `UNCLASSIFIED`), generated
correlation ID and elapsed read/enrichment wait in milliseconds. This duration is
not SQL execution time. The thrown safe error carries only that correlation ID;
user-facing messages and authorization/missing-function null/fallback behavior
are unchanged.

Codes distinguish cancellation/timeouts (`57014`), exhausted connections
(`53300`), transaction conflicts (`40001` / `40P01`), lineage/state failures
(`55000`) and internal failures (`XX000`). SQL messages, details, hints, credentials,
league/user IDs, selections and payloads are excluded. This is server logging,
not a new telemetry service. Parse/transport failures and the database automation
`OPERATION_FAILED` fallback are not newly classified by this bounded change.
