# Closed-game quote refresh repair

A shared MAIN odds response may still contain a game whose entry cutoff has
passed. A later provider kickoff for that game previously raised
`EVENT_IDENTITY_CHANGED` before the existing closed-game skip, aborting the whole
member refresh, including unrelated open picks.

The additive migration moves the existing `event_accepts_entries` check before
provider identity validation inside `private.apply_shared_quote_events`. Closed
games receive no new snapshots or quote proof. Open games retain exact event
identity and kickoff validation, source freshness, and all existing review and
submission checks. No event time, cutoff, receipt, rule, provider policy, or
permission is changed. The same function serves member and background application.

The migration requires the previously tracked function hash and verifies the
replacement hash. The shared-refresh parity gate tracks the new definition;
previous migration files are unchanged.

`closed_game_quote_refresh.test.sql` uses disposable fixtures to cover a bulk
response crossing a cutoff with a two-minute kickoff discrepancy, mixed game and
player-prop review and explicit acceptance, unchanged closed-game heads and
receipts, background skipping, and rejection of open-game identity changes,
stale source evidence, cross-member plans, and closed-game review.

Release through the existing full Acceptance gate. Apply only this additive
migration to Production, verify the function hash and migration ledger, and merge
the tested tree. The hosted migration tool assigns its own version; align the
repository filename with that ledger while preserving the tested SQL bytes.
No provider request or live card submission is needed for installation. The owner
retries through the normal member flow after release.
