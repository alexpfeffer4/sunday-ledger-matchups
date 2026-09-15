# NFLverse source verification — September 15, 2026

The later [approved nflverse primary pilot](../governance/2026-09-15-nflverse-primary-pilot.md)
supersedes this report’s earlier candidate/independent-source launch dependency.
This report preserves its original sample and verification limits; it is not
proof of a reviewed future menu or hosted settlement.

Read-only public-source verification at **2026-09-15 15:52 UTC** confirmed that
the current NFLverse adapter can parse current-season player totals and offensive
snap evidence. This check made no paid API calls, changed no hosted data or
source flags, and did not activate player props. Raw source files are not committed.

## Published source snapshot

| Source                                                                                                                               | Observed coverage                                                | Last-Modified header (UTC) | SHA-256                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------ |
| [2026 weekly player statistics](https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv) | HTTP 200; 1,118 rows; all 16 Week 1 games                        | September 15, 14:21:38     | `6db305d51624007a623bf16156c8ebba0c7d4a4758504854b341d92bead253b2` |
| [2026 snap counts](https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_2026.csv)                     | HTTP 200; 1,492 rows; all 16 Week 1 games                        | September 15, 11:25:15     | `e995f21949eed665c189b931fd165dc38afd644565a507cd3ff117813304e785` |
| [2026 roster](https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_2026.csv)                                   | HTTP 200; 2,964 rows; Week 1/2 records                           | September 15, 12:40:52     | `18cecb0cfde137954499fe7b3036b43d961e821b37cdd5d6fbd923ed5c05f5b5` |
| [Game schedule](https://github.com/nflverse/nfldata/raw/master/data/games.csv)                                                       | HTTP 200; 272 games for 2026, including 16 upcoming Week 2 games | Header absent              | `952d2b1672d955ee9334fe47f0005a9c8c8b84ba33987a51657ac8879c3eb0c6` |

The statistics and snap files expose the required game/player identifiers,
team fields, individual passing/rushing/receiving yards and offensive snap counts.
Of 357 QB/RB/WR/TE statistic rows, 354 joined uniquely through roster GSIS to PFR
identifiers. No duplicate statistic or snap keys and no joined-team mismatches
were found. Cody White, Treyton Welch and Mike Washington Jr. had blank roster
PFR identifiers; the existing catalog excludes such incomplete mappings.

## Actual adapter smoke

The existing `normalizeNflversePlayerResults` implementation and observation
schema were transpiled without behavioral changes and run against the downloaded
files. Each example used its source game ID and schedule date. The smoke supplied
final-game and complete-file context for the already-completed Week 1 games;
it did not test the hosted authority that establishes that context.

| Player / statistic           | Source game ID    | Published yards | Published snaps                               | Normalized result                          |
| ---------------------------- | ----------------- | --------------: | --------------------------------------------- | ------------------------------------------ |
| Aaron Rodgers / passing      | `2026_01_ATL_PIT` |             221 | 67 offense                                    | Complete; OFFENSE                          |
| Derrick Henry / rushing      | `2026_01_BAL_IND` |             144 | 37 offense                                    | Complete; OFFENSE                          |
| Travis Kelce / receiving     | `2026_01_DEN_KC`  |              71 | 49 offense                                    | Complete; OFFENSE                          |
| Laquon Treadwell / receiving | `2026_01_BAL_IND` |               0 | 19 offense                                    | Complete zero; OFFENSE                     |
| Nick Mullens / passing       | `2026_01_CLE_JAX` |               0 | 7 offense                                     | Complete zero; OFFENSE                     |
| Cade Stover / receiving      | `2026_01_BUF_HOU` |              −2 | 24 offense                                    | Complete negative; OFFENSE                 |
| Greg Dortch / receiving      | `2026_01_BUF_HOU` |               0 | 0 offense; 10 special teams                   | Complete statistic; NO_OFFENSE             |
| Jared Goff / passing         | `2026_01_NO_DET`  |             206 | 77 offense                                    | Complete; OFFENSE; schedule marks overtime |
| Calvin Ridley / receiving    | `2026_01_NYJ_TEN` |         Missing | 32 offense                                    | Null/incomplete statistic; OFFENSE         |
| Joe Flacco / passing         | `2026_01_TB_CIN`  |         Missing | Explicit 0 offense, defense and special teams | Null/incomplete statistic; NO_OFFENSE      |
| Andy Dalton / passing        | `2026_01_WAS_PHI` |         Missing | No snap row                                   | Null/incomplete statistic; UNKNOWN         |
| Cody White / receiving       | `2026_01_MIA_LV`  |               0 | PFR mapping absent                            | Complete statistic; UNKNOWN participation  |

All twelve observations passed the current schema. These are normalization
results, not executed settlements. In particular, no offensive participation and
missing participation remain distinct. Andy Dalton's current roster record was
used only to test absence handling; it does not prove his Week 1 game eligibility.

Verified source-code SHA-256 values:

- `src/adapters/providers/nflverse/normalize-player-results.ts`:
  `c51d683c6b7fa878735485cd653ae6741dbf5662b312094d15a014260b025994`.
- `src/application/providers/player-results.ts`:
  `d10a07ec233caa4052d560e3b9091446275a2a5f5c0b666d7b0c016a1de8a43b`.

The eight numeric/participation observations produced evidence-file SHA-256
`e7fb7498987e953d380652809997b34bfa30e910410b74a9b238f3b1bc1cc9b2`;
the four missing/mapping observations produced
`38e6fc7708e242b96e5fda1eff2105f070af02c1369988f2ec1c8e37b6790812`.
Those hashes identify the local check outputs, not retained Production evidence.

## Limits and remaining release evidence

- **Missing totals are real:** 62 mapped QB/RB/WR/TE snap rows had no statistic
  row: 45 with offensive snaps, 16 with special-teams-only snaps and one explicit
  all-zero snap row. An absent statistic row cannot become an inferred zero.
- **Absence does not prove DNP:** 92 currently active roster players were absent
  from both Week 1 files. Current roster status does not establish historical
  participation. Missing evidence remains pending under the existing policy.
- **Week 2 is prospective:** no Week 2 results were published in these files.
  Current-season compatibility does not guarantee future completeness or every
  offered player's identity mapping.
- **Independent-source integration remains:** API-Sports coverage, event/player
  joins, provider permissions and live catalog readiness require their separate
  evidence. This NFLverse check cannot validate those gates.
- **Hosted timing remains unmeasured:** final detection, dispatcher execution,
  source availability, import and member-visible settlement still need a hosted
  timing trace. File revision timestamps do not measure first-publication latency.

The official [publication schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html)
describes nightly player-stat updates plus selected game-day runs. PFR snap
updates run at 00/06/12/18 UTC, subject to upstream availability. These schedules
do not support a 5–15-minute participation guarantee. The distinct FTN
participation dataset is published after the postseason; this implementation
uses [PFR snap counts](https://nflreadr.nflverse.com/reference/load_snap_counts.html).

## Attribution and retained normalized evidence

The [nflverse-data license](https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md)
publishes CC BY 4.0. It permits reproduction and adaptation within the licensed
rights, subject to attribution and the other stated conditions. Its term is not
ended merely because the source stops distributing material. It does not warrant
unrelated third-party rights or data accuracy.

The existing `/trust` page credits the NFLverse project, links the license and
states that Sunday Ledger formats the published data and applies league rules.
This check uses their published totals and snap evidence; it does not reconstruct
statistics from play-by-play. Only permitted normalized evidence should enter
the existing append-only result pipeline. No source-validation flag was enabled
by this verification.
