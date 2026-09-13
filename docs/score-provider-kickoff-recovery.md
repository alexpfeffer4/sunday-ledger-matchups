# Score-provider kickoff recovery — September 13, 2026

The owner's live score-refresh failure was reproduced through the normal
commissioner action. Safe diagnostics returned `EVENT_IDENTITY_CHANGED`. After
PR #42 deployed, the 18:32 UTC request showed identical provider event IDs and
home/away teams, but the published 17:00 UTC kickoff had become 17:03:55,
17:03:58, 17:04:05 and 17:04:40 in the provider response. Exact kickoff equality
therefore rejected the entire week batch before any start could be confirmed.

The score importer now treats a later provider kickoff as timing evidence for
the same published game. It retains exact event ID, sport, source and team
checks. The reported time must be finite, at or after the published kickoff,
and before its existing 48-hour postponement boundary. Earlier times or times
outside that window still require operator review. This conservative bound
does not introduce an automatic postponement or void decision.

Both team scores and a provider update at or after both kickoff times are still
required to confirm play. The update must be no later than its fetch, and stale
evidence cannot regress accepted state. A changed time without scores never
reveals picks. Only a provider-confirmed final reaches the existing settlement
engine. The original provider payload remains private and unaltered.

This corrects the score-import compatibility bug reported by the owner. It
does not move the published kickoff or common deadline, modify accepted picks,
change frozen card/scoring rules, add automatic locking or finalization, change
the request budget or cadence, or widen commissioner receipt access. The
existing scheduled checkpoints and postponement clock stay anchored to the
published time. Quote refresh and card acceptance retain their existing guards.

Regression coverage exercises delayed kickoff with and without score evidence,
the provider-update time boundary, unknown IDs, changed teams, earlier/48-hour/
missing kickoff rejection, unchanged published times and receipts, server-role
completion, and final settlement. The full existing database suite remains the
gate before applying the additive migration. Live recovery is verified through
one normal budgeted refresh after deployment, without manual result edits.

Provider reference: [The Odds API scores documentation](https://the-odds-api.com/liveapi/guides/v4/#get-scores)
documents shared event IDs between odds and score responses. The exact timing
mismatch above is observed production evidence, not an assumption from that
documentation.
