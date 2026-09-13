# Mobile visual and UX audit implementation

Implements the September 13 mobile audit as one combined change, as requested by the owner. The starting point is main `f881aad41dcf131abc0445bf399a25eb07ca8fca` (PR #39).

| Finding | Implementation                                                                                                                                                                                                                                                                                                 |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M01     | Matchup and League Overview render the same scoreboard projection. Before confirmed play or an official result, scores are unavailable and use dashes; an applicable zero remains `0.00`.                                                                                                                      |
| M02     | Empty standings lead with “No final results yet,” explain publication, and link to current matchups. The frozen tiebreak chain and rules identity remain available in a disclosure.                                                                                                                            |
| M03     | Make picks has a short heading, one compact owner summary/deadline, earlier games, and the existing working-card tray. Card requirements follow the slate.                                                                                                                                                     |
| M04     | Shared summaries distinguish draft, ready, closed, and sealed. Accepted cards show “Cards lock” as schedule context and a receipt/card action. Device-local persistence and failure warnings remain explicit.                                                                                                  |
| M05     | My Card uses compact rows with game, selection, intact odds, stake, result and return. Details retain line, kickoff and acceptance time; every immutable receipt remains linked. Final review keeps full terms and quote-change approval.                                                                      |
| M06     | Option odds use 15/20 mono, with line and price in separate indivisible spans. Two outcomes remain side by side at ordinary narrow phone sizes, with a text-relative stacking breakpoint for enlarged text.                                                                                                    |
| M07     | The editor follows VisualViewport height and offset, keeps header/footer outside its scrolling body, maintains field focus during viewport events, and provides one focus boundary around the stake field. The total and 48px action remain in the footer; full arithmetic is available in “How returns work.” |
| M08     | Reveal wording requires a confirmed start and scoring wording describes checked results. Existing freshness, provisional/corrected outcomes, season consequences and actual next matchups remain. Archived championship winners say “won the championship.”                                                    |
| M09     | Commissioner lifecycle labels use participant language and corrections are separate from authorized readiness. Missing readiness is never replaced with “Sealed.” History introduces completed results.                                                                                                        |
| M10     | Compact headings, intrinsic-size status badges, sentence-case labels and explicit subtle dividers reduce repeated presentation while retaining the existing identity and navigation.                                                                                                                           |

## Boundaries

No database migration, scoring calculation, frozen rules, quote validation, acceptance command, opponent privacy contract, provider cadence, scheduler activation, season transition, or historical result is changed. The additional League Overview query reads the same authorized stored operations used by Matchup; it does not request fresh provider data. Commissioner next-action and completed-setup controls remain in their existing order.

## Verification

The PR runs the existing quality, database, full-stack member, and Chromium/WebKit acceptance gates. New focused regressions check viewport resize/pan/dismissal without lost input, fallback when VisualViewport is absent, identical cross-route score meaning in six phases, and truthful empty standings. The Practice browser journey now also checks a simulated 400px visual viewport at normal and 200% text, with reachable close, complete total and action, preserved stake, and successful addition after restoring viewport height.

The browser viewport simulation is not a physical iPhone keyboard test. After the preview is available, check the same editor on iPhone 15 Pro Safari with keyboard up/down and browser bars expanded/collapsed. Confirm the total and Add button are fully visible, invalid stake can be corrected, close remains reachable, and dismissing the keyboard preserves the draft. Use public Practice or an isolated rehearsal; do not alter an already-sealed real card for this check.

## Rollout

Review and merge the combined PR through the normal deployment workflow. No separate staged implementation or configuration activation is needed. Roll back by reverting this PR; accepted receipts and existing device-local draft storage remain compatible.

## Production verification correction

PR #40 was squash-merged as `9041dcf12cef7d5087650b9f4c37ca393f8b25e5` and its matching production deployment reached Ready. The live check found that the large matchup header still rendered unavailable scores as zero, and a fully accepted owner card with pending compliance could be mislabeled Not started. The verification follow-up makes score availability explicit in the shared presentation projection, uses dashes and accessible unavailable labels until a confirmed event or official result, and recognizes the owner's full accepted allocation. Genuine zero scores after play starts, incomplete-card outcomes, score arithmetic, and opponent privacy remain unchanged. The redundant League Overview state badge is omitted when the shared paired scoreboard is available, avoiding a stale Cards open label after the deadline.

Regression checks cover the main header as well as both small scoreboards, delayed updates after confirmed play, and pending/compliant/incomplete owner-card presentation. Physical iPhone Safari keyboard confirmation remains a device follow-up; automated viewport emulation is not a claim that it has been performed.
