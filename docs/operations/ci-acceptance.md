# Acceptance checks

The acceptance workflow runs the same behavior checks in independent jobs so a
pull request does not wait for database verification, desktop journeys and mobile
journeys to execute one after another. It does not change application behavior,
league policy, Production configuration or migration contents.

## Required verification contract

| Job group                    | Coverage                                                                                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quality                      | Identity assets, formatting, lint, strict types, all unit/property tests and production build through the unchanged `npm run verify` command                                            |
| Database                     | Every migration on a clean database, the complete pgTAP suite with its unchanged five-minute watchdog, disabled-scheduler assertions and generated authoritative signatures             |
| Native                       | All eight concurrency scripts, including season automation, quota, rolling submissions, card reset, player props/results, shared quotes and progressive publication                     |
| Full stack: desktop          | Progressive props and season automation, then all eight existing desktop spec files through real Auth, server actions, RSC and RPC                                                      |
| Full stack: mobile           | Progressive props and season automation, then email authentication and the five existing member spec files on mobile WebKit                                                             |
| Shared UI                    | Existing Phase 8/public/practice/navigation/identity/accessibility checks on desktop Chromium and WebKit, plus Phase 6 matchup and Phase 7 history checks on desktop, WebKit and mobile |
| Stage 1 preparation/baseline | Real worker PREPARE failure/retry, catalog, validation/opening, replay and representative desktop/mobile measurements for complete and pending menus on separate disposable stacks      |

`Acceptance complete` depends on every group and runs even after a failure. Its
checker requires explicit success for every dependency, including the full-stack
matrix result. A missing, failed, cancelled or skipped group fails the summary.
The existing full-stack report checker still requires every selected test to
execute with zero skips; its retry policy is unchanged. Matrix fail-fast is off
so a desktop failure does not cancel the mobile evidence, or vice versa.

The Stage 1 matrix additionally requires one selected preparation/baseline scenario
per menu state, zero skips and zero retries. Each retains 182 observations under
the declared device conditions. The database group verifies the exact preparation
repair body/privileges as well as existing shared-odds parity. See the
[Stage 1 status and retained baseline](simplification-stage1-status.md).

For merge review, require the complete workflow to pass on the current head.
If required status checks are configured later, use `Acceptance complete` as the
stable aggregate status. This change does not modify repository protection or
ruleset settings. The inspected main branch reported protection disabled and no
required contexts; no settings migration was necessary to replace legacy names.

The workflow runs on every pull request to its supported branches and can also
be dispatched manually. There are no path filters that could leave an expected
aggregate status pending. Selecting fewer suites for particular changes is
deferred; this consolidation preserves the complete verification contract.

## Isolation and setup

Each database-bearing job has its own GitHub-hosted runner, fresh Docker stack,
Auth service, mail capture, provider fixture files and local environment. The
shared setup action preserves the existing pinned Supabase CLI and service set.
It does not use hosted credentials, linked projects or paid provider calls.

Workers remain sequential inside each full-stack job. Tests that share singleton
source policy or fixture files must not run concurrently in the same stack.
Progressive browser tests run first on a clean database; the database is reset
before the historical-policy member journeys, and the entitled fixture owner is
provisioned again. Native automation fixtures are reset before legacy native
checks; progressive native publication retains its separate reset. The database
conformance job starts independently with no committed native/browser fixtures.

After either browser-lane database reset, the loopback-only readiness helper asks
PostgREST to reload configuration/schema and waits up to thirty seconds for its
service-role OpenAPI document to include the migrated preparation RPC. It does
not call that RPC or create a user to probe readiness. Missing schema/cache state
is retried; authorization errors fail immediately. This closes the observed race
between completed reset migrations and API schema-cache refresh.

Keep Node 24, lockfile-based `npm ci`, npm caching, SHA-pinned actions, current
browser projects, report validation, artifact retention, cleanup and cancellation
of superseded PR runs. Every full-stack job builds against its own disposable
Auth configuration; a build from another environment is not substituted.

## Consolidation and baseline

Baseline: main `fa183363cc760260e9363f870633fdf415430815` after PR #67.

- Phase 8A and Phase 8B database workflows ran the same composite action. Their
  full pgTAP coverage now executes once in the Database job.
- Phase 8A and Phase 8B standalone browser checks already existed in the shared
  browser job. Their repeated verification and setup are removed.
- Phase 6 and Phase 7 retain every unique spec/project combination in Shared UI;
  their separate workflows are removed.
- The old Phase 8C serial quality/database/full-stack job becomes the independent
  Quality, Database, Native and desktop/mobile full-stack groups above.

A comparison of expanded old/new commands preserved all **40 unique browser
spec/project combinations**, all **eight native concurrency scripts**, the exact
quality command, pgTAP runner, scheduler assertions, signature check and setup.
No existing assertion or test file is deleted or weakened. New unit tests cover
the aggregate check's rejection of incomplete or unsuccessful evidence.

Recent successful baseline main acceptance jobs:

| Run                                                                                            | Serial job duration |
| ---------------------------------------------------------------------------------------------- | ------------------- |
| [35103308743](https://github.com/alexpfeffer4/sunday-ledger-matchups/actions/runs/35103308743) | 19m39s              |
| [35066317449](https://github.com/alexpfeffer4/sunday-ledger-matchups/actions/runs/35066317449) | 23m13s              |
| [35107352906](https://github.com/alexpfeffer4/sunday-ledger-matchups/actions/runs/35107352906) | 24m36s              |

Compare the PR's time from run creation to the final aggregate result, not the
sum of job durations. Queue time and runner speed vary. Record measured results
in the PR; halving the old wait is a target, not a release guarantee. Removing
parallel duplicate jobs alone does not shorten the previous serial critical path.

## Rollback

Revert the CI consolidation commit to restore the previous workflows and shared
database action. No Production database rollback, application deployment or
season policy change is required.
