# Member UI cleanup — September 17, 2026

The owner authorized one implementation PR for the running visual-cleanup
backlog. Baseline: `3b1b8611b313b56117839839f0ac4761741a0961` (PR #79).
Per-league naming and all other substantive features remain separate.

## Scope and dispositions

| Backlog IDs      | Treatment                                                                                                                                                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01, 13           | Remove routine props-availability counts; preserve closed/unavailable/awaiting-line states. Explain shared credits and full-game period once under Card requirements.                                                                                                             |
| 02–04, 08–12, 29 | One labeled credit summary, concise local draft-save status only when drafts exist, storage failure feedback retained. Remove repeated acceptance counts, settlement totals and permanence prose. Existing matchup score details retain outstanding stakes.                       |
| 05–06            | Remove own rolling-submission status and Pregame badge. Keep a quiet opponent participation label before reveal; preserve legacy card-completeness information.                                                                                                                   |
| 07, 17, 21       | Remove duplicated final prose/badge from previous-result module; retain provisional/corrected distinctions. Explicitly place previous results below current bets; current-result summary stays above.                                                                             |
| 14–15, 22        | Retain player statistic while removing repeated player/team/full-game metadata. Explain reveal timing once; keep hidden versus absent-bet distinction. Remove Remaining badge, preserving exceptional and settled outcomes.                                                       |
| 16               | Omit repeated open-betting sentence when the next-action card supplies that context; retain short Betting still open fallback for spectator/no-card views.                                                                                                                        |
| 18–19, 37        | Remove visible Live season labels from normal league chrome/list; retain simulation/example/rehearsal labels. Reduce repeated week/status metadata; move exact score-check timestamp into details while preserving age/delay. Keep Utilities accessible without a visual heading. |
| 20, 36           | Shorten submission commitment warning; retain explicit review/submit. Empty rolling batch review is visibly disabled; invalid nonempty drafts can still open actionable validation.                                                                                               |
| 23–24, 33–34     | Put historical week/version mapping and technical audit evidence under secondary Technical details; remove Recorded badge and POC package prose. A new explanatory rule-change history is deferred as substantive work.                                                           |
| 26–28            | Return help follows the full-width My Card list. Potential return remains visible; arithmetic and receipt link are in Pick details.                                                                                                                                               |
| 30–32, 35, 38    | Remove routine Member labels, repeated regular-season row labels, betting badge on Standings and redundant overview subtitle. Schedule marks Current in selector and retains accessible selected-week context.                                                                    |

No domain/ruleset bytes, provider requests, database schema, permissions, Auth,
receipt terms, scores, deadlines or navigation destinations change. No production
bets or commissioner operations are used to test this PR. No migration is needed.

## Verification

- TypeScript, lint and production build passed locally.
- Existing tests were updated for the intended labels/disclosures; credit values,
  receipt counts, privacy assertions and acceptance behavior remain asserted.
- Added regression coverage for previous/current result placement and quiet
  opponent-only rolling pregame status.
- Final local unit/component/markup suite: 132 files, 1,107 tests passed.
- Local browser execution initially could not launch because browser binaries
  were absent; download attempts timed out. Required CI and hosted Preview
  verification remain to be recorded before declaring this ready.

Merge/release is not part of this implementation authorization. Rollback is a
reviewed application revert; no stored-data recovery is involved.

## Publication status

The local branch is `codex/ui-cleanup-backlog`. Automatic approval review
rejected publication to the public `alexpfeffer4/sunday-ledger-matchups` repository
and requires explicit owner approval of that publication. No PR has been created,
no merge occurred, and no Production change was made. Hosted Preview and CI
verification remain pending that approval; local browser binaries were unavailable
and the normal download timed out. Do not bypass the rejection.
