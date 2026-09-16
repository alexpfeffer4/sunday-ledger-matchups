# Shared odds refresh — implementation progress

Scope: September 16 Version 1.0 handoff, Section 12. One integrated branch/PR,
isolated verification and Preview authorized. Production remains read-only until
the exact completed release package is approved. No competitive rule changes.

- Baseline main: `82a65f48c2e4ed52f441e4ab5a0a3c83c2b10c00` (CI PR #68).
- No open overlapping PRs at entry. Production READY at that same commit.
- Hosted migrations end at `20260916141355_season_automation_schedule_alias`;
  the standing-policy migration is already installed. Preserve both.
- Read-only 15:28 UTC: existing automation enabled, consent retained and schedule
  ready. Application usage 112/day and 276/month; caps 1,000/day and 5,000/month;
  protected core 350/day and 2,000/month. Provider balance 19,840, entitlement
  20,000, recorded reset October 2 at 00:00 UTC. These are dated observations.
- Existing shared requests/coverage already deduplicate public fetches. Application
  is currently member-plan scoped. Discovery shares this cache and remains the
  only authority for first player publication.
- Implementing: service-safe event application, purpose budgets and scheduled
  coverage; protected worker/dispatcher; passive stored reads and draft consent.
- Required verification: focused SQL/native/browser proofs plus all existing
  Acceptance jobs. Local native services are absent; use the disposable CI lane.
- Not yet complete: implementation, checks, PR, Preview, exact forecast/release.
