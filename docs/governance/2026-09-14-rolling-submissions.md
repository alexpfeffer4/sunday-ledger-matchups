# Rolling submissions and immediate game visibility

**Decision date:** September 14, 2026. **Owner:** product owner.
**Rules identity:** Ruleset `1.3`, Product Bible `3.2`, for Live and authoritative
Simulation. **Release status:** public PR publication is expressly authorized;
merge, Production deployment and future-week activation are conditionally
authorized after the required checks and release blockers are cleared. This
note does not establish that any release action has occurred.

This is the named Decision Register amendment for the owner's approved rolling
submission change. No new numbered decision is assigned. Read it with the
[current source index](current-source-index.md), the six historical bases, and
the [implementation and rollout record](../rolling-submissions.md).

The owner's latest instruction explicitly replaces the earlier proposal to
wait until the weekly deadline before showing selected games: **a game's identity
becomes visible immediately after a successful submission**. Actual selection
details retain their existing event-start reveal boundary. Watching earlier
results or other members' selected games before submitting later bets is an
accepted strategic consequence, not a defect to remove with another deadline.

The owner's later September 14 instruction separates the effective dates:
**game identities become visible in the current week, including weeks pinned
to 1.2; rolling entry and unused-credit rules begin with the next unopened
week.** In the pilot, this means current Week 1 game visibility and Week 2
rolling submissions, provided Week 2 remains unopened at activation. The
visibility change is a read-policy amendment across supported week versions;
it does not repin a week or alter its betting, scoring or attendance rules.

## Product Bible 3.2 amendment

For weeks governed by Ruleset 1.3, equal opportunity means the same fresh
1,000-credit allocation and the same eligible pregame opportunities. A member
may commit that allocation in several visits. Each accepted decision is
permanent; the card need not use all 1,000 credits to participate.

Unused allocation is not a defensive asset: it expires for zero return and
never carries forward. Weekly score remains total returned credits from accepted
bets. An additional bet cannot subtract returns already earned; waiting can
still change which later risk and payout a member chooses.

Replace the blanket promise that opponents cannot infer any unrevealed card
content with the precise visibility contract below. League members can see
selected game identities immediately and the separately approved whole-card
aggregates at their existing time. Selection details remain structurally absent
until their authorized reveal. Commissioners receive no extra selection access.

Private, free, virtual competition; one weekly opponent; permanent receipts;
visible corrections; record-first standings; season history; and separation of
Live, authoritative Simulation and Example Season remain unchanged. Product
Bible 3.1's prospective removal of All-play continues to apply.

## Ruleset 1.3 contract

| Subject               | Rule for a week using 1.3                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Weekly opportunity    | 1,000 fresh credits; no carryover or returned-credit redeployment                                                                          |
| Submission            | One or several reviewed bets per explicit submission; all-or-none acceptance for that batch                                                |
| Later submission      | Add valid bets on games that remain open, within the original weekly budget                                                                |
| Accepted terms        | Selection, line, odds, stake and acceptance/source evidence remain immutable                                                               |
| Limits                | Whole-credit stakes; minimum 50; at most 20 accepted bets; cumulative original stakes at most 1,000                                        |
| Duplicate positions   | One accepted position per event and market type; no opposing sides, receipt edits, cancellation or top-ups                                 |
| Heavy favorite        | Shorter than −200: maximum 750 on that position; at −200 or longer: up to 1,000, subject to remaining allocation                           |
| Unused remainder      | Permitted, including 1–49 credits; expires at weekly entry closure for zero return                                                         |
| Drafts                | Editable and private; no score or participation credit; never auto-submit                                                                  |
| Markets and slate     | Existing published NFL slate and main pregame moneyline, spread and total markets                                                          |
| Event cutoff          | Strictly before the published scheduled kickoff, or earlier reliable evidence that the event has started; no five-minute submission offset |
| Game visibility       | Distinct game identity immediately after successful acceptance                                                                             |
| Bet-detail visibility | Existing reliable-start or authoritative-void reveal policy                                                                                |
| Aggregate visibility  | Existing former common-lock time, five minutes before the first designated game                                                            |
| Participation         | At least one valid accepted bet; partial allocation is a normal participating card                                                         |
| No participation      | Zero accepted bets when weekly entry closes; applicable regular-season, playoff or exhibition consequence                                  |
| Scoring               | Sum of accepted receipt returns, using existing rounding; wins return stake plus profit, losses zero, pushes and voids stake               |

