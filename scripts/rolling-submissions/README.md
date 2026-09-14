# Rolling submissions release SQL

These operator scripts prepare a reviewable release. The owner has expressly
authorized publication to `alexpfeffer4/sunday-ledger-matchups` and conditionally
authorized Production migration, merge, deployment and activation after the
required checks pass and release blockers are cleared. Record that clearance
and the verified release evidence before applying changes; these files alone
do not establish that the conditions are met. Keep database connection details
and metadata output out of public pull-request logs.

Activation is **global for both LIVE and SIMULATION catalogs**. It affects new
seasons and future unopened weeks in existing seasons, including active owner
rehearsals. It is not a switch for one pilot league. Already-open weeks retain
their pinned betting, credit, scoring and attendance rules, even if a member
has not submitted. Retired/reset rehearsals are not reopened.

The owner's current-week visibility exception is separate: accepted game
identities become visible in the current week, including 1.2, when the visibility
support is released. Existing detailed-selection reveal and whole-card aggregate
timing remain. No catalog update or week repinning is needed for that read-policy
change. For the pilot, the intended boundary is Week 1 game visibility and
unopened Week 2 rolling entry/unused-credit rules; refresh the inventory before
activation and preserve any week that has since opened.

## Files and execution order

| File            | What it does                                                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inventory.sql` | Read-only current catalog and season/week metadata; identifies the next unopened week without querying any member's bets                                                                                                        |
| `preflight.sql` | Read-only verification of exact prepared/active package hashes, support functions, privacy grants, immutable package storage, old-draft compatibility and prospective week pinning; returns the adoption inventory and its hash |
| `activate.sql`  | Defaults to a dry run that retains 1.2; with explicit operator settings, atomically updates only the two active catalog rows to the exact prepared 1.3 packages                                                                 |

Use a dedicated connection to the verified intended database. These files use
ordinary SQL, so the approved database SQL tool or `psql -X -v ON_ERROR_STOP=1 -f`
can run the exact file. Do not paste their transaction wrappers into an existing
transaction. `inventory.sql` works on the current pre-release schema;
`preflight.sql` and `activate.sql` require all three support migrations:

1. `20260914172554_rolling_submission_contract.sql`
2. `20260914172601_rolling_submission_lifecycle.sql`
3. `20260914172609_rolling_submission_visibility.sql`

Apply those only in their reviewed, authorized environment. They prepare
rolling-entry support while the catalog remains 1.2; the visibility migration
also changes authorized current-week game-identity reads across supported
versions. Verify the actual migration ledger in
addition to the preflight's installed-object checks. Database preflight cannot
prove that compatible application code is deployed or that the required
disposable full-stack CI and public Preview checks passed. The owner waived a
paid hosted authenticated Preview on September 14; real isolated CI remains
required. See the updated release note.

## Exact reviewed packages

| Mode       | Prepared 1.3 / Product Bible 3.2 SHA-256                           |
| ---------- | ------------------------------------------------------------------ |
| LIVE       | `e96725423ca2a02a3922ccd05e0ea99916375da199b2438f42be17a1a7a29b65` |
| SIMULATION | `2f033f52a0ae85afe49f314c11e0f6cf4783300bc7b71b71c079b61d08aeced5` |

The scripts independently recompute the canonical JSON digest and compare it to
these application vectors. They accept only the exact existing 1.2 catalogs or
the exact already-active 1.3 catalogs. Mixed mode versions, unknown packages or
an incomplete support release fail without inferring a new transition.

## Explicit activation after release approval

First finish the required review, CI and public Preview evidence, record that
the owner's conditional release criteria are satisfied, apply support migrations,
and verify that the approved
application SHA is deployed. Rerun `preflight.sql` immediately before activation.
Review its complete global adoption inventory privately and retain its
`inventory_sha256`.

Only then supply these settings in the dedicated connection, replacing every
placeholder with verified release evidence, and execute the exact `activate.sql`:

```sql
set sunday_ledger.rolling_apply = 'true';
set sunday_ledger.rolling_release_sha = '<verified deployed 40-character SHA>';
set sunday_ledger.rolling_approval_reference = '<recorded release approval>';
set sunday_ledger.rolling_inventory_sha = '<fresh preflight inventory_sha256>';
```

The original build-only instruction was followed by the owner's conditional
release authorization. Supply these Production settings only after documenting
that its required checks and release conditions are satisfied; no repeated
approval is required for the same approved scope. They are operator safeguards,
not evidence that verification has passed.
The script requires a full SHA and recorded approval reference and refuses a
stale adoption inventory. If a week opens or a season's relevant metadata changes
between preflight and activation, rerun the read-only preflight and review the
new boundary. Do not edit the expected hash merely to suppress a mismatch.

With settings absent, the script validates support and locks the catalog rows
briefly, but updates no rows. With settings present, it changes both catalogs
in one transaction and checks that all existing opened-week bindings stayed
unchanged. An exact repeat reports `ALREADY_ACTIVE` and performs no update.

Week opening already takes `FOR SHARE` on the mode catalog row. Activation
takes the two catalog row locks in mode order and does not acquire season/week
locks afterward. An opening therefore observes a complete old or new package;
it cannot create a mixed-rule week. Short lock/statement timeouts abort a stalled
operation. A timeout or SQL error is a failed activation, not permission to
continue from the middle of the script. See PostgreSQL's
[row-lock and deadlock documentation](https://www.postgresql.org/docs/current/explicit-locking.html).

Retain the actual catalog output and approval reference privately with release
evidence. Do not open a real week, create a real league or submit a real bet just
to test activation. Normal future opening pins the approved package through the
existing authority.

## Recovery limits

Before activation, compatible support can remain installed with the 1.2
catalog. Verify the old application tolerates those additive contracts before
any application rollback.
The current-week game-visibility migration changes read policy independently
of catalog activation; reverting the application does not reverse that database
permission or remove knowledge of game identities already shown.

There is deliberately no inverse catalog-update script. After activation, a
new draft season may already reference 1.3 even before any week opens. Once a
week opens, its 1.3 binding is permanent, including a week with no receipts yet.
Reverting the catalog to 1.2 would require a supported, separately reviewed
transition and could otherwise block future openings or draft roster lock.

Preserve snapshots, opened weeks, accepted receipts, original stakes and
history. Repair forward with compatible code and reviewed migrations. Do not
relabel a week, recycle credits, delete receipts, rewrite prior standings or
restore whole-card/common-lock semantics to a 1.3 week.

## Isolated verification completed

The exact scripts passed an embedded PostgreSQL check against the current
migration set: default dry run retained both 1.2 catalogs; a stale inventory
rejected atomically; explicit disposable activation installed both exact 1.3
catalogs; existing snapshot bytes, an open week and accepted receipts were
unchanged; a repeat was a no-op; the real rehearsal lifecycle completed Week 1
under 1.2 and opened Week 2 under 1.3. Read-only preflight passed before and
after activation.

That check uses one embedded database connection and skips the external
scheduler-extension migration. It does not prove concurrent-session behavior,
hosted Supabase integration, provider operation or authenticated Preview.
Required disposable Supabase CI and release checks remain separate gates.
