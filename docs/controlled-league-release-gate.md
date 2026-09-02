# Controlled-League Reliability and Simplification Gate

This is the release record for the first controlled friend league. It is
operational evidence, not a change to the Product Bible, Ruleset V1.1, or the
settled decision register.

## Migration-history reconciliation

On 2026-09-02, the repository and hosted project each contained 37 named
migrations. Names and semantic order were unique. Hosted recorded statements
matched the complete local SQL SHA-256 for 35 migrations. The remaining two
matched exactly after accounting for a leading/trailing newline
(`fix_join_league_conflict_target`) and an unrecorded leading comment
(`league_lifecycle_cleanup`). There was no ambiguous mapping and no database
object or migration system table was changed.

The 28 repository timestamps were aligned to the already-hosted timestamps:

| Migration                                       | Prior repository version | Hosted/reconciled version |
| ----------------------------------------------- | -----------------------: | ------------------------: |
| `stage1_vertical_slice`                         |           20260827185557 |            20260827192723 |
| `stage1_fk_index_hardening`                     |           20260827192902 |            20260827192952 |
| `stage2_simulation_season_archives`             |           20260827203604 |            20260827204500 |
| `index_simulation_archive_season_foreign_key`   |           20260827204615 |            20260827204628 |
| `accept_stage1_card_atomically`                 |           20260827214006 |            20260827214627 |
| `stage3_live_odds_imports`                      |           20260827222000 |            20260827222830 |
| `stage3_live_odds_import_fk_indexes`            |           20260827223000 |            20260827222957 |
| `stage3_live_slate_publication`                 |           20260827231004 |            20260827231555 |
| `stage3_live_quote_refresh`                     |           20260827234630 |            20260827235354 |
| `stage3_live_quote_heads_fk_index`              |           20260827235443 |            20260827235510 |
| `stage3_live_roster_lock`                       |           20260828000851 |            20260828001714 |
| `stage3_live_results`                           |           20260828005500 |            20260828010522 |
| `stage3_live_score_import_policy`               |           20260828010700 |            20260828010758 |
| `stage3_live_week_progression`                  |           20260828013500 |            20260828013020 |
| `stage3_live_playoff_qualification`             |           20260828014500 |            20260828015845 |
| `stage3_live_playoff_fk_index`                  |           20260828020000 |            20260828015941 |
| `stage3_live_postseason_rounds`                 |           20260828023000 |            20260828022339 |
| `stage3_live_postseason_fk_index`               |           20260828024000 |            20260828022638 |
| `stage3_live_season_archive`                    |           20260828030000 |            20260828024311 |
| `stage3_live_season_archive_fk_index`           |           20260828031000 |            20260828025057 |
| `editable_usernames`                            |           20260828040718 |            20260828040937 |
| `private_invitation_links`                      |           20260828043558 |            20260828045030 |
| `phase1_anon_invite_preview_schema_usage`       |           20260828210751 |            20260828210832 |
| `phase2_official_rules_and_standings_integrity` |           20260829000000 |            20260829023327 |
| `phase2_trusted_creation_compatibility`         |           20260829194613 |            20260829195153 |
| `phase4_simulation_containment`                 |           20260829090000 |            20260829233237 |
| `phase6_future_sealed_projection`               |           20260830044648 |            20260830100902 |
| `phase7_weekly_close_read_model`                |           20260830153000 |            20260830154215 |

The only new semantic migration is
`20260902180000_controlled_league_reliability.sql`. It closes three confirmed
private `SECURITY DEFINER` default-execute gaps, adds caller-only command-result
lookup, and replaces browser use of the non-recoverable invitation command with
an atomic retry-safe command.

## Required release evidence

| Layer      | Required proof                                                           |
| ---------- | ------------------------------------------------------------------------ |
| Local code | `npm run verify`                                                         |
| Database   | clean `supabase db start`; complete `supabase test db`                   |
| Types      | local `api,public` generation equals checked-in types                    |
| Full stack | `controlled-league-full-stack.spec.ts` with local Auth and Postgres      |
| Browser    | Phase 8/10/11 Chromium and WebKit jobs                                   |
| Identity   | generated vectors, export hashes, icons, manifest, and social preview    |
| Hosted     | supported migration dry run, reviewed apply, then a second no-op dry run |
| Production | deployment commit alignment and read-only public/Auth/identity smoke     |

The hosted Data API schema list and leaked-password setting must be confirmed in
the Supabase project settings before accepting a real card. The intended
externally exposed schema is `api`; `private` must not be exposed. Leaked-password
protection must be enabled through the supported Auth password-security setting
when the project plan permits it. Do not emulate either control with SQL.

## Manual screen-reader acceptance

The automated gate cannot run VoiceOver or NVDA. Before the first real card, use
one of them for this five-minute spot check:

1. Open a valid signed-out invitation and confirm league name, practice/Live
   mode, privacy note, and Create account destination are announced in order.
2. Complete account setup and join; confirm focus lands on the destination page
   heading.
3. Open Make picks, add a pick, close and reopen the editor with keyboard only,
   and confirm focus returns to the launching outcome.
4. Review a changed quote and confirm old terms, current terms, and the required
   review action are announced before the seal button becomes available.
5. Seal the card, open one receipt, then open Matchup. Confirm own receipt terms
   are announced while no future opponent pick count, term, stake, or odds is
   present in names, landmarks, status text, or navigation.
6. Navigate with browser Back/Forward, mobile navigation, and the skip link;
   confirm one destination heading announcement per route and correct dialog
   return focus.

Record browser/OS/screen-reader versions and Pass/Fail in the pull request.
