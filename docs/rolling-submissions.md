# Rolling submissions — implementation and rollout

Updated September 14, 2026. **PR #48 revision R2 passed all six workflows,
including native database, concurrency and real Auth/submission browser checks.
Public Preview checks passed. The three Production support migrations were
applied and verified while retaining the 1.2 catalogs. The final release
revision, merge, Production application deployment and explicit 1.3 activation
remain pending as recorded below.**

The [governing amendment](governance/2026-09-14-rolling-submissions.md) records
the owner's approved behavior and reconciliation with all six historical
sources. This note tracks implementation and evidence; it does not authorize
Production mutation or claim completed checks.

## Member-facing outcome

Starting with the next unopened week that adopts 1.3, members can submit one or
several bets, leave, and add more before each game's
kickoff. Submitted terms are permanent. A partial card scores normally; unused
credits expire for zero return after the final eligible submission deadline.
Only zero submitted bets creates a missed week.

Game visibility takes effect in the current week, including a week pinned to
1.2: a selected game appears to league members after a successful submission,
including an existing legacy whole-card seal. Actual bet details remain hidden
until that game's authorized reveal. Whole-card outstanding counts/stakes retain
their separate former-common-lock visibility time. The new available/expired
credit fields remain specific to 1.3 weeks.

For the pilot, the intended split is **Week 1: game visibility; Week 2: rolling
submissions and unused-credit expiry**. Week 1 retains its pinned submission
deadline, full-allocation requirement, scoring and attendance treatment. Do not
repin or reopen it. Recheck that Week 2 is still unopened before activation.

## Release baseline

