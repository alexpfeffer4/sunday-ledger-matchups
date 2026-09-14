# Outstanding matchup totals — September 14, 2026

The owner approved the proposed post-lock outstanding pick and credit totals:
“Yes deliberately relax that rule and make that change.” This is the named
Decision Register addendum for that decision, read with the six historical bases.

The owner subsequently explicitly approved publishing this implementation to
the public `alexpfeffer4/sunday-ledger-matchups` repository and, after remaining
CI passes, applying its database migration, merging and deploying to
ledgerleagues.com. This approval covers this bounded release only.

After the common weekly lock, authenticated members may see each participant's
card-wide **Picks outstanding** and **Credits outstanding** beneath their score,
including when browsing other pairings in their own league. This applies to
current and future matchup displays once released, including the current pilot.

- Outstanding picks are accepted, unsettled positions on a compliant or fully
  sealed card, including live games and games that have not started. Outstanding
  credits are their original stakes, not winnings, profit, or maximum returns.
- A recorded win, loss, push, or void removes the position and its original stake
  from these totals. Corrections use the same settled position once, never its
  accumulated version count. A delayed or unconfirmed result remains outstanding.
- Before the database's common-lock time, both aggregate fields are null for all
  callers of the member read. Existing own-card access and the previously approved
  opponent/commissioner submission indicators remain as defined by those decisions.
- The clock is the authoritative season clock, including accelerated Simulation.
  A fully sealed card can show totals after the deadline even if the week-lock
  job has not yet finalized compliance. Missing cards, an unavailable query or
  unresolved compliance show unavailable; confirmed incomplete cards show zero.
- Only the two whole-card totals are newly disclosed. No hidden per-game, market,
  side, odds, individual stake, payout, receipt, or acceptance metadata is added.
  Position rows retain the existing confirmed-start/authoritative-void reveal gate.
  Membership, anonymous/outsider denial and private owner-rehearsal containment
  remain enforced by the database. No new query, provider call or polling is added.
- The owner accepts the resulting inference about card structure: subtracting
  visible unsettled stakes can reveal hidden aggregate exposure, and a single
  remaining hidden pick can reveal its stake. The interface does not enumerate
  hidden positions or group those totals by game.

This narrowly supersedes Product Bible V3 §§2/8 and its sealed-content invariant,
Ruleset V1.1 §9's future-metadata prohibition, Visual Bible V4.1 §§10.4/11.6/18's
blanket hidden-count/stake prohibition, and the corresponding architecture,
roadmap, September 10 audit and September 13 browsing/opponent-status passages.
The historical sources remain intact and must be read with this exception.
No numerical rule, stored rules snapshot, receipt, lock, result, standing,
qualification, settlement arithmetic or provider schedule is changed.

The UI explains the definition once beneath the paired scores. Empty visible
pick sections must not claim that no unsettled picks exist when future picks
may still be hidden. Missing aggregate data is never displayed as zero.