The persisted package uses `BATCH_ATOMIC`, `SUBMIT_BETS`,
`requireFullAllocation: false`, and `EXPIRE_AT_WEEK_ENTRY_CLOSE` in its card
contract. Its slate contract adds `EVENT_SCHEDULED_KICKOFF`,
`ACCEPTED_SUBMISSION`, and `COMMON_LOCK` for entry cutoff, game visibility and
aggregate visibility respectively. `ZERO_ACCEPTED_POSITIONS` defines
nonparticipation. These are audit identifiers, not participant-facing labels.

Do not introduce an odds band, aggregate favorite cap, minimum weekly spend,
new game window, props, parlays or live-game betting. The approved 1.2 standings
order, league sizes, schedule, bracket structure and numerical scoring remain.

## Cutoffs, expiry and quote evidence

Use authoritative database/season time, including the existing isolated
Simulation clock. Review does not reserve a deadline: acceptance at or after
the cutoff fails even if review began earlier. Earlier confirmed play closes
acceptance; a missing or delayed LIVE flag never extends it.

Keep cutoff enforcement separate from detailed reveal. Scheduled time is enough
to reject a new bet; by itself it is not permission to reveal an accepted
selection. Preserve the existing confirmed-start, documented operator evidence,
authoritative-void and postponement policies. A delayed kickoff report cannot
automatically move the published cutoff or reopen a closed event. Audited
integrity handling must retain enough timing evidence to explain a decision.

Weekly entry closes at the last submission cutoff in the published eligible
slate, not the last game a member happened to select. Preserve that finite
published deadline when games are canceled; use the existing integrity paths
for their result treatment. Temporary quote absence, a provider outage or an
unavailable page does not establish permanent closure or a missed week.

The published slate and rule identity freeze at the appropriate first accepted
submission. Later batches never authorize discretionary slate changes.

Existing quote source-age, successful-fetch-age and member-review limits still
apply to each batch. Extend the bounded review/refresh path through afternoon,
Sunday-night and Monday windows within the approved provider plan. Preserve
deduplication, leases, cooldowns, quota and changed-quote review. Reading or
refreshing the visible game list does not require an external provider fetch.
The score-check cadence and paid plan are unchanged.

## Exact visibility boundary

The game-identity permission below applies to the current week and future weeks
regardless of their supported ruleset version. For a legacy week, accepted bets
are those from the existing successful whole-card seal. Showing those games
does not reopen submission or turn an incomplete legacy card into participation.
The 1.3 remaining/expired-credit fields and participation definition remain
version-specific. Existing detailed-reveal and aggregate timing are unchanged.

| Reader and information                                            | Permitted time or scope                                                                         |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Owner's accepted bets and remaining allocation                    | Always through existing authorized own-card access                                              |
| Owner's unsubmitted draft                                         | Existing private/device-local draft access only                                                 |
| Same-league member's distinct selected games                      | Immediately after server-confirmed acceptance, including before the former common lock          |
| Actual selection, market, line, odds, individual stake and payout | Only when the event passes the existing detailed-reveal gate                                    |
| Whole-card outstanding count and original-stake total             | After the former common lock; include accepted unsettled bets on participating partial cards    |
| Another member's unused available allocation                      | Within that same aggregate-visibility window; after entry closes distinguish expired allocation |
| Scheduled-opponent and commissioner submission indicator          | Existing authorized scope; for 1.3, submitted means at least one accepted bet                   |
| Outsider, anonymous or other-league access                        | No new access                                                                                   |

Show one neutral row per distinct event, with game identity and kickoff
information. A second market on the same event does not create a second row or
publish a per-game count, stake, receipt identifier or submission log. Drafts,
reviews, failed requests and optimistic client state cannot add a game row.
Apply this to all authorized pairings within the league, not just the viewer's
scheduled opponent.

