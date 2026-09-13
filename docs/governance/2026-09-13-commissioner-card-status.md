# Commissioner card status — September 13, 2026

The owner requested a commissioner-only sealed total and member-by-member
Sealed / Not sealed list, then approved it with “Add that commissioner only thing.”

This extends the September 13 opponent-status decision only for the current
league commissioner's current-week roster view. It supersedes the earlier
sentence limiting the commissioner to their scheduled opponent's status.

- The database verifies current commissioner membership on every read. Ordinary
  members, outsiders, former commissioners and anonymous callers receive no roster status.
- Sealed means the full allocation has accepted receipts. Pending compliance,
  local drafts, failed submissions and partial accepted allocations are not a seal.
- Return only roster identity and a nullable submission flag. Missing card state
  is Status unavailable. Picks, stakes, odds, draft activity, receipt identifiers
  and acceptance timestamps remain private under the existing reveal rules.
- Use a separate commissioner-page query; member projections and payloads do not
  gain this roster list. Private owner rehearsal retains its existing guide.
- No deadline, automatic week lock, scoring, settlement, provider cadence,
  accepted receipt, frozen rule or historical record changes are authorized by
  this presentation-access decision.

The same change corrects score-refresh feedback that was incorrectly passed
through a generic error sanitizer. Operational failures must be distinguished
from a check already in progress, no eligible games, and successful captures.
