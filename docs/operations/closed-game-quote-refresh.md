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

Production installation succeeded as `20260918002951` after candidate
`535b6f36c885c5b5da1ad44d8294957651a248db` passed all 2,487 database assertions
across 60 files, function parity, generated types, native concurrency, and the
shared-quote desktop/mobile journeys in Acceptance run `35290928158`.
The filename now matches the hosted ledger; the tested SQL bytes are unchanged.
The installed function hash is
`bd5817e0247c85f341a766cb51a706593e300777759b31fdeda508a5537a11dd`.
Its privileges, security mode, and empty search path remain unchanged. Full
Acceptance on the aligned PR head remains the merge gate.
