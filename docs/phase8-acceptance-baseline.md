# Phase 8 acceptance baseline

Phase 8 consists of three merged implementation phases and four immutable SQL
migration files. Phase 8A required a second hardening migration before Phase 8B
began; it is not a fourth implementation phase.

The required clean-reset order is:

1. `20260831040524_phase8a_sparse_qualification_every_member_postseason.sql`
2. `20260831131451_phase8a_postseason_slate_and_fk_hardening.sql`
3. `20260831150000_phase8b_champion_finality_week18_archive.sql`
4. `20260831212703_phase8c_authoritative_same_lifecycle_simulation.sql`

These already-merged files are immutable. Acceptance hardening must move
forward through tests or a new migration; it must never combine, rename,
delete, or edit an applied migration.

The first acceptance repair is
`20260901003000_phase8_acceptance_week18_pairing_repair.sql`. It replaces only
`private.rebuild_week18_round_after_correction` to parenthesize JSON pairing
values before concatenation. It performs no table update, delete, or historical
backfill.

The Phase 8A version-root backfill changes only newly introduced lineage
metadata on legacy playoff publication rows. It does not rewrite standings,
qualifiers, bracket JSON, matchup JSON, result facts, receipts, or archives.
Frozen ruleset snapshots are explicitly excluded from the ruleset promotion.

The authoritative acceptance workflow must apply every migration from a clean
disposable database, run the complete pgTAP suite, generate checked-in API type
evidence, and run the shared participant surfaces in Chromium and WebKit.