The game list necessarily reveals that a member has selected at least one bet
on each listed game. Existing whole-card aggregates can reveal further exposure
by subtraction, especially on small cards. The owner accepts these inferences;
the interface must not promise complete immunity from inference or add hidden
selection-derived return scenarios or clinching claims.

Enforce this boundary before serialization in database/server read models,
including direct APIs, page payloads, caches, accessible names and exports.
Rendering a hidden field invisibly does not satisfy the rule. Preserve private
owner-rehearsal containment and all existing membership checks.

## Participation, settlement and season finality

A partial card participates normally. For example, a 600-credit bet at +100
returns 1,200 if it wins; the unused 400 expires and the weekly score is 1,200.
If the accepted bet instead voids, its 600-credit stake returns to the score;
the other 400 still expires. Neither outcome restores spendable credits.

Only zero accepted bets at weekly entry closure creates nonparticipation.
In the regular season this means an automatic loss, zero Points For and one
attendance miss; both absent receive losses. Preserve the third-miss
playoff-ineligibility threshold. A zero-bet member in a competitive playoff
matchup receives the existing elimination/advancement treatment. Partial cards
can win, lose or tie normally, including the existing higher-seed playoff tie
rule. An exhibition miss remains exhibition-only, and cannot eliminate a bye
recipient or affect official records, regular-season attendance, qualification
or the champion.

Earlier bets may settle while later submissions remain possible. Settlement
must include subsequently accepted receipts and cannot publish a completed
competitive result while either member can still add a valid bet. Acceptance
and close decisions use the same authoritative state and concurrency guards.
No zero-submission loss is assigned early.

Preserve the [automatic-weekly-results amendment](2026-09-14-automatic-weekly-finalization.md):
the whole week closes automatically only after all published-slate games have
final/void results, all cards have complete scores and all effective matchups
have results. Add the rolling-entry closure requirement; do not infer it from
temporary quote absence. A settled early card may say **Picks settled** while
the week remains open. This implementation uses the conservative weekly close
path, not a new early-final optimization.

There is no restored mandatory 24-hour provisional wait before weekly results
become final. The existing score-review period, append-only correction process
and downstream qualification/bracket/champion/archive publication gates remain.
Week 14's applicable rules govern qualification; Week 18 remains exhibition-only
and its protected pairings/results are not rewritten by later Week 17 corrections.

## Visual Bible 4.1 application amendment

Preserve Modern Fantasy Clubhouse, the approved B+A identity, existing navigation,
mobile layout discipline, focus behavior and accessibility requirements. Replace
whole-card sealing copy only where the applicable week uses 1.3. Keep legacy-week
submission and credit copy accurate to its own rules. Show **Games selected**
under the current-week visibility amendment even on a legacy week; that label
does not promise that more bets can be added.

Use concise member copy such as:

- **Submit bets** — “Submitted bets are final. You can add more before each game's kickoff.”
- **Credits available** — “Unused credits expire when the last eligible game starts.”
- **Games selected** — “Games appear when bets are submitted. Bet details reveal when each game starts.”
- **Picks settled** — “Your submitted picks have settled. Later games may still be open for more picks.” Use the second sentence only when it is true.
- **Credits expired** — “These credits were not used and do not count toward your score.”

If a remainder is below the 50-credit minimum, say that it cannot fund another
bet and will expire. Separate drafts, submitted bets, available credits,
unsettled original stakes and expired credits. Do not require another whole-card
seal. Preserve the recent text-only Won/Lost treatment and keep provider
implementation explanations out of ordinary member flows.

## Historical source reconciliation

The historical files retain their original text, dates and approvals. Entry,
allocation, participation and related submission-copy requirements are
superseded only for weeks that adopt 1.3. The named game-identity secrecy
requirements are also superseded for the current legacy week by the owner's
explicit visibility exception. This is a read-policy change, not a rewrite of
historical rule packages or competitive evidence.

