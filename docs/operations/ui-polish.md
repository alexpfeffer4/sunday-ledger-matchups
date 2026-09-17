# UI polish — September 17, 2026

One bounded implementation of the current UI polish audit. The owner requested
implementation in the audit chat, with one PR and a reviewable Preview. The owner
subsequently authorized merge and release after the remaining review and required
checks pass. Deployment verification remains a release step.

## Baseline and scope

Main and Production were reverified at UI-3 / PR #76,
`0d82f94b5ce65129d8450adfe9589e49638c67ba`, Production deployment
`dpl_3Bn4dE93d8stgfmMHvQc8RZEAA3W`. There were no overlapping open PRs.
The September 17 audit used fresh desktop observations and exact-release mobile
fixtures. Its 320px/200% review images were stress cases, not proposed designs
or representative normal-phone screenshots.

| Audit   | Presentation change                                                                                                                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P01     | Stack existing native matchup selectors at 480px and below.                                                                                                                                                         |
| P02     | Remove the redundant custom sidebar tooltip that extended the scroll area. Keep native title tooltips, accessible names and focus treatment in compact and full rails.                                              |
| P03     | Shorten complete-card review to Review card; retain the completeness helper. Use the existing 24px page-heading token at 360px and below; preserve 28px at normal 390px and allow text enlargement to 48px at 200%. |
| P04     | Restore the native Audit details disclosure marker and preserve its 44px target.                                                                                                                                    |
| P05     | Put the provider timestamp inside the existing odds-freshness line's native disclosure. Keep the checked/pending/delayed label visible.                                                                             |
| P06–P07 | Keep credit categories and one accepted count, remove the repeated total sentence, and remove the outer frame around return help.                                                                                   |
| P08     | Use a secondary outlined refresh action with unchanged behavior/loading feedback.                                                                                                                                   |
| P09     | Keep the older-rules practice warning prominent; disclose the detailed comparison and reduce repeated unsaved labels.                                                                                               |
| P10     | Use Send verification email, remove duplicated signup setup instructions, retain page-level setup requirements and conditional code/browser guidance.                                                               |
| P11     | Use View your matchup on Overview and remove its misleading current-item semantics there. Keep the selected accent and destination.                                                                                 |
| P12     | Show the selected week's common Schedule state once, retaining distinct row states and accessible row context. Preserve historical/current-week distinction.                                                        |
| O01     | Hide redundant zero outstanding rows only for verified final results with both values zero. Keep unavailable and provisional totals.                                                                                |
| O02–O04 | Use readable practice market/result labels, space historical score separators, normalize displayed line minus signs, and remove repeated account help.                                                              |
| C01     | Shorten conditional schedule wording and remove duplicated status inside This week. Keep finality waiting generic because the RPC week can mean the current or upcoming week.                                       |

No competitive rule, provider policy/budget, authentication flow, database schema,
permission, receipt, score, history, season consent or navigation destination is
changed. Returned credits remain unavailable for re-betting. Drafts do not reserve
credits. Changed-term review and explicit acceptance remain intact. Full archive
and exception statuses are retained when their wording differs from the week.

## Verification and evidence

The final review identified ambiguous `PREVIOUS_WEEK_RESULTS` payloads: after
reconciliation `week` identifies the current week, while another path supplies
the upcoming week. The UI therefore names neither an inferred pending week nor
an opening schedule in that waiting state. Regression cases cover current,
planned and Week 18 finality without changing the RPC or worker.

Run the unchanged complete Acceptance workflow on the candidate head, including
quality, database, concurrency, real Auth/member journeys, shared UI and the
existing preparation/performance scenarios. Update assertions only for changed
presentation; retain counts, original receipt terms, privacy and consent checks.

Targeted regressions exercise sidebar hover/focus overflow at compact/full widths,
stacked selectors, normal and enlarged heading geometry, and final versus
provisional/unavailable outstanding totals. The existing real 20-pick journey now
also captures 390px and 320px review at 100% before its 320px/200% inspection.
Normal mobile images should lead the owner-facing comparison.

Use disposable CI Auth/database and captured test email only. Hosted Preview is
not assumed to have an isolated backend; inspect it read-only, with interactive
practice limited to its fictional unsaved example. No live bets or administrative
controls are exercised. Browser automation is not physical-device, keyboard or
screen-reader evidence. The final PR/status record reports actual check results,
Preview identity and any remaining gaps.

## Release and recovery

After required checks and Preview review, obtain the remaining owner release
approval, merge through the normal Git workflow, then verify Production READY at
the merge SHA and both public aliases. There is no migration, hosted Auth change,
configuration update, provider activation or data conversion to perform.

For an application regression, use a reviewed revert or restore the baseline
deployment above. Do not change stored cards, receipts, results or automation
settings as part of recovery.
