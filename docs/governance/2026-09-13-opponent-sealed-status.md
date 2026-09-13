# Opponent sealed status — September 13, 2026

The owner approved the proposed pre-lock **Sealed / Not sealed** indicator in
the September 13 conversation, then requested a mobile odds layout fix.

This narrowly supersedes the pre-lock readiness prohibition in Ruleset V1.1
§8, Integrated Roadmap 1.1 §§Phase 1/11.4, and Visual Bible 4.1 §11.4 for the
scheduled opponent's submission fact only. Read this with the six historical
bases and the September 11 governing addendum; it is also the Decision Register
addendum for this named owner decision. No new numbered decision is invented.

- Authenticated league participants may see whether their scheduled opponent
  sealed the current card, including before common lock. A commissioner has
  the same access for their own matchup, with no additional pre-lock roster view.
- The database derives a single boolean from the accepted full allocation.
  Compliance stays pending until lock, so it is not used as a pre-lock seal flag.
  A local draft or an unsuccessful submission does not qualify as sealed.
- Opponent selections, counts, stakes, odds, receipt IDs, acceptance times and
  draft activity stay absent until their existing authorized reveal. Existing
  membership checks, owner-only table access and rehearsal containment remain.
- The indicator applies to current and future matchup displays once activated.
  It changes presentation access only: no stored rules snapshot, receipt,
  scoring, lock, settlement, completed result or standing is rewritten.
- Missing status during rollout displays **Status unavailable**, never a false
  claim that an opponent has not sealed. Refresh reads saved application state
  and does not request provider odds or scores.

The related My Card layout reserves an unbroken column for American odds and
allows the title to wrap independently. Odds values and accepted terms are unchanged.

Activation requires the additive `opponent_sealed_status` migration and application
release. This implementation branch does not itself authorize Production migration
or merge. Historical source files and approvals remain intact.
