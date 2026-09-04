# Supabase checkpoint

This directory contains reproducible Postgres migrations and pgTAP policy
tests. It does not contain credentials or a linked project identifier.

After an authorized Supabase project is connected:

1. Confirm the project Data API exposes the intended `api` schema and does not
   expose `private`, then apply reviewed migrations to the linked project.
2. Generate TypeScript types from that project into
   `src/adapters/supabase/database.types.ts`.
3. Run `supabase test db` against a local or isolated test database.
4. Configure the Auth Site URL, allowed redirect URLs, and PKCE magic-link
   template for `/auth/confirm`.

`tests/stage1_vertical_slice.test.sql` covers the
Stage 2 roster expansion, deterministic eight-member interactive fixture
publication, four Week 1 pairings, owner-only sealed receipts, common lock,
reliable reveal, all matchup completion cases, win/loss/push/void settlement,
half-up rounding, correction supersession, finalization, and append-only/RLS
boundaries.

`tests/stage2_simulation_season_archives.test.sql` covers
the 4–16 roster contract, guarded and idempotent commissioner publication,
ruleset and roster freezing, final season state, append-only protection,
member-only reads, and current-viewer history scoping. These suites roll back
all fixture identities and competitive records.

`tests/stage3_live_odds_imports.test.sql` contains 62 assertions for guarded
provider imports, exact main-market validation, commissioner-selected immutable
slate publication, five-minute common-lock derivation, event-set-preserving
quote refresh, current-head enforcement, idempotent replay, append-only history,
zero-card solo publication, least-privilege grants, and commissioner-only RLS.
It also runs inside a rollback transaction.

`tests/stage3_live_roster_lock.test.sql` contains 34 assertions for the
commissioner-only roster lock, one-member and stale-quote rejection, exact
TypeScript/Postgres `circle-v1` parity, a complete immutable 14-week schedule,
Week 1-only operational materialization, equal 1,000-credit grants, idempotent
replay, member schedule reads, and the post-lock membership boundary. It runs
inside a rollback transaction and does not alter the one-member Live test
league.

`tests/stage3_live_results.test.sql` contains 42 assertions for exact-set score
imports, commissioner-only settlement, provider and documented objective
corrections, the 48-hour postponement void, the 24-hour correction window,
final score/matchup/standings versions, explicit fail-closed RLS, and immutable
provider evidence. It runs inside a rollback transaction.

`tests/stage3_live_week_progression.test.sql` contains 26 assertions for the
prior-week finalization gate, commissioner-only Week 2–14 publication, exact
frozen-schedule pairings, equal fresh 1,000-credit cards, current-week card and
lock commands, provider settlement, cumulative records, Points For, incomplete
weeks, and idempotent replay. Frozen V1.1 snapshots retain their historical
All-play ordering; prospective V1.2 seasons omit All-play and order ties by
record, Points For, balanced head-to-head, incomplete weeks, high week, then
the stored tiebreak. It runs inside a rollback transaction.

`tests/stage3_live_playoff_qualification.test.sql` verifies the final Week 14
gate, commissioner-only publication, third-miss exclusion, top-four/top-six
field contract, immutable bracket template, idempotency, and member-scoped read
model. It runs inside a rollback transaction.

`tests/stage3_live_postseason_rounds.test.sql` verifies commissioner-only Week
15–17 materialization, cards only for round participants, shared card/lock/score
and finalization commands, no postseason standings mutation, exact-tie and
dual-incomplete higher-seed advancement, six-entry semifinal reseeding,
idempotency, append-only round evidence, and the member playoff read model. It
runs inside a rollback transaction.

The Phase 8 suites extend this through champion finality, correction-safe Week
18 replacement, normal Week 18 cards and exhibitions, and a complete immutable
Weeks 1–18 archive. The authoritative Simulation suite proves the same
lifecycle runs from a reviewed fixture pack without using provider data.

`tests/controlled_league_reliability.test.sql` verifies retry-safe private
invitation creation, caller-only command-result recovery, changed-input
rejection, duplicate prevention, retirement of the older invitation command,
and explicit denial of `PUBLIC`, `anon`, and `authenticated` execution on the
three confirmed private helper functions. It runs inside a rollback
transaction.

The hosted Stage 2 migrations are:

- `stage2_simulation_season_archives`
- `index_simulation_archive_season_foreign_key`

The hosted Stage 3 import migrations are:

- `stage3_live_odds_imports`
- `stage3_live_odds_import_fk_indexes`
- `stage3_live_slate_publication`
- `stage3_live_quote_refresh`
- `stage3_live_quote_heads_fk_index`
- `stage3_live_roster_lock`
- `stage3_live_results`
- `stage3_live_score_import_policy`
- `stage3_live_week_progression`
- `stage3_live_playoff_qualification`
- `stage3_live_playoff_fk_index`
- `stage3_live_postseason_rounds`
- `stage3_live_postseason_fk_index`
- `stage3_live_season_archive`
- `stage3_live_season_archive_fk_index`

The repository migration timestamps match the hosted ledger. The reconciliation
record and release checks are in `docs/controlled-league-release-gate.md`.
Always prove a clean rebuild, complete pgTAP run, generated type consistency,
and linked-project dry run before applying a new migration. Never edit the
Supabase migration system table directly.

The server-only Supabase secret key is intentionally absent from general Auth
and participant data helpers.

Regenerate the exposed API contract with the CLI from a disposable local stack
or the authorized linked project:

```bash
supabase gen types typescript --project-id "$SUPABASE_PROJECT_REF" --schema api,public > src/adapters/supabase/database.types.ts
```
