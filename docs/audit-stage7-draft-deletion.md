# Stage 7 — repair draft deletion eligibility

The A13 real-Auth deletion check returned PostgreSQL `42P01` instead of the
existing guarded rejection. `private.can_delete_empty_draft_league` still referred
to `private.live_season_archives`, renamed to `private.season_archive_versions`
in Phase 8B. Read-only Production inspection confirmed the stale function and
absent old table. The helper also backs `api.my_leagues.can_delete`, so this can
break the commissioner's league-list read as well as deletion.

`20260912162516_fix_draft_deletion_archive_guard.sql` replaces that table reference
while preserving every eligibility condition, security-definer search path and
private execution boundary. It does not delete or modify league data, rules,
receipts, archives, membership policy or personal-data retention policy.

The database regression now executes eligibility, the actual league-list view,
wrong-name and outsider rejection, successful deletion of an isolated untouched
one-member draft, and rejection/preservation after another member joins. The
dependent Stage 7 member journey verifies rejection after a real 20-pick seal and
unchanged receipts. Both use disposable data; no destructive Production test ran.

## Release and rollback

After explicit owner approval, PR #38 was squash-merged at
`3e07162970666e01e2ccc162d67c9520edfcd74d` and the reviewed SQL was applied to
`nxikkhtaercmbuyrlyio` on September 12, 2026. The hosted ledger now has 46 migrations,
ending `20260912162516_fix_draft_deletion_archive_guard`. The repository filename
was aligned from its proposed `20260912054000` timestamp to the actual hosted
version; SQL is byte-for-byte unchanged from tested head `aef7fe9`, SHA-256
`c431c4c8628a41e198bb02f1391de9c75d59a5de5a54d7e71c89391de27c3356`.
Do not apply the obsolete proposed version or repeat the migration.

Post-application `pg_get_functiondef` matches the prior definition with exactly
the reviewed archive-table substitution. Anon/authenticated still cannot execute
the helper. Before/after counts and whole-row hashes match across 27 checked
tables covering rules, membership, weeks, cards, receipts, results, standings,
playoffs, schedules, corrections and archives. Security advisors are unchanged:
15 existing informational private-table notices and the deferred leaked-password
warning. No real league was deleted. Stage 6's future-week rules policy and
migration remain in place. These preservation checks are not a backup/restore test.

The application API signatures and schema do not change. The migration is
compatible with the Stage 6 app and the dependent Stage 7 UI work. If a release
must be rolled back, retain this corrected guard; restoring the obsolete table
reference would restore the defect. Any database reversal must be a separately
reviewed forward migration preserving all competitive evidence.

The owner separately authorized this migration and the PR merges/normal automatic
deployments. No security setting or visibility change is included. Final PR/head,
deployment and test results are in the Stage 7 completion handoff and PR release
record; this repository note records the verified database rollout.
