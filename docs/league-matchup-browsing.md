# League matchup browsing

September 13, 2026. The owner asked to open other league pairings and follow their picks, as in a fantasy league.

Matchup and League Overview now link each current-week pairing to a selected matchup. The spectator view names both members, shows their current returned-credit scores and revealed picks, preserves refresh, and provides Back to your matchup. Incomplete cards remain visible with their official zero; browsing does not require both members to have submitted.

The additive authenticated `api.get_league_matchup_cards` read verifies current league membership (including existing private-rehearsal containment) and the requested week's league. It returns only event-revealed positions and post-lock compliance. Scheduled events, future start evidence, receipt hashes, acceptance timestamps, hidden allocations and pick counts are absent. Authoritative voids remain visible. Current scores sum only latest visible settlements for compliant cards; incomplete cards score zero and missing/pending state stays unavailable. Official result versions take precedence on published results. Existing owner reads, receipts, scoring and provider cadence are unchanged.

Before reveal, a member can open another pairing's names and empty matchup shell. This does not extend the pre-lock submission-flag decision to the whole league. Future-pick messaging depends only on the public slate, not the presence/count of another member's hidden picks.

Verification includes projection/component tests, database authorization/reveal/settlement tests, and the disposable real-account browser journey for a third member viewing a partially revealed 20-pick card, navigating back, and checking phone reflow at 320px/200% text. These checks do not represent a physical iPhone test.

Release requires the additive migration and application release. With an older database, other-pairing links remain unavailable and the existing own-matchup flow continues. No production migration or merge is authorized by this note. Revert the application commit to roll back; the additive read can then be revoked/dropped separately without changing stored competition data.

## Verification and handoff status

Local checks passed: 477 unit/property/component tests across 78 files, identity verification, formatting, lint, strict TypeScript, and production build. The build initially rejected the cross-worktree dependency symlink; copying dependencies into this checkout resolved that environment issue, and the normal build passed.

The owner approved branch publication and PR creation after the local checks. PR #44 passed all CI checks at `0cde0f6c87862426809ae59bc957926ea7727d97`: 1,011 database assertions, generated types, 13 desktop full-stack tests, 8 mobile authentication tests, and the mobile member journey. The full-stack report gates recorded zero skips and zero retry passes. The phone-sized WebKit spectator screenshot was visually inspected. Shared UI suites passed 62 Chromium and 61 WebKit tests; the existing forced-colors test is Chromium-only.

On September 14, the owner explicitly approved the production database update, merge, and deployment. A transactionally rolled-back permission dry run passed before applying the exact reviewed SQL to the hosted Sunday Ledger database. Supabase recorded the migration as `20260914010340_league_matchup_browsing.sql`; only the repository filename was aligned, with no SQL changes. The hosted statement hash matches the reviewed file, anonymous execution is denied, and authenticated execution is granted subject to the function's membership checks.

The branch is based on main `bb5010209198b4825ce98d66cc922b3e032e193d`. The pre-release application deployment was `5e6721a`; the intervening PR #43 changed only already-applied SQL, documentation, and tests, not application code. The release-alignment commit repeats CI before merge. PR #44 records the final merge, deployment alignment, and production verification status.
