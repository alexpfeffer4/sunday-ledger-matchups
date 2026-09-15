# Player props release preparation

These scripts execute the reviewed rollout under the retained owner approval
for additive migrations, merge, compatible deployment, configuration and
conditional scoped activation. They do not themselves grant authority or waive
readiness checks. The September 15 owner setup and verified Odds API 20K budget
transition are complete; no repeat purchase, key setup or blanket release
approval is required. Purchases remain excluded.

Read the [nflverse primary amendment](../../docs/governance/2026-09-15-nflverse-primary-pilot.md)
and [pilot runbook](../../docs/operations/nflverse-primary-pilot.md). The
independently approved Week 2 reset has completed. Already-open Week 2 uses
`open-week2-cutover.sql` and its [dedicated runbook](../../docs/operations/week2-props-cutover.md),
not the future-week hold or activation helpers. Reuse its exact audit only while
all cutover guards pass; do not reset again or cancel new accepted bets.

Use a dedicated verified connection. Keep account metadata and league/season
identifiers in private release evidence; never include secrets in script settings
or a public PR. The mutating release scripts default to no-change dry runs unless
the documented apply setting is explicitly supplied.

## Scope and package

Activation applies to one configured LIVE league and its current season. It
keeps both global catalogs on Ruleset 1.3 / Product Bible 3.2. The configured
season's first eligible **unopened** week adopts the exact prepared Ruleset
1.4 / Product Bible 3.3 through the existing week-opening authority. The activation
transaction locks the season before its scoped setting, matching week opening;
if a target week has opened meanwhile, it selects the next unopened week.
No opened week, receipt, result or standing is rewritten.

The acquisition-hold release helper targets the existing active LIVE pilot.
It requires REGULAR, PLAYOFFS, CHAMPION_FINAL or WEEK_18_EXHIBITION lifecycle;
initial drafts fail atomically instead of entering an unsupported hold.

| Package              | SHA-256                                                            |
| -------------------- | ------------------------------------------------------------------ |
| LIVE 1.4 / 3.3       | `7a2721afb0c0d366367cfbb8a90fba6e4061df0bd02893f5722c5ba838ecd8f5` |
| SIMULATION 1.4 / 3.3 | `c9e9d9c049a57dbab45de23f1b6e6e3b7d8abcf52ba1854b3c496fd230bc653c` |

The SQL canonicalizer and TypeScript tests independently reproduce these hashes.
The Simulation package remains available for isolated fixtures and scoped
Simulation verification; the Production activation script selects LIVE only.

## Reviewed execution order

1. Verify current main, final PR commit, CI including native separate-session
   concurrency and real Auth desktop/mobile journeys, Preview and its isolated
   backend boundary. Preserve the owner's merged work. A disabled UI Preview
   alone is insufficient for live acceptance.
2. Apply only the reviewed unapplied additive migrations in filename order and
   verify exact hosted version/content parity. The original PR #51 migrations
   are already installed; do not reapply them, edit applied SQL or rewrite the
   migration journal. New source-policy support must be installed before the
   updated preflight and activation scripts can run.
3. Deploy the compatible application with offers disabled. Reuse valid Odds API,
   Supabase and dispatcher settings. `NFLVERSE_PRIMARY` requires no API-Sports
   key, nflverse key or new statistics account.
4. Recheck current odds entitlement and usage/reset evidence. The approved
   `quote-policy.sql` transition already installed 1,000/day and 5,000/month
   application caps with 350/day and 2,000/month protected for core lines/results.
   Do not reset usage or rerun owner setup. Catalog/activation still require fresh
   normalized entitlement evidence.
5. After real-data validation, record the reviewed evidence SHA-256 and retained
   approval using `private.configure_nflverse_primary_pilot(text,text)`. This
   records immutable evidence and selects `NFLVERSE_PRIMARY` with
   `FEATURED_HIGHEST_STANDARD_LINES`. Its guard rejects a source switch once
   existing accepted/frozen player state, mappings or jobs would be reinterpreted.
   It does not enable metadata, result processing, contract-validation flags or
   offers. Do not fabricate API-Sports IDs or set its validation flag for this mode.
6. Enable nflverse contract validation only after its identity, completeness,
   participation, correction and verified-exception checks pass. After the tracked
   dispatcher migration, verify the existing five-minute dispatcher with the
   read-only `scripts/sql/prepare-player-results-dispatch.sql`; verify delivered catalog
   and result calls against the exact deployment. Enable bounded metadata for
   the selected source policy. For an ordinary unopened week, configure its
   acquisition hold using `catalog-setup.sql` with `props_catalog_apply=true`,
   exact `props_league_id`/`props_season_id` and
   `props_catalog_setup_reference` in the `sunday_ledger` settings namespace.
   After preceding-week FINAL, publication keeps the held slate PLANNED while
   catalog work runs. The already-open Week 2 uses its dedicated catalog phase.
7. Verify current roster/schedule mappings and standard bookmaker lines. Each
   team supplies its QB with the highest standard passing line, RB with the
   highest standard rushing line and WR/TE with the highest standard receiving
   line. Verify position from the roster; a QB rushing market cannot fill an
   RB slot. Label these as featured players, not confirmed starters. A line
   does not guarantee health, availability or offensive participation.
   Depth-chart acquisition is not required by this policy.
   Use a coherent per-game nomination snapshot within the twelve-hour discovery
   window, with bookmaker observations no older than ten minutes at acquisition
   and no future times; expose its timestamp to the commissioner. Member quotes
   still require their separate 120-second fetch/ten-minute source freshness.
   Show missing or ambiguous candidates honestly; no silent usage/depth or
   alternate-line fallback and no fictional player fills the slate. Validate explicit numeric totals and offensive snap
   evidence, including zero, negative and missing values. Obtain the actual
   commissioner's one full-slate review; fixture menus are not that review.
