# Rolling submissions — implementation and rollout

Prepared September 14, 2026. **Implementation and local verification complete, including
the current-week visibility exception. PR #48 is published. Native database, concurrency and shared-browser CI passed;
the first desktop run found three outdated wording checks. Those are corrected
with legacy rehearsal wording preserved. Full Auth/submission reverification
and conditional Production release remain pending as recorded below.**

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

## Prepared migration and activation inventory

| Deliverable                                        | Status                                                                                                                                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260914172554_rolling_submission_contract.sql`   | Local PostgreSQL verification passed; prepares support without activating the catalog                                                                                                                |
| `20260914172601_rolling_submission_lifecycle.sql`  | Local lifecycle and full-season rehearsal passed; native CI pending                                                                                                                                  |
| `20260914172609_rolling_submission_visibility.sql` | Local authorized projections and privacy regression passed; native CI pending                                                                                                                        |
| Explicit catalog activation                        | [Operator SQL and safeguards](../scripts/rolling-submissions/README.md); exact scripts verified in an isolated embedded PostgreSQL rehearsal                                                         |
| First eligible week                                | Pilot Week 2 at the September 14 17:36 UTC read-only observation; refresh the complete private metadata inventory before approval/activation                                                         |
| Week-opening/activation serialization              | Catalog row locks match the existing week-pinning `FOR SHARE`; independent code review and sequential activation proof complete; concurrent-session/required Supabase gate evidence remains separate |

Do not apply an unreviewed filename or assume this inventory is final. Record
any additional additive migration and the tested order before release approval.
Applied historical migrations must not be rewritten.

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

| Gate                                                                       | Status / evidence                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Batch acceptance, budget races, replay and immutable receipts              | 42 rolling submission assertions passed; immutable and revoked-access retry cases covered. Native concurrency script prepared; all four native separate-session scenarios passed in PR #48 CI                                              |
| Kickoff boundaries, current/changed quotes and later-game refresh          | 18 rolling Live quote assertions passed, including late-only events, incomplete-market rejection, quota preservation and draft compatibility                                                                                               |
| Immediate game identity and selection/aggregate privacy matrix             | 59 rolling and 40 new legacy visibility assertions passed, plus existing authorization regressions; game identities are public without actual details or new legacy budget fields                                                          |
| Partial/zero participation, correction and finalization races              | 54 rolling lifecycle assertions passed. Native acceptance/settlement race passed in PR #48 CI                                                                                                                                              |
| Future-week activation and legacy-week regression                          | Exact operator scripts passed isolated embedded PostgreSQL: dry run, stale-inventory refusal, atomic activation, immutable old evidence, repeat no-op, real rehearsal 1.2 Week 1 → 1.3 Week 2; native Supabase migration/pgTAP CI passed   |
| Authoritative full-season Simulation/rehearsal through Week 18 and archive | Passed all 18 weeks with partial participants, incremental bots, zero-submission lessons, postseason, corrections and archive                                                                                                              |
| Mobile/browser core submission journey and WebKit coverage                 | Real Auth/UI/RPC desktop and mobile journeys added to required CI; SQL fixture sequence independently passed 12 checks. Browser execution pending publication                                                                              |
| Required local checks, generated types, CI and build                       | npm run verify passed after the visibility exception: identity assets, Prettier, ESLint, strict TypeScript, 527 tests in 85 files and Production build. Native generated-type and quality gates passed; real Auth/browser journeys pending |
| Independent integrity/privacy/lifecycle review                             | Independent review completed; fixed revoked-access replay and strengthened per-game quote completeness. Fresh embedded PostgreSQL passed 35 suites and 1,294 assertions, including the current-week visibility exception                   |
| Hosted authenticated Preview                                               | Waived by owner on September 14 to avoid a paid plan. Real isolated Supabase/Auth/browser/concurrency CI remains required and pending.                                                                                                     |
| Physical iPhone and screen-reader evidence                                 | Not observed in this implementation                                                                                                                                                                                                        |
| Production rollout                                                         | Conditionally authorized by the owner after all checks and blockers are cleared; not performed                                                                                                                                             |

Use actual command/run/commit evidence when filling this table. Browser emulation
does not establish a physical-device result, and synthetic fixtures do not
establish production provider latency or a real weekly pilot.

## Verification environment decision — September 14 update

The owner asked to skip the paid hosted test database and proceed. The release
will use the existing disposable Supabase CI stack for real PostgreSQL,
authentication, RLS/RPC, desktop/mobile submission and native multi-session
concurrency verification. Those gates must pass before release clearance. The
embedded PostgreSQL results alone do not substitute for them.

Authenticated hosted Preview verification is waived to avoid new spending.
The Vercel Preview will still be built and checked for public-page rendering and
backend isolation. Its public-page checks do not prove authenticated submission;
that evidence must come from the disposable full-stack CI lane.

The Preview guard remains: an explicitly separate `PREVIEW_SUPABASE_REF` and
matching public URL are required for a Preview backend; Production is refused.
No hosted test resource or paid upgrade has been created.

Billing correction: the organization is on Free, and Supabase's official pricing
excludes branching from that plan. The earlier $0.01344/hour quote was the branch
compute rate only; it omitted the required paid subscription (Pro starts at
$25/month) and possible other usage. The prior under-$1 proposal is withdrawn.
See [Supabase pricing](https://supabase.com/pricing) and
[branch billing](https://supabase.com/docs/guides/platform/manage-your-usage/branching).

## Proposed production sequence — conditional release authorization

1. Finish the reviewed PR, required full-stack CI, public Preview checks, independent
   review and exact activation artifact. Record the final head, migrations,
   provider-call impact and any remaining limitation.
2. Read current main/Production/migration state and the intended seasons' week
   bindings. Identify the first week that has not opened for each target;
   preserve all already-open betting and credit rules. Confirm the pilot split
   is still current Week 1 visibility and unopened Week 2 rolling entry/credits.
   Record concrete release clearance under the owner's existing conditional
   merge/deployment authorization; do not request the same approval again.
3. Once those conditions are met, apply the additive support migrations in their
   tested order while retaining the active 1.2 catalog. The visibility migration
   permits current-week game identities even before catalog activation. Verify
   compatibility, grants, canonical rules, legacy detail/aggregate privacy and
   unchanged existing competitive evidence.
4. Merge the reviewed PR and verify the normal Production deployment and domain
   aliases. Confirm the deployed code supports both old weeks and prepared 1.3
   before activation.
5. Run only the separately reviewed activation, serialized against week opening.
   Verify catalog version/hash and the resulting adoption boundary. Do not open
   a real week or submit a real bet merely to create smoke-test evidence.
6. Verify current-week accepted game lists through authorized read paths, while
   preserving detailed selections until their existing reveal gate. Verify the
   actual week-rule identity when the next eligible week opens. Record both
   effective dates and the completed release.

The [operator SQL instructions](../scripts/rolling-submissions/README.md) supply
the exact metadata, readiness and transactional activation files. Complete the
remaining CI/public Preview evidence before release clearance. Never point
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

- Initial local implementation commit before the latest visibility exception: `2bb8dfcfc974471271762632241c375db063a01a`; tree `c95ebb91c64010122c0045f59b85b1cbf7d13426`. The published implementation at `9830abbaa88c563060ead45c4f34a26668237b2f` has tested tree `7b9d672e09235f8d9a4db2438c6070429d161f23`; final release revision pending.
- PR: [#48](https://github.com/alexpfeffer4/sunday-ledger-matchups/pull/48), published under the owner's explicit public-repository authorization.
- Public Preview: [initial deployment](https://sunday-ledger-matchups-dc5sh164v-pfeffer.vercel.app), READY at commit `9830abbaa88c563060ead45c4f34a26668237b2f`. Home, Rules, Trust and sign-in pages rendered; no application console errors observed. Preview backend guard passed its rejection tests. Paid hosted authenticated Preview waived by owner.
- Local test/review evidence: implementation and current-week visibility passed as above. Native PostgreSQL: 35 suites, 1,294 assertions; all four separate-session concurrency scenarios and generated types passed. Initial desktop run: new rolling journey and 10 other tests passed; three legacy wording checks failed and are corrected in the next revision. Full desktop/mobile reverification pending.
- Migration/activation artifacts: prepared above; final PR verification pending.
- First eligible unopened week(s): observed above; fresh private inventory required at activation.
- Reason not to merge yet: the final revision must pass the complete Auth/browser submission gates, including mobile; the initial run stopped on the corrected wording checks.
- Owner authorized merge/deployment once everything is complete and no release blocker remains. This condition has not been met; no Production change has been performed.

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
