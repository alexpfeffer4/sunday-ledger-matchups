# Stage 7 — repair draft deletion eligibility

The A13 real-Auth deletion check returned PostgreSQL `42P01` instead of the
existing guarded rejection. `private.can_delete_empty_draft_league` still referred
to `private.live_season_archives`, renamed to `private.season_archive_versions`
in Phase 8B. Read-only Production inspection confirmed the stale function and
absent old table. The helper also backs `api.my_leagues.can_delete`, so this can
break the commissioner's league-list read as well as deletion.

`20260912054000_fix_draft_deletion_archive_guard.sql` replaces that table reference
while preserving every eligibility condition, security-definer search path and
private execution boundary. It does not delete or modify league data, rules,
receipts, archives, membership policy or personal-data retention policy.

The database regression now executes eligibility, the actual league-list view,
wrong-name and outsider rejection, successful deletion of an isolated untouched
one-member draft, and rejection/preservation after another member joins. The
dependent Stage 7 member journey verifies rejection after a real 20-pick seal and
unchanged receipts. Both use disposable data; no destructive Production test ran.

## Release and rollback

This is a **proposed forward migration**, not an applied hosted migration.
Production remains at 45 applied migrations ending `20260911211958`. Stage 6's
future-week rules policy and migration remain in place.

After separate approval, apply exactly this migration to `nxikkhtaercmbuyrlyio`
using the project's reviewed migration workflow. Confirm the hosted ledger
records it, compare `pg_get_functiondef` to the tested definition and verify
anon/authenticated still cannot execute the helper. Compare before/after counts
and hashes of competitive evidence; the migration performs no data writes.
Do not delete a real league to demonstrate success. The owner may inspect their
ordinary league list under normal authorized use.

The application API signatures and schema do not change. The migration is
compatible with the Stage 6 app and the dependent Stage 7 UI work. If a release
must be rolled back, retain this corrected guard; restoring the obsolete table
reference would restore the defect. Any database reversal must be a separately
reviewed forward migration preserving all competitive evidence.

No merge, hosted migration, production deployment, security setting or visibility
change is authorized by this note. Final PR/head and test counts are in the
Stage 7 completion handoff and PR release record.
