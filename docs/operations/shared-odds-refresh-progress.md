# Shared odds refresh — implementation progress

Scope: September 16 Version 1.0, Section 12. One integrator, integrated PR #69.
Production migration/deployment/limits/activation remain pending exact approval.

- Entry main: `82a65f48c2e4ed52f441e4ab5a0a3c83c2b10c00`
  (CI #68). Live migration/account verification is recorded privately.
- Existing standing season consent, schedule readiness, opened Week 2 and all
  accepted bets preserved. No Production writes or paid provider fetches performed.
- Implemented dormant shared worker, common application authority, independent
  fanout, purpose budgets/daily forecast, protected dispatcher and stored reads.
  Timestamp-only snapshots preserve draft consent; changed terms require review.
- Integrated PR: https://github.com/alexpfeffer4/sunday-ledger-matchups/pull/69.
  First Preview READY; connected fixture route returned 200. Browser protection
  requires Vercel sign-in; fixture does not prove hosted Auth or write Production.
- First candidate: quality/build and native races passed; new Auth test assertion
  fixed. The complete pgTAP suite hit its retained five-minute ceiling. Second
  candidate moves rollback-heavy scale fixture last, retaining all assertions.
- Second candidate `3b61d4e30b1eac35ae2dfedf94467eab54bae54d`: new real Auth
  desktop/mobile dispatcher → worker → stored update → explicit submission passed.
  Native races, complete pgTAP and generated types passed. Existing controlled
  journey expected a hash-only warning; its fixture now checks no warning and
  then changes economic odds to exercise acknowledgment. Final head includes release
  scripts, checked function hashes, deterministic forecast and governance update.
- Focused embedded PostgreSQL assertions pass: 20 leagues / 40 applications /
  one three-credit MAIN fetch; withdrawal, fixed players, accepted receipt bytes,
  budget/calendar/provider boundaries and disable. Native CI remains required.
- The dated account measurements, live scope and actual remaining-cycle forecast
  are retained in the private rollout record. Public fixtures verify the model.
- Complete reviewed procedures: [release/disable/observation package](shared-odds-refresh.md).
  Remaining: final native/Auth checks, current-main recheck, final PR status and
  private dated rollout record. No live scheduled cycle is claimed.

Final UI inspection found snapshot-keyed outcome buttons could lose focus during
passive updates. Outcome controls now retain stable side identity while their
selection callback uses the current snapshot, with real desktop/mobile focus
assertions. The subsequent final candidate must pass the complete Acceptance gate.

Candidate `2da828072888dc8e0767b101d61d01227c6f6c00` passed all seven required
jobs in Acceptance run 261. After the owner authorized merging, automated review
identified a stale buffered response crossing final review. The follow-up discards
responses from before a pause and re-reads stored quotes, with regression coverage
for responses arriving during and after review. The optional read route also stops
quietly before its database capability is installed, allowing the authorized app
merge/deployment while database installation and activation remain pending.
The follow-up head must pass the same complete Acceptance gate before merge.
