# Shared odds refresh — implementation progress

Scope: September 16 Version 1.0, Section 12. One integrator, integrated PR #69.
Production migration/deployment/limits/activation remain pending exact approval.

- Entry main and deployed READY commit: `82a65f48c2e4ed52f441e4ab5a0a3c83c2b10c00`
  (CI #68); no overlapping open PR. Hosted migrations end at `20260916141355`.
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
- Forecast from actual stored schedule: 5,312 credits through October 2 reset,
  peak 984/day, before retries/reuse. Full target cadence fits dated remaining
  balance 19,818 with 2,400 essential and 2,000 provider floor protected.
- Complete reviewed procedures: [release/disable/observation package](shared-odds-refresh.md).
  Remaining: final native/Auth checks, current-main recheck, final PR status and
  private dated rollout record. No live scheduled cycle is claimed.
