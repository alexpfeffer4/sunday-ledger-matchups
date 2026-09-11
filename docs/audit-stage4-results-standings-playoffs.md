# Audit Stage 4 — Results, standings, and playoffs

Implemented against main `78efbc3952127f93d5f1936c696bcfaa203e4455` (Stage 3 / PR #31), on 2026-09-11. Scope: implementation-pack Prompt 4, audit A06–A08, and remaining Eastern Time presentation from A10.

## What was already complete

- Stage 3 already hid the score-path panel after final and established Build / Review / Card sealed. Its local owner drafts and explicit review path remain intact.
- Standings already had tabular numerals, a single qualification cut line, member identity, and incomplete-week eligibility data. The change is how these facts align and reflow.
- Published playoff DTOs already supplied qualification seeds, automatic advancements, results, correction lineage, and champion/archive finality. No bracket computation needed replacing.
- A shared Eastern Time formatter already handled daylight saving. Weekly close now uses it instead of a second formatter with an unlabeled zone.

## Changes and confirmed defects

| Finding                                            | Change                                                                                                                                                                                                                                                                               | Preserved behavior                                                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A06: repeated final emphasis and internal language | One current result heading and score; the matching weekly close becomes supporting record/standings and next-opponent context. An older result stays in a disclosure. Completed empty panels are omitted. Plain picks/current score/checking language.                               | Private/sealed picks, scoring, corrections and audit evidence. Final is neutral; actual win/loss/tie controls outcome color.                                    |
| A07: tall mobile cards and weak numeric comparison | Compact aligned member rows, right-aligned numeric columns, modest current-member marker, one visible cut line. At enlarged text, each row reflows with explicit metric labels and unbroken numbers.                                                                                 | Ranking, Points For, incomplete weeks, eligibility, and cut-line calculation.                                                                                   |
| A08: bracket field displaced the member's question | Current published round, own contest, qualification seeds, and championship path lead. Other pairings and other rounds follow; exceptional reinstatement copy appears only for actual reinstatements.                                                                                | Four/six-slot and frozen legacy formats, reseeding, higher-qualification-seed tie resolution, automatic advancement evidence, champion versus archive finality. |
| A08: missing-data fallback                         | Confirmed generic matchup fallback said bye/out when expected data was absent. It now names unavailable data and recovery. Missing/ambiguous current playoff rounds or member contests also recover honestly. Prequalification and unpublished-after-Week-14 states remain distinct. | No manufactured bye, result, qualification, or bracket repair. No claim of a production bracket defect.                                                         |
| A08: exhibition label                              | Confirmed projector/schedule paths labeled every exhibition “Week 18 exhibition.” A shared label uses the actual week, scope, and role.                                                                                                                                              | Weeks 15–17 exhibitions remain exhibitions; Week 18 is explicitly labeled. Competitive-history exclusion is unchanged.                                          |
| A10: time consistency                              | Weekly-close deadlines use the existing Eastern Time helper with EDT/EST. Current playoff deadlines use the same helper.                                                                                                                                                             | Stored instants and audit timestamps; no deadline or timezone-rule change.                                                                                      |

No database migrations, provider calls, scheduler changes, auth changes, season rule changes, or production mutations. Navigation, cream/green/copper identity, and historical rulesets remain in place.

## Before and after evidence

Screenshots use deterministic component fixtures and the real application CSS in headless Chromium. “Before” was captured from the starting main markup before implementation. They are not production league observations or physical-device screenshots.

| View                                         | Before                                             | After                                                                                                                                                                                  |
| -------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile standings, same two long member names | [Before](evidence/stage4/before-standings-390.png) | [After](evidence/stage4/after-comparison-standings-390.png)                                                                                                                            |
| Playoff hierarchy                            | [Before](evidence/stage4/before-playoffs-390.png)  | [Ordinary current round](evidence/stage4/after-ordinary-390.png), [sparse field](evidence/stage4/after-sparse-390.png)                                                                 |
| Final result                                 | [Before](evidence/stage4/before-final-390.png)     | [Won](evidence/stage4/after-won-390.png), [lost](evidence/stage4/after-lost-390.png), [tied](evidence/stage4/after-tied-390.png), [corrected](evidence/stage4/after-corrected-390.png) |

The final-result baseline is the paired component only; the after fixture includes supporting weekly close. The playoff after fixtures also exercise a different current round and explicit viewer context. These illustrate hierarchy, not a pixel-for-pixel comparison of identical league state.

Additional evidence: [16-member standings](evidence/stage4/after-standings-390.png), [unavailable matchup](evidence/stage4/after-unavailable-390.png), [standings at 320 px / 200% text](evidence/stage4/standings-320-large-text.png), [result at 320 px / 200% text](evidence/stage4/result-320-large-text.png), [desktop playoffs](evidence/stage4/playoffs-desktop.png).

## Verification

- `npm run verify`: identity, formatting, lint, strict types, unit/property tests, and production build.
- New unit/component coverage checks one final heading and neutral status versus outcome color; supporting correction evidence; missing/ambiguous data; explicit byes and qualification seeds; ordinary versus exceptional fields; Week 15–18 labeling through the shared helper, projector, and schedule; and Eastern daylight-saving/date rollover behavior.
- Twelve new browser fixtures cover prequalification, ordinary/sparse/four-slot playoffs, unavailable data, playoff ties, nonqualifiers, won/lost/tied/corrected results, and 16 long member names. Each checks 390 px, 320 px at 200% text, and 1440 px; no page overflow or broken numeric values. Desktop checks include axe WCAG A/AA, keyboard disclosures, numeric alignment, and a single visible cut line.
- Existing paired-matchup, weekly-close, playoff/finality, and navigation/records browser regressions are retained. The navigation test now selects the visible Points For / incomplete-week labels after text reflow, rather than the hidden desktop/header copy.
- The new fixture generator and browser tests are included in the existing Phase 8C Chromium **and WebKit** gate. Required clean migration, pgTAP, generated-type, real Auth/RSC/RPC, authorization, and full-stack lanes remain enabled without new skips.

Local browser execution used Chromium from a temporary external runtime package because the usual browser CDN was unavailable. No package, config, executable, or test-only route was added to the repository. CI uses the existing pinned Playwright install and disposable database.

Measured text contrast for changed surfaces (relative luminance): muted on canvas **5.23:1**, muted on subtle **4.88:1**, green outcome on white **6.52:1**, red outcome on white **6.28:1**, copper on white **5.98:1**; dark muted/green/red on the raised dark surface **7.39:1 / 7.30:1 / 6.09:1**. These are targeted measurements, not a whole-product accessibility certification.

## Remaining observations and next stage

- Physical iPhone Safari / Android Chrome text scaling, VoiceOver / TalkBack, actual touch and keyboard use remain owner checks. Browser fixtures and WebKit emulation do not substitute for them.
- On a permitted test league, inspect a finalized week, open its correction disclosure, compare standings, then open current playoffs. Confirm member/opponent names, complete scores, a single cut line, and readable Eastern deadlines. Exercise real missing-data recovery only in disposable data; do not alter a live bracket for this check.
- Prompt 5 owns invite/account/recovery/practice work. Inspect merged PR #28 and subsequent changes before touching that flow. Original hosted email failure and cross-device email behavior are still unproved; use local email capture and keep invite destinations intact.
- Preserve Stage 1 quote reliability, Stage 2 bounded kickoff/score checks, and Stage 3 device-local drafts. Their outstanding production observations remain outstanding.
- Prompt 6 owns governing-source reconciliation and frozen ruleset compatibility. This change introduces no new rule version. Prompt 7 retains the ordinary production observations and owner rehearsal follow-up; a later passing run alone does not diagnose the historical Week 14 rehearsal flake.
- Review and merge are separate from this implementation. Do not deploy separately or mutate production to validate this presentation change.
