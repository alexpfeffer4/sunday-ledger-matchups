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

## Original rollout compatibility (superseded for future weeks)

This change is prospective. A season’s frozen Ruleset snapshot remains the
authority for that season:

- frozen V1.1 seasons retain their original All-play calculation, ordering,
  standings, qualification seeds, brackets, champion, history, and audit hash;
- V1.1 Rules pages continue to disclose the historical tiebreak order;
- unfrozen exact V1.1 drafts may be promoted to V1.2 by the migration; and
- new seasons snapshot V1.2 from the migration-owned allowlist.

No old standing, playoff field, result, champion, or archive is recalculated.

## September 11 prospective-week amendment

The owner subsequently approved rule updates for future play within existing
development seasons. An already-open or completed V1.1 week keeps its rules;
the next week can adopt V1.2 when it opens. Past scores, receipts and published
standings are not recalculated. Future cumulative standings use the rules of
that future week. This supersedes the original season-long upgrade prohibition.
See the [governing addendum](governance/2026-09-11-governing-addendum.md).

## Recorded governing amendment

The owner explicitly approved the prospective change on September 4, 2026.
The [current governing addendum](governance/2026-09-11-governing-addendum.md)
records the amendment without inventing a Decision Register identifier. The
original unnumbered decision text is retained below:

> **Identifier:** Named amendment; no later numeric identifier is evidenced.
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

The September 11, 2026 addendum supplies these amendments across all six
governing sources: prospective All-play removal, the exact V1.2 order, and
frozen-snapshot compatibility. Unrelated open decisions retain their scope.

## Migration and rollback

Migration `20260910173048_ruleset_v1_2_remove_all_play.sql` updates only the two
exact migration-owned V1.1 catalog rows and exact matching unfrozen snapshots.
It fails closed if the expected catalog baseline is absent. It does not mutate
frozen snapshots.

Production activation is complete. PR #26 merged on September 10, 2026;
PR #27 reconciled the applied timestamp without changing the SQL. Read-only
verification on September 11 confirmed the applied identifier above. The old
filename `20260904173852_ruleset_v1_2_remove_all_play.sql` is superseded.

Rollback before any V1.2 roster lock is to restore the prior application and
apply a separately reviewed forward migration that restores the V1.1 catalog.
After a V1.2 season freezes, do not rewrite its snapshot; restore the app if
needed and correct the issue prospectively through a later Ruleset version.

## Production mutation record

The original V1.2 proposal did not itself authorize Production mutation.
Its subsequent approved activation is recorded above. Stage 6 reconciles this
history and proposes a separate prospective-week and card-compatibility migration; that new migration
has not been applied to Production.