| Historical source                                    | Superseded requirement (1.3; game visibility also current legacy weeks)                                                                   | Preserved authority                                                                                                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Product Bible V3 §§2, 4–6, 8 and 14                  | Mandatory full allocation, common decision horizon and blanket non-inference promise                                                      | Equal fresh opportunity, receipt permanence, scoring, private league and season history; read with Product Bible 3.1 All-play removal                        |
| Ruleset V1.1 §§5, 8–9, 11 and corresponding §17 text | Exact-1,000 whole-card seal, stranded-remainder rejection, common submission lock, game-identity secrecy and partial-card forfeits        | Numerical stake/market limits, returned-credit scoring, scope-safe postseason and historical rule attachment                                                 |
| Decision Register D-001 and related §6 directions    | One whole-card irreversible action for every applicable successor                                                                         | D-001 remains historical for old contracts; D-002 heavy-favorite package and D-003–D-006 scope remain; participation definition changes only as stated above |
| Integrated Roadmap 1.1 §§1.3, 5, 8, 10 and 17        | Mandatory whole-card ceremony and blanket pre-reveal game secrecy in affected acceptance criteria                                         | One bounded release, shared authoritative lifecycle, existing phase history and deferred social/measurement/market scope                                     |
| Visual Bible 4.1 §§9, 10.4, 11.6, 13, 15 and 18      | Exact completion, one card seal, generic-only future-game presentation and related labels                                                 | Identity, hierarchy, responsive/keyboard requirements, structural selection privacy and clear state copy                                                     |
| Architecture Revision 1.1 §§6–7, 10–11 and 13        | Immutable card as the acceptance unit, common-lock acceptance/attendance, complete-card-only quote review and partial-receipt prohibition | Transactional batch receipts, trusted clocks, membership/RLS, append-only scoring, idempotency and one Live/Simulation engine                                |

Read older season-wide freeze statements with the September 11
[future-week amendment](2026-09-11-governing-addendum.md). Read provisional-wait
statements with the September 14 automatic-finalization amendment. Read older
count/stake prohibitions with the September 14 outstanding-totals decision;
its timing remains in force. The September 13 opponent/commissioner indicators
retain their access scope with the new participation definition. The September
10 audit and prompt pack remain supporting historical evidence, not authority
to restore superseded requirements.

## Version compatibility and activation boundary

Prepare explicit Live/Simulation 1.3 packages identifying Product Bible 3.2.
Keep the active 1.2 catalog/default until a separate, approved activation.
Installing supporting code, applying a preparatory migration or recording this
decision does not activate the package.

Use the established per-week binding: a week adopts an approved supported
catalog release when it opens. Already-open and completed weeks retain their
existing snapshot, acceptance, credit, scoring and attendance behavior for every
member, even a member who has not submitted. The current-week game-identity
exception applies independently of that pin. Do not recalculate old receipts,
scores, attendance, standings,
qualification, brackets or history. Historical All-play remains only where its
original version requires it. Reject missing, mismatched or unsupported rules
without discarding drafts or denying authorized historical reads.

Activation and week opening must serialize so one week cannot receive mixed
rules. Document the first eligible unopened week for each intended season
before approval; do not infer eligibility from a calendar date alone. New
seasons and future owner rehearsals follow the activated catalog; existing
rehearsal weeks keep their bindings. Bots, checkpoints, reset, correction and
archive continue through the same authoritative lifecycle. Example Season
remains historical, read-only and separately labeled.

## Authorization and evidence

The owner authorized implementation, this governing amendment and publication
to the public repository `alexpfeffer4/sunday-ledger-matchups`. Their later
conditional release instruction authorizes merge, Production migration and
deployment, and explicit future-week catalog activation once required checks
pass and no release blocker remains. The release record must demonstrate that
condition; no additional approval is needed merely to repeat the approved scope.

The owner waived a paid hosted authenticated Preview. Required disposable
Supabase/Auth/browser/concurrency CI and the public Preview build, rendering and
backend-isolation checks remain. No paid plan, new hosted resource,
authentication-setting, email-setting or participant-messaging action is added.

The [rollout record](../rolling-submissions.md) distinguishes prepared behavior,
tests actually completed, Preview evidence and Production status. This document
records product authority; it is not evidence that the feature is deployed.