| Item                    | Read-only baseline supplied to this implementation                                                                                                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository              | `alexpfeffer4/sunday-ledger-matchups`                                                                                                                                                                                                           |
| Main / Production       | `3750e3063de695ab2820113d5e7edf776348c1f7` through [PR #47](https://github.com/alexpfeffer4/sunday-ledger-matchups/pull/47)                                                                                                                     |
| Production deployment   | [dpl_8fcajteduBXFsaccaXdMJrw7j4gD](https://vercel.com/pfeffer/sunday-ledger-matchups/8fcajteduBXFsaccaXdMJrw7j4gD), READY; canonical ledgerleagues.com / www.ledgerleagues.com aliases; read-only check September 14 at approximately 17:19 UTC |
| Hosted migration ledger | 53 migrations through `20260914152407_automatic_weekly_finalization.sql`; this is the starting inventory, not a new migration claim                                                                                                             |
| Current active rules    | 1.2 / Product Bible 3.1, with historical week compatibility and later approved operational/privacy amendments                                                                                                                                   |
| Prepared new rules      | 1.3 / Product Bible 3.2 for Live and authoritative Simulation                                                                                                                                                                                   |
| Activation              | Not performed; default/catalog remains 1.2                                                                                                                                                                                                      |

Baseline metadata does not prove the new feature, an authenticated Preview
journey, physical iPhone behavior or a real provider cycle. Refresh this table
with final release evidence rather than promoting a pending item to verified.

## Implementation boundaries

The shared acceptance path must validate the entire new batch and previously
accepted weekly stakes in one transaction. Retries recover the original receipt
set, and a conflicting request cannot reuse the same idempotency identity.
Accepted bets cannot be topped up or edited; a 1–49-credit remainder is allowed.

Scheduled kickoff closes each game's entry independently. Reliable earlier play
can close it sooner; a delayed LIVE report or later provider kickoff cannot
reopen it. Quote freshness continues through later games under the existing
quota and review policy. No return replenishes weekly spending capacity.

Database/server projections publish distinct accepted game identities across
supported versions, including the current legacy week, and only the separately
authorized aggregates. This permission takes effect with the supporting
visibility migration and application release; it does not wait for catalog
activation. Private selections, draft activity and
receipt details remain behind the current reveal/access gates. The same paths
serve own and browsed league matchups, with owner-rehearsal containment intact.

Partial cards participate normally; zero participation is determined only at
the final published cutoff. Weekly automatic finalization retains the
all-published-games gate and adds the rolling-entry guard. Downstream
qualification, bracket, champion and archive publications still respect score
review. Legacy weeks use their historical acceptance and attendance contract.

## Applied support migrations and pending activation

| Deliverable                                        | Status                                                                                                                                                                            |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260914184154_rolling_submission_contract.sql`   | Applied to Production September 14 at 18:41 UTC; exact reviewed SQL unchanged; catalog activation not performed                                                                   |
| `20260914184209_rolling_submission_lifecycle.sql`  | Applied to Production September 14 at 18:42 UTC; native lifecycle and full-season rehearsal checks passed                                                                         |
| `20260914184223_rolling_submission_visibility.sql` | Applied to Production September 14 at 18:42 UTC; current legacy and rolling visibility/privacy regressions passed                                                                 |
| Explicit catalog activation                        | Pending compatible Production application deployment and final release checks; [operator SQL and safeguards](../scripts/rolling-submissions/README.md) prepared and verified      |
| First eligible week                                | Pilot Week 1 retained its 1.2 binding and Week 2 remained the next unopened week at the 18:42:58 UTC post-migration preflight; refresh before activation                          |
| Week-opening/activation serialization              | Catalog row locks match existing week-pinning `FOR SHARE`; independent review, operator-script activation proof and all four native separate-session concurrency scenarios passed |

The hosted migration tool assigned the filenames above. Their SQL is byte-for-byte
the reviewed support SQL; the final repository revision must align these filenames
with the hosted ledger. Applied historical SQL must not be rewritten or reapplied
under a second identity.

The 18:42:58 UTC post-migration preflight passed. Aggregate hashes of opened-week
bindings, snapshots, accepted receipts, settlements and results were identical
before and after the support migrations. Both active catalogs remained 1.2.
This verifies the preparatory database release; it does not establish Production
application deployment or 1.3 activation.

A read-only Production smoke check covered six current-week card projections.
Their distinct selected games matched accepted receipt event identities, and
each game exposed only `eventId`, `eventLabel` and `scheduledStartAt`. Legacy
projections contained only `submitted` and `selectedGames`, without 1.3 budget
fields. All six cards belonged to the unchanged legacy week; rolling submissions remained disabled. No member
identity, receipt terms or private league identifier is included in this record.

The catalog contains one active row per mode. Activation is global for LIVE
and SIMULATION: it affects new seasons and each existing season's next unopened
week, including active owner rehearsals. It is not a pilot-only toggle.

At the read-only September 14 17:36 UTC observation, the pilot's Week 1 remained
LOCKED on 1.2 and its first eligible week for entry/credit changes was Week 2.
The later owner instruction separately includes Week 1 in the game-visibility
release. Two Live draft seasons
could first adopt 1.3 at Week 1. Active Simulation/rehearsal candidates were
Weeks 1 and 6. Two reset rehearsals are retired and must not reopen. Real private
league identifiers and full operator inventory are intentionally excluded from
this public repository; the metadata-only inventory script returns them in the
authorized operator session. These observations expire if another week opens.

The activation script defaults to a dry run that updates no rows. Explicit
application requires the verified deployed SHA, a recorded release approval and
the exact fresh inventory hash. It validates all three support layers, package
hashes and private permissions, then updates only the two catalog rows. It never
updates an existing snapshot, week, receipt or result.

## Verification record

| Gate                                                                       | Status / evidence                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Batch acceptance, budget races, replay and immutable receipts              | 42 rolling submission assertions passed; immutable and revoked-access retry cases covered. Native concurrency script prepared; all four native separate-session scenarios passed in PR #48 CI                                                                |
| Kickoff boundaries, current/changed quotes and later-game refresh          | 18 rolling Live quote assertions passed, including late-only events, incomplete-market rejection, quota preservation and draft compatibility                                                                                                                 |
| Immediate game identity and selection/aggregate privacy matrix             | 59 rolling and 40 new legacy visibility assertions passed, plus existing authorization regressions; authorized members see game identities without actual details or new legacy budget fields. Six Production card projections passed read-only smoke checks |
| Partial/zero participation, correction and finalization races              | 54 rolling lifecycle assertions passed. Native acceptance/settlement race passed in PR #48 CI                                                                                                                                                                |
| Future-week activation and legacy-week regression                          | Exact operator scripts passed isolated embedded PostgreSQL: dry run, stale-inventory refusal, atomic activation, immutable old evidence, repeat no-op, real rehearsal 1.2 Week 1 → 1.3 Week 2; native Supabase migration/pgTAP CI passed                     |
| Authoritative full-season Simulation/rehearsal through Week 18 and archive | Passed all 18 weeks with partial participants, incremental bots, zero-submission lessons, postseason, corrections and archive                                                                                                                                |
| Mobile/browser core submission journey and WebKit coverage                 | R2 real Auth/UI/RPC: desktop 14, mobile Auth 8 and mobile member 2 passed with zero failures, skips or retries. Shared-browser checks: Chromium 62 passed; WebKit 61 passed with one existing forced-colors skip. Six screenshots inspected                  |
| Required local checks, generated types, CI and build                       | npm run verify passed: identity assets, Prettier, ESLint, strict TypeScript, 527 tests in 85 files and Production build. All six R2 workflows green, including native generated types and full-stack Auth/browser submission                                 |
| Independent integrity/privacy/lifecycle review                             | Independent review completed; fixed revoked-access replay and strengthened per-game quote completeness. Native Supabase CI passed 35 suites and 1,294 assertions, including current-week visibility; all four native concurrency scenarios passed            |
| Public Preview                                                             | R2 deployment READY; Home rechecked on R2. Home, Rules, Trust and sign-in rendered in the Preview verification sequence; Rules, Trust and sign-in checks were on the initial deployment. Backend-isolation guard checks passed                               |
| Hosted authenticated Preview                                               | Waived by owner on September 14 to avoid a paid plan. Required disposable Supabase/Auth/browser/concurrency CI passed on R2                                                                                                                                  |
| Physical iPhone and screen-reader evidence                                 | Not observed in this implementation                                                                                                                                                                                                                          |
| Production rollout                                                         | Conditional release clearance recorded for R2 checks; three support migrations applied and verified with catalogs still 1.2. Final revision, merge, Production app deployment and activation remain pending                                                  |

These results belong to R2 commit
[`e3b441ed761fa4cf1cac3e35c406f164fe5041a3`](https://github.com/alexpfeffer4/sunday-ledger-matchups/commit/e3b441ed761fa4cf1cac3e35c406f164fe5041a3),
tree `be171b26fc74d4f98cd442be0fdfa0c40f68d58e`. All six workflows were green;
the full-stack browser evidence is recorded in
[Phase 8C run 34881119508](https://github.com/alexpfeffer4/sunday-ledger-matchups/actions/runs/34881119508).
The initial desktop wording failures were corrected and the complete R2 desktop
and mobile journeys passed. Migration filename alignment and this release record
still require a final revision; do not represent R2's status as that future
revision's completed checks.

Browser emulation
does not establish a physical-device result, and synthetic fixtures do not
establish production provider latency or a real weekly pilot.

## Verification environment decision — September 14 update

The owner asked to skip the paid hosted test database and proceed. The release
used the existing disposable Supabase CI stack for real PostgreSQL,
authentication, RLS/RPC, desktop/mobile submission and native multi-session
concurrency verification. Those gates passed on R2 before support-migration
release clearance. The
embedded PostgreSQL results alone do not substitute for them.

Authenticated hosted Preview verification is waived to avoid new spending.
The [R2 Vercel Preview](https://sunday-ledger-matchups-qowkgb5vd-pfeffer.vercel.app)
is READY, and its Home page was rechecked. Home, Rules, Trust and sign-in rendered
without observed application console errors in the initial Preview checks.
Backend-isolation guard checks passed. These public-page checks do not prove
authenticated submission; that evidence comes from the passing disposable
full-stack CI lane.

The Preview guard remains: an explicitly separate `PREVIEW_SUPABASE_REF` and
matching public URL are required for a Preview backend; Production is refused.
No hosted test resource or paid upgrade has been created.

Billing correction: the organization is on Free, and Supabase's official pricing
excludes branching from that plan. The earlier $0.01344/hour quote was the branch
compute rate only; it omitted the required paid subscription (Pro starts at
$25/month) and possible other usage. The prior under-$1 proposal is withdrawn.
See [Supabase pricing](https://supabase.com/pricing) and
[branch billing](https://supabase.com/docs/guides/platform/manage-your-usage/branching).

## Production sequence — conditional release authorization

1. **Completed for R2:** reviewed PR, required full-stack CI, public Preview
   checks, independent review and prepared activation artifact. All six workflows
   passed. Record the final revision and its required checks after aligning
   migration filenames and release evidence.
2. **Release clearance recorded:** R2 satisfied the owner's conditional checks
   for applying the reviewed support migrations. The verified boundary preserves
   current Week 1 betting/credit rules and targets unopened Week 2 for rolling
   entry/credits. No repeated approval is required for this approved scope.
3. **Completed at 18:41–18:42 UTC:** applied the three support migrations in order
   while retaining both 1.2 catalogs. The 18:42:58 UTC preflight and unchanged
   competitive-evidence hashes passed. The visibility migration permits
   current-week game identities independently of catalog activation.
4. **Pending:** complete and check the final revision, merge the reviewed PR and
   verify the normal Production deployment and domain aliases. Confirm deployed
   code supports legacy weeks and prepared 1.3 before activation.
5. **Pending:** refresh the private adoption inventory, then run the reviewed
   activation serialized against week opening. Verify catalog version/hash and
   the resulting adoption boundary. Do not open a real week or submit a real bet
   merely to create smoke-test evidence.
6. **Pending application release:** verify current-week accepted game lists through authorized read paths, while
   preserving detailed selections until their existing reveal gate. Verify the
   actual week-rule identity when the next eligible week opens. Record both
   effective dates and the completed release.

The [operator SQL instructions](../scripts/rolling-submissions/README.md) supply
the exact metadata, readiness and transactional activation files. Preserve the
passing R2 evidence and verify the final revision before merge. Never point
Preview at Production to substitute for the disposable test environment.

## Recovery boundaries

Before activation, keep the catalog on 1.2 and preserve compatible additive
schema support. Confirm any application rollback still understands the installed
read/command contracts. The current-week game-identity permission is already a
separate database read-policy change; an application rollback does not undo it
or make an already-disclosed game identity secret again.

After activation, a new draft season may already reference 1.3 before any week
opens. There is no unreviewed inverse catalog update. After a 1.3 week opens,
preserve its pinned rules even if it has no receipts yet.
After any 1.3 submission, preserve every accepted term, original stake and
receipt. An old-code rollback that treats the week as a whole-card/common-lock
week is unsafe. Repair forward using compatible code and a reviewed migration;
do not relabel or reopen an active week, delete receipts, recycle credits or
retroactively recalculate standings. Any change to future catalog activation
requires its own supported transition and cannot rewrite an active week.

## Completion fields

- Verified R2 commit: `e3b441ed761fa4cf1cac3e35c406f164fe5041a3`; tree `be171b26fc74d4f98cd442be0fdfa0c40f68d58e`; all six workflows green. Final migration-filename/evidence revision pending.
- PR: [#48](https://github.com/alexpfeffer4/sunday-ledger-matchups/pull/48), published under the owner's explicit public-repository authorization.
- Public Preview: [R2 deployment](https://sunday-ledger-matchups-qowkgb5vd-pfeffer.vercel.app), READY at the verified R2 commit; Home rechecked. Initial Preview covered Home, Rules, Trust and sign-in without observed application console errors. Preview backend guard passed its rejection tests. Paid hosted authenticated Preview waived by owner.
- Test/review evidence: 527 tests in 85 files; native PostgreSQL 35 suites and 1,294 assertions; four separate-session concurrency scenarios; desktop 14, mobile Auth 8 and mobile member 2 all passed with zero failures, skips or retries. Shared-browser Chromium 62 and WebKit 61 passed; one existing WebKit forced-colors skip. Six screenshots inspected.
- Production support migrations: all three applied at 18:41–18:42 UTC using the hosted filenames above and unchanged reviewed SQL; 18:42:58 UTC preflight passed with competitive-evidence aggregate hashes unchanged. Catalogs remain 1.2.
- First eligible unopened week: pilot Week 2 reconfirmed after support migrations; fresh private inventory required at activation.
- Remaining before merge: finish migration filename alignment and evidence revision, and record its required checks. R2's previous Auth/browser failures are resolved.
- Owner's conditional release clearance: R2 satisfied the required verification for the completed support-migration step. Final revision, merge, Production application deployment and explicit catalog activation are pending; this record does not claim the complete release is finished.

## Publication authorization — September 14 update

The connected GitHub account was verified as the owner of
`alexpfeffer4/sunday-ledger-matchups`, a public repository with push/admin access.
Its default branch and local origin match the implementation baseline.

The prior automatic-review rejection requested explicit authorization naming
this public destination. The owner has now supplied that authorization,
conditional on the current-week game-visibility / next-unopened-week entry and
credit split. That permission blocker is resolved; the revised code must still
pass the required checks before release. Publication status is recorded above.
No private league identifiers or participant data belong in the public PR.

The owner has waived a paid hosted Preview database; no paid service is needed
for the agreed disposable CI verification plan. Existing weeks retain their
pinned betting, credit, scoring and attendance rules while current-week game
visibility follows the approved read-policy exception.
A deployment rollback cannot erase accepted receipts or undo database changes;
after a 1.3 week opens, recovery must preserve its rule identity and accepted
bets, normally through a compatible forward fix.
