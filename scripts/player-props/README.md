# Player props release preparation

These scripts prepare a reviewed rollout. They authorize no purchase, Production
write, merge, deployment or live activation. The release agent runs them only
after the owner's concrete combined approval and the listed prerequisites.
Use a dedicated verified connection. Keep account metadata and league/season
identifiers in private release evidence; never include secrets in script settings
or a public PR.

## Scope and package

Activation applies to one configured LIVE league and its current season. It
keeps both global catalogs on Ruleset 1.3 / Product Bible 3.2. The configured
season's first eligible **unopened** week adopts the exact prepared Ruleset
1.4 / Product Bible 3.3 through the existing week-opening authority. The activation
transaction locks the season before its scoped setting, matching week opening;
if a target week has opened meanwhile, it selects the next unopened week.
No opened week, receipt, result or standing is rewritten.

| Package              | SHA-256                                                            |
| -------------------- | ------------------------------------------------------------------ |
| LIVE 1.4 / 3.3       | `7a2721afb0c0d366367cfbb8a90fba6e4061df0bd02893f5722c5ba838ecd8f5` |
| SIMULATION 1.4 / 3.3 | `c9e9d9c049a57dbab45de23f1b6e6e3b7d8abcf52ba1854b3c496fd230bc653c` |

The SQL canonicalizer and TypeScript tests independently reproduce these hashes.
The Simulation package remains available for isolated fixtures and scoped
Simulation verification; the Production activation script selects LIVE only.

## Reviewed execution order

1. Verify final PR commit, CI including native separate-session concurrency and
   real Auth desktop/mobile RPC journeys, public Preview and the isolated-backend
   boundary. A disabled UI Preview alone is insufficient for live acceptance.
2. Apply the reviewed additive migrations in filename order: player authority,
   player results, selective quotes and submission intents, plus any later
   explicitly reviewed support migration. Verify exact migration-ledger parity.
   These migrations retain disabled offers and existing Production quota caps.
3. Deploy the compatible prop-aware application and securely configure any
   missing server-only `API_SPORTS_NFL_KEY`; reuse the existing Odds API key if
   valid. Prepare the existing five-minute scheduler using
   `scripts/sql/prepare-player-results-dispatch.sql`. The compatible dispatcher
   must run queued metadata independently of accepted-prop result processing.
   Configure acquisition-only scope using `catalog-setup.sql`:
   `props_catalog_apply=true`, the exact
   `props_league_id`/`props_season_id`, and a recorded
   `props_catalog_setup_reference` in the `sunday_ledger` settings namespace.
   This enables bounded metadata acquisition only; offers and prospective rules
   stay disabled. Use authorized isolated scope during build validation and
   Production scope only after release approval. A cold NFL catalog may require
   34–36 shared metadata requests over at least two UTC quota days under the
   20/day allowance, depending on coverage/game cache expiry at the boundary.
   Obtain real current-season identities, result completeness, participation,
   correction and permitted retention/use evidence. An odds subscription upgrade
   does not establish the statistics path.
4. After the owner upgrades the existing odds subscription, securely verify its
   actual entitlement and usage/reset evidence. Run `quote-policy.sql` through
   `psql` with its structured `verified_entitlement_json` variable. It changes app
   caps from 90/day and 450/month to 1,000/day and 5,000/month, with 350/day and
   2,000/month protected for core lines/results. Existing recorded usage is never
   reset. The provider's 20K plan and app accounting boundaries are separate.
5. After the metadata/source checks pass, enable
   `private.player_result_policy.processing_enabled`,
   `api_sports_contract_validated` and `nflverse_contract_validated` only after
   their evidence passes. Retain the shared 80 result-attempt/20 metadata daily
   limits and maximum eight requests/minute. This uses the existing Supabase
   cron/Vault path, without assuming a Vercel upgrade.
6. Run `preflight.sql`. Retain package, scope, migration and setting output
   privately. It is read-only and cannot verify a deployed commit, a secret,
   source rights or an observed provider latency.
7. Record a readiness manifest covering the actual account/quote/result identity
   checks, unresolved cases, scheduler delivery, final application commit and
   approved target scope. Supply its SHA-256 and the approval reference to
   `activate.sql` using the exact settings below. The default script run changes
   nothing; applying fails unless the paid-plan budget, an entitlement
   configuration or consistent successful zero-credit probe within ten minutes,
   validated result processing and five-minute dispatcher are installed.
8. Publish the prospective slate. Scoped props weeks remain PLANNED while the
   automatically proposed six slots per eligible game are reviewed. Bootstrap
   verified mappings, prepare the full menu, confirm choices once, and open the
   week through `open_reviewed_player_prop_week`. First-week opening delegates
   to the existing roster-lock authority. Explicit unresolved slots can be
   confirmed as unavailable; absent quotes do not prevent opening. A member's
   first accepted game-only or mixed batch cannot beat this review. It freezes
   the menu league-wide; later real lines can address only the same identities.
9. Verify ordinary game lines, menu completeness/coverage exceptions, actual
   member Submit recovery, reveal and result arrival. Record emulation separately
   from physical-device evidence and measured latency separately from the
   5–15-minute target. Do not create test receipts in the real pilot.

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
