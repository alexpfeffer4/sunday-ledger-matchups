# Historical matchup browsing

Owner requested and authorized implementation, merge and deployment on September 15, 2026.

Completed weeks now open the full paired matchup at `/l/[slug]/matchup?week=N`, with an optional `matchup` ID for another league pairing. The Week selector distinguishes the selected week from the current week; changing weeks opens the viewer's pairing. Matchup selection and Around the league keep the chosen week. Back links return to the viewer's pairing in that week or to the current week.

History and Schedule link directly to matchup details. Schedule uses each week's official score and decision, retains past postseason weeks, and leaves unknown scores unavailable. It no longer labels a week final solely because its number is earlier than the current week, or applies a current rematch's winner to past/future pairings. Real completed-season Schedule and History also link to the retained matchups; the illustrative Example Season remains separate.

The historical projection composes the existing member-authorized `get_weekly_close_state` and `get_league_matchup_cards` reads. It requires a final week and a final official result in the current season, matches the returned card week, and uses published game metadata for ordering. It displays the stored selections, accepted odds, original stakes, settlements and returned credits. Official matchup scores and decisions take precedence over receipt sums, including incomplete-card zeroes. Records use the latest final standings through the selected week. Corrections remain visible. Missing evidence produces a recovery error rather than invented bets, scores or empty cards.

This changes no database function, permission, receipt, settlement, scoring rule, provider refresh or season rule. Historical pages expose no editing controls and start no score polling. Live sealed-pick protection and private owner-rehearsal access continue through the existing database guards.

Regression coverage includes week/season validation, side-B ownership, spectator winner wording, accepted terms and official-score precedence, corrected/incomplete results, historical standings, Schedule links, archive routing and malformed URLs. The disposable authenticated browser journey advances from finalized Week 1 to open Week 2, opens Week 1 and another pairing, follows History/Schedule links, checks narrow layouts and denies an outsider. This journey runs on desktop Chromium and mobile WebKit before release.

Rollback is an application revert; no database rollback or data repair is required.

## Verification and release status

Implementation is based on main `d2d89736b26fcacebca17e0d308c299e6974a6e5`.
Local identity verification, formatting, lint, strict TypeScript, all 568 tests
across 88 files, and the production build passed. Read-only hosted checks confirmed
Live Week 1 is FINAL, Week 2 is OPEN, and the existing public-card query includes
the historical event metadata used by this change.

The owner explicitly approved publishing the historical-matchup changes to
`alexpfeffer4/sunday-ledger-matchups`, then merging and deploying once checks pass.
This resolves the initial destination-specific publication approval block.

Release requires the existing PR checks, including the extended desktop/mobile
authenticated journey, screenshot review and Preview verification. The PR records
final CI, merge and Production deployment evidence. No database migration is needed.
