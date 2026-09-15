# Paired matchup lineups

Owner-approved presentation amendment, 2026-09-14. Implements the reviewed desktop/mobile matchup direction on top of the deployed rolling-submission release (#48).

## Behavior

- Two persistent member lanes share full-width NFL game headings. Both sides read left to right. Games use kickoff order with event ID as the tie-break; settlement never reorders them. Revealed markets align moneyline, spread, then total.
- Every accepted owner bet remains on the owner's side. Public selected-game projections supply one neutral opponent placeholder per upcoming game. No hidden market, receipt count, stake, or odds is reconstructed. Scheduled kickoff alone never reveals an opponent bet. Legacy payloads without game visibility retain the generic sealed notice.
- Hidden game selections use a lock, a bold “Bet placed” label, and a tinted lane to distinguish them from quiet “No bet” empty states. The label confirms presence only, never a bet count; legacy unknown selections say “Picks hidden” instead.
- Weekly score, outstanding count/original stakes, and owner-only unused credits have distinct labels. Scores and official outcomes still come from the existing authorized query. Null remains unavailable; a confirmed zero remains zero. Scoring explanation and remaining-return detail are disclosures.
- The full scoreboard stays in normal document flow. Once its score rows scroll out of view, a separate compact names-and-scores bar fades in below the measured league header without changing document height or moving bets. The visual summary is hidden from assistive technology to avoid duplicate announcements; the original controls and live region remain available. Reduced-motion users get no animated transition, and short/tall-summary viewports use normal flow. Completed games can be collapsed for both sides together, with per-game returns still visible. Stable event keys retain the user's choice through an RSC refresh; a full reload starts expanded.
- A compact owner action uses existing card deadlines, eligibility, credits and drafts. It links to picks only when eligible. Drafts do not submit automatically. Final results retain existing record, standings, correction and next-opponent facts.
- The matchup selector browses authorized pairings. The September 15 [historical browsing amendment](historical-matchup-browsing.md) adds completed-week lineups using the historical authorized reads, with links from Schedule and History. Planned weeks are not offered as completed results.
- A conditional lead-change sentence is shown only for one fully disclosed outstanding bet, known totals, closed submission possibilities, valid card status, no hidden future picks and no official result. It uses accepted odds and the existing integer return calculator. It describes one scenario, not a win probability or a required/exhaustive path. Complex or uncertain paths omit it.
- Normal freshness stays quiet. Genuine delayed-result messages remain visible with the last confirmed score. League scoreboard detail is available below the lineup, leaving the main width for comparison.

## Boundaries

This is presentation work. No migrations, permission changes, provider calls, receipt edits, scoring changes or ruleset activation. Pilot Week 1 stays on its opened Rules 1.2 contract; future unopened rolling weeks keep the Rules 1.3 contract. Current-week game identity visibility, confirmed-start reveal and the common-lock aggregate window remain as released in #48.

## Verification

Repository quality gates plus unit coverage for side assignment, stable chronology, market alignment, hidden placeholders, 20-versus-one cards, owner-only balance display, collapse across refresh and bounded scenario suppression. Browser acceptance checks 1440px, 390px and 320px at normal/200% text, semantic accessibility and lane alignment. The disposable authenticated rolling journey exercises real RSC data, owner/opponent privacy, collapse and the compact sticky header on desktop and mobile. Existing database and full-stack release gates remain required.
