# Owner Guided Rehearsal

## Delivery boundary

Owner Guided Rehearsal is one private, owner-entitled training season. It is
not a public mode, an Example Season access change, a replacement for the
controlled friend league, or a second gameplay engine.

The implementation composes the existing authoritative Simulation provider
fixture and the same roster lock, schedule, slate, card validation, whole-card
receipt, common lock, event reveal, settlement, standings, correction,
postseason, champion, Week 18, history, and archive commands used by the real
application. Rehearsal orchestration does not insert results, standings,
winners, champions, or archives directly.

## Proposed governing decision entry

The repository does not contain the governing Decision Register supplied for
this work, and its next identifier is therefore ambiguous. The pull request
proposes this exact entry for the owner to place through the governing-source
workflow without changing D-001 through D-007:

> **Identifier:** Assign the next valid Decision Register identifier at
> governing-source acceptance.
>
> **Status:** Decided — owner-approved, narrowly scoped.
>
> **Decision:** Sunday Ledger may include a private Owner Guided Rehearsal that
> is available only to explicitly authorized product-owner accounts. It uses
> deterministic synthetic participants, games, odds, cards, results, and an
> accelerated Simulation clock to teach the real member and commissioner
> workflows. It must use the same authoritative schedule, card, validation,
> seal, receipt, reveal, settlement, standings, correction, postseason, Week
> 18, history, and archive lifecycle as Live. It is always labeled as
> noncompetitive simulated data, remains isolated from Live leagues and
> Example Season, makes no real provider or email calls, grants no
> receipt-reading exception, and cannot affect real users or competitive
> records.
>
> **Scope note:** This decision does not resolve D-007, make Simulation public,
> reopen D-001 through D-006, or authorize a generalized scenario builder.

## Identity and containment

- `private.owner_rehearsal_entitlements` is the explicit server/database
  entitlement. It is not an email or UUID allowlist in code, SQL migrations,
  client configuration, or a public environment variable.
- `private.owner_rehearsals` is the database-enforced synthetic identity. A
  partial unique index allows one active rehearsal per owner.
- The rehearsal is excluded from `api.my_leagues`. Its only discovery link is
  rendered in Account after the entitlement RPC succeeds.
- Nine bot principals have no email, password, auth identity, or public
  impersonation path. Their cards are created server-side and accepted by the
  shared whole-card authority.
- Membership, invitation, identity, provider-source, time, and reset guards
  keep the rehearsal separate from Live, Example Season, and ordinary
  Simulation leagues.
- Reset has no league-id input. It can retire only the authenticated owner’s
  active rehearsal after exact-name confirmation. The immutable synthetic
  ledger remains for audit while product reads are revoked.
- Rehearsal pages are authenticated, dynamically rendered, `noindex`, and not
  linked from public metadata, the manifest, or ordinary navigation.

## Checkpoint design

The 22 guided advances pause at the instructive states: formation, Week 1
open/partial/provisional/final, Week 2 quote review, Week 5 incomplete-card
consequence, Week 8 provisional/corrected, Week 14 qualification, Weeks 15–17
postseason, Week 17 champion finality, Week 18 exhibition, and final archive.
Repetitive weeks run the same authoritative weekly commands with deterministic
valid sample cards.

Every mutation has a stable operation identity and a command receipt. The
expected checkpoint is checked under lock. A repeated or response-lost command
returns the original outcome and cannot run the checkpoint twice.

## Post-merge activation plan

Do not activate this from browser code and do not use a hard-coded account
identifier. After separate owner approval:

1. Merge the reviewed pull request only after all required checks pass.
2. Let the normal Production deployment apply the reviewed application commit;
   do not manually deploy a different tree.
3. Apply the reviewed migration through the established Production migration
   procedure, then verify its exact migration identifier and generated API
   types.
4. Resolve the intended owner to an `auth.users.id` using the trusted hosted
   admin workflow. Confirm the matching `private.profiles` record and do not
   copy the identifier into source or public configuration.
5. In a scoped, audited database session, insert exactly one row:

   ```sql
   insert into private.owner_rehearsal_entitlements (user_id, note)
   values (:reviewed_owner_user_id, 'Production owner approval YYYY-MM-DD');
   ```

6. Verify as the owner that Account shows the tool and as a normal authenticated
   account that Account, the guessed route, and every owner RPC reveal nothing.
7. Start synthetic data only through the owner UI after that separate
   Production activation approval.

## Rollback and safe retirement

To revoke discovery and commands without modifying any Live league:

```sql
update private.owner_rehearsal_entitlements
set revoked_at = clock_timestamp()
where user_id = :reviewed_owner_user_id
  and revoked_at is null;
```

If the owner can still use the approved UI, first use **Reset rehearsal** to
append a reset event, archive only the synthetic league, and remove all product
read access. Entitlement revocation is the immediate kill switch. Application
rollback may then restore the prior deployment; the private append-only rows
remain inert. Never delete or alter a Live league as part of this procedure.

## Production mutation record

This pull request does not create or change any Production account,
entitlement, rehearsal, bot, league, invitation, card, receipt, result,
correction, archive, migration state, environment configuration, or deployment.
All mutation proof is limited to local/disposable CI Supabase.
