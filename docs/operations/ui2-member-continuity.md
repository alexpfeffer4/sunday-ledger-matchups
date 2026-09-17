# UI-2 — member continuity and card clarity

Prepared under the September 17 Version 1.0 workflow/UI handoff. UI-3 and
Production release are excluded until separately approved. This is a scope and
rollout record; the PR and final status carry exact verification results.

## Verified baseline

UI-1 PR #74 is merged at `a55d3beaa81587a15119085362286e7b9fce785d`.
Fresh origin/main and Vercel inspection match that SHA. Production deployment
`dpl_4awYSyNn8AwM2RqyDH8966SxsXR2` is READY with both public aliases.
The existing signed-in Make picks screen was inspected read-only. No Production
submission, setting, provider acquisition, worker trigger or database write ran.

The September 16 audit is dated evidence. F05 filter/week resets, F06 desktop
League grouping and historical/current ambiguity, F07 ignored league-list errors,
and F10 mixed draft/accepted-credit wording remained in current main. The existing
F11 review/recovery path already has checking feedback, draft retention and the
PR #73 reconciliation helper; it is retained without another quote-merge path.

## Changes and boundaries

- Make picks saves only allowlisted day and game/player choices to the URL and
  tab session. Saved choices are keyed by authorized owner, league and week.
  Schedule uses authorized owner/league/season/current-week scope (separate
  archived scope), and validates against the published available weeks.
- Explicit valid query choices win, then valid saved choices, then defaults.
  Invalid explicit values fall back visibly rather than silently adopting saved
  intent. Initial normalization replaces the current history entry; deliberate
  selections add one entry. Back/forward restores those explicit entries. No
  keystroke, render or provider poll creates history entries. Signing out clears
  browsing preferences only. Storage denial leaves URL navigation usable.
- Filter/week selection keeps the mounted list and selector focus; native
  history avoids a page reload for these local choices. Cross-route navigation
  retains the existing route-heading focus. No new scroll framework or custom
  cross-route scroll restoration is introduced.
- Desktop and mobile primary navigation both say League and keep the group
  active throughout its existing secondary destinations. Matchup week/pair
  selectors retain their existing navigation behavior. Historical matchups
  remain read-only and label current-week card/picks links explicitly; shell
  current-week context is labeled separately.
- Returned league-list errors now reach the existing branded retry boundary,
  using allowlisted diagnostics. Genuine empty membership remains an empty
  state. Existing authentication and membership queries are unchanged.
- Owner summaries distinguish accepted credits, unsubmitted drafts and credits
  left to allocate. Remaining server credits minus local draft allocation is a
  planning amount, not a reservation. Closed-week expired credits remain the
  server's unspent amount. Returns do not replenish allocation. Partly accepted
  cards can still offer Add another bet under the existing eligibility checks.
  Legacy full-card sealing and exact receipt terms remain bound to their rules.

Private draft keys and data, explicit Review/Submit, changed-term acknowledgment,
idempotency, per-game deadlines, hidden picks, accepted terms and result history
are unchanged. No migration, Auth/configuration step, provider budget change,
polling increase or season-consent change is needed. PR #71–73 narrower reads,
independent requests, reconciliation, diagnostics and formatter reuse remain.
UI-1's first-result authority decision (F03 partial) stays deferred.

## Verification and Preview

The `/preview/member/slate`, `/card` and `/schedule` routes under
`/preview/member/` use shared UI with fictional data and no submission/provider
actions. They are disabled in Production. They demonstrate presentation and
browsing only, not authenticated acceptance or backend isolation for other
hosted Preview routes. Sample draft data uses an isolated fixture key.

The repository's full Acceptance remains required. New focused unit checks cover
scope/precedence/storage failures and private draft continuity. Shared Chromium
and WebKit journeys cover round trips, actual browser history, reloads, invalid
queries, selector/route focus and 1440/390px plus 320px at 200% text.
Existing real Auth/player-props journeys now check actual member round trips;
the controlled-league journey checks Schedule reload, historical/current links
and a forced league-list failure/retry. Its temporary view grant change is
guarded by the existing loopback-only fixture and restored in finally.
Deep review/changed-term/cutoff/receipt/RLS/season gates remain in the same CI.

Before/after action comparison: the reproduced filter round trip used to require
two repeated filter selections; restoring both saves those two selections.
Schedule reload no longer requires reselecting the viewed week. These are action
counts, not elapsed-time or Production speed claims. Physical iPhone/Android,
virtual-keyboard behavior, assistive technology and owner-arranged comprehension
observation remain separate from browser emulation and automated checks.

## Release and recovery

After required checks pass and the owner approves this identified release:

1. Confirm current main, reviewed head and exact candidate Acceptance results.
2. Merge the verified PR through the normal process; let the existing Vercel
   integration deploy main. No database/configuration operation is required.
3. Confirm READY Production at the merge SHA and both aliases. Check natural
   member navigation and error logs read-only; never manufacture live bets.
4. Update the reusable UI-2 status with the actual release outcome for UI-3.

For an application regression, restore the UI-1 deployment above or release a
reviewed UI-2 revert. Preserve installed migrations, receipts, drafts, results,
consent and provider counters. Recovery execution needs release authority.