8. Enable `private.player_result_policy.processing_enabled` only for validated
   processing. `private.player_source_policy_validated()` checks the selected
   policy: nflverse-only needs matching immutable validation evidence and the
   nflverse contract flag; the older dual-source mode also needs the API-Sports
   flag. API-Sports budgets remain isolated and unchanged for that mode. Run
   `preflight.sql` and retain private output. It exposes source/selection policy,
   validation identity and readiness but does not prove a deployed commit,
   source completeness or actual hosted timing.
9. Record the readiness manifest with actual coverage, exceptions, scheduler
   delivery, final commit and approved scope. Supply its hash and retained
   approval reference to `activate.sql`. The default run changes nothing;
   applying requires the protected odds budget, consistent entitlement evidence
   within ten minutes, validated selected-source processing and dispatcher.
10. For the ordinary future-week path, open the held reviewed slate through
    `open_reviewed_player_prop_week` under the supported immutable package.
    Permitted unresolved slots may be explicitly unavailable; absent quotes
    alone do not erase a known player. The first accepted game-only or mixed
    batch freezes identities across the week. Week 2 instead requires a complete
    reviewed menu frozen inside its guarded cutover transaction.
11. Verify ordinary lines, mixed Submit recovery, reliable-start privacy,
    pending results, history and quota protection. The approved expectation is
    overnight results with later evidence possible; measure the real hosted path
    when genuine accepted props finish. Do not create test receipts in the pilot.

The configure helper's evidence and approval arguments contain hashes/references,
not provider credentials. It is an explicit mutating operator action, separate
from read-only `preflight.sql` and the default no-change activation run.

## Verified-result exceptions

After bounded automatic attempts, follow the
[exception runbook](../../docs/operations/nflverse-primary-pilot.md). The
service-only `api.resolve_verified_player_result_exception` accepts the exact
accepted event/subject/statistic, explicit offensive snaps and yardage for
offensive participants, separate published source URLs, evidence hash, authorized actor, reason and idempotency
key. Verified zero offense may retain null yardage; do not invent a zero. The
path applies only to otherwise-unsettled accepted props. Verified exception
evidence has its own `VERIFIED_EXCEPTION` provenance; it must not masquerade as
an nflverse publication or override an already settled result through this path.

Keep the source references, actor and idempotent audit. Missing rows do not imply
zero; a timeout does not prove DNP. Ordinary source revisions and later changes
use the existing correction authority and original review windows, including
protected postseason/history. Do not extend retries or restart a clock to wait
for Wednesday-night/Thursday corrections.

## Activation settings

Only the approved release agent supplies these values from verified evidence:

```sql
set sunday_ledger.props_apply = 'true';
set sunday_ledger.props_league_id = '<configured LIVE pilot league UUID>';
set sunday_ledger.props_season_id = '<verified current season UUID>';
set sunday_ledger.props_release_sha = '<deployed reviewed 40-character commit SHA>';
set sunday_ledger.props_readiness_sha = '<SHA-256 of completed readiness evidence>';
set sunday_ledger.props_approval_reference = '<recorded combined owner approval>';
```

Then execute `activate.sql` on that dedicated connection. A changed/finished
season, unknown global catalog, absent prerequisites or timeout aborts the
transaction. Review the current state before retrying. Do not supply fabricated
readiness flags or edit guards to force activation.

## Compatible disable

If validation fails before props activation, `abort-catalog-hold.sql` provides a
separate game-only recovery for the exact staged PLANNED week. It refuses a week
with receipts, an activated props scope, a later published week or an expired
entry window. It releases the acquisition hold and uses the existing guarded
opening/rules authority to adopt current 1.3. It does not modify any previously
opened week. Supply the exact approved scope and reason:

```sql
set sunday_ledger.props_catalog_abort_apply = 'true';
set sunday_ledger.props_league_id = '<configured LIVE pilot league UUID>';
set sunday_ledger.props_season_id = '<verified current season UUID>';
set sunday_ledger.props_catalog_abort_week_id = '<exact staged PLANNED week UUID>';
set sunday_ledger.props_approval_reference = '<recorded combined owner approval>';
set sunday_ledger.props_catalog_abort_reason = '<recorded source-readiness failure>';
```

Then execute `abort-catalog-hold.sql`. A later retry uses `catalog-setup.sql` to
select the next eligible unopened week; no past binding is changed.

`disable.sql` switches off new offers for the configured league. It leaves
`rules_enabled` true, so future supported weeks keep opening without an
unsupported downgrade. The commissioner menu remains accessible while offers
are disabled; ordinary game betting remains available. Never clear result
processing flags after props have been accepted.

```sql
set sunday_ledger.props_disable_apply = 'true';
set sunday_ledger.props_league_id = '<configured pilot league UUID>';
set sunday_ledger.props_disable_reason = '<recorded operational reason>';
```

Execute `disable.sql`. Keep accepted-prop evidence ingestion, settlement,
corrections, reveal and history running. Use a compatible forward fix; an old
binary that cannot read prop receipts is not a safe rollback. Re-enabling offers
requires current provider readiness and the existing release authorization's
scope. It does not repin opened weeks or replace frozen players.

## Verification limits

The authority and scoped week-opening SQL have rollback-only pgTAP coverage.
Those tests distinguish delayed quotes from unresolved identities, review before
opening, game-only menu freeze, canonical duplicate rejection, shared credits,
immutable legacy receipts, versioned prop hashes and compatible disable. The
completed release report must separately name native PostgreSQL, real Auth/CI,
Preview and actual-provider evidence; embedded diagnostic PostgreSQL alone
establishes none of those external claims.
