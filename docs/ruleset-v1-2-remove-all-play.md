# Ruleset V1.2 — Remove All-play

## Outcome

Ruleset V1.2 removes All-play from prospective Sunday Ledger seasons. New
Live seasons and newly started Owner Guided Rehearsals use this standings order:

1. matchup win percentage;
2. Points For;
3. balanced head-to-head mini-table, when every tied pair has the same positive
   meeting count;
4. fewer incomplete regular-season weeks;
5. highest official single-week score; and
6. the stored deterministic random tiebreak value.

All-play is absent from Matchup, Standings, weekly summaries, RecordBridge,
history, and archive presentation. The database does not compute it for a V1.2
season.

## Frozen-season compatibility

This change is prospective. A season’s frozen Ruleset snapshot remains the
authority for that season:

- frozen V1.1 seasons retain their original All-play calculation, ordering,
  standings, qualification seeds, brackets, champion, history, and audit hash;
- V1.1 Rules pages continue to disclose the historical tiebreak order;
- unfrozen exact V1.1 drafts may be promoted to V1.2 by the migration; and
- new seasons snapshot V1.2 from the migration-owned allowlist.

No old standing, playoff field, result, champion, or archive is recalculated.

## Proposed governing decision entry

The governing Project Sources supplied for this work are not stored in this
repository, and the next Decision Register identifier is ambiguous. The owner
explicitly approved this prospective change on September 4, 2026. This pull
request proposes the following exact entry for the governing-source workflow:

> **Identifier:** Assign the next valid Decision Register identifier at
> governing-source acceptance.
>
> **Status:** Decided — owner-approved, prospective.
>
> **Decision:** Beginning with Sunday Ledger Ruleset V1.2, remove All-play from
> the product and from standings qualification. Rank regular-season standings
> by matchup win percentage, Points For, a balanced head-to-head mini-table
> when applicable, fewer incomplete regular-season weeks, highest official
> single-week score, then the stored deterministic random tiebreak value.
>
> **Compatibility:** Frozen V1.1 seasons keep their original Ruleset snapshot,
> All-play calculation, ordering, standings, playoff qualification, history,
> and audit evidence. Do not recalculate a frozen season under V1.2.
>
> **Scope:** This changes only the prospective standings tiebreak and related
> presentation. It does not change weekly scoring, attendance consequences,
> playoff structure, higher-seed advancement on an exact playoff tie, Week 18
> exhibition finality, Live/Simulation isolation, or D-001 through D-007.

The corresponding governing-source amendment should remove All-play as
secondary standings context and as a required product surface in the next
valid Product Bible and Visual Bible revisions, publish the exact V1.2 order in
the Ruleset, and record frozen-snapshot compatibility in the next Architecture
revision. Unrelated open decisions must keep their existing status and scope.

## Migration and rollback

Migration `20260904173852_ruleset_v1_2_remove_all_play.sql` updates only the two
exact migration-owned V1.1 catalog rows and exact matching unfrozen snapshots.
It fails closed if the expected catalog baseline is absent. It does not mutate
frozen snapshots.

Before Production activation, verify the governing-source entry, review the
migration, merge the application commit, let the normal Vercel deployment
complete, then apply the reviewed migration through the established hosted
migration procedure. Do not start a new season between application deployment
and migration completion.

Rollback before any V1.2 roster lock is to restore the prior application and
apply a separately reviewed forward migration that restores the V1.1 catalog.
After a V1.2 season freezes, do not rewrite its snapshot; restore the app if
needed and correct the issue prospectively through a later Ruleset version.

## Production mutation record

This pull request does not merge, deploy, apply a hosted migration, modify a
Production Ruleset catalog, reset an existing rehearsal, or create a new
Production season. All database mutation proof is local or disposable CI data.
