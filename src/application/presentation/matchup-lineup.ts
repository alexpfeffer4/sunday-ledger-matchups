import type {
  PairedMatchupDto,
  PositionLedgerItem,
} from "@/application/queries/project-paired-matchup";
import { formatMarketProposition } from "@/components/card/market-option-copy";
import {
  formatCenticredits,
  returnedCenticredits,
} from "@/domain/odds/american";

export const lineupMarkets = ["MONEYLINE", "SPREAD", "TOTAL"] as const;

export type MatchupGame = {
  eventId: string;
  eventLabel: string;
  scheduledStartAt: string;
  rows: PositionLedgerItem[];
  selfSelected: boolean;
  opponentSelected: boolean;
  completed: boolean;
};

/** Group only the authorized projection. Never reconstruct hidden receipts. */
export function matchupGames(matchup: PairedMatchupDto): MatchupGame[] {
  const games = new Map<string, MatchupGame>();
  const ensure = (
    event: Pick<MatchupGame, "eventId" | "eventLabel" | "scheduledStartAt">,
  ) => {
    let game = games.get(event.eventId);
    if (!game) {
      game = {
        ...event,
        rows: [],
        selfSelected: false,
        opponentSelected: false,
        completed: false,
      };
      games.set(event.eventId, game);
    }
    return game;
  };
  if (matchup.phase !== "PREGAME" || matchup.gameIdentitiesVisible) {
    for (const row of Object.values(matchup.rows).flat())
      ensure(row).rows.push(row);
  }
  for (const game of matchup.self.selectedGames ?? [])
    ensure(game).selfSelected = true;
  for (const game of matchup.opponent.selectedGames ?? [])
    ensure(game).opponentSelected = true;
  for (const game of games.values()) {
    game.rows.sort(
      (a, b) =>
        lineupMarkets.indexOf(a.marketType) -
          lineupMarkets.indexOf(b.marketType) || a.id.localeCompare(b.id),
    );
    game.completed =
      game.rows.length > 0 &&
      !game.selfSelected &&
      !game.opponentSelected &&
      game.rows.every((row) => row.returnedCenticredits !== null);
  }
  // Status changes never reorder games; a tie uses the immutable event ID.
  return [...games.values()].sort(
    (a, b) =>
      a.scheduledStartAt.localeCompare(b.scheduledStartAt) ||
      a.eventId.localeCompare(b.eventId),
  );
}

/** A deliberately bounded scenario: exactly one outstanding, fully disclosed bet. */
export function resultChangingScenario(
  matchup: PairedMatchupDto,
): string | null {
  if (
    matchup.spectator ||
    matchup.resultStatus ||
    matchup.phase === "PREGAME" ||
    matchup.phase === "FINAL" ||
    matchup.futureSealed ||
    matchup.scorePath.furtherSubmissionsPossible ||
    matchup.scorePath.opponentRemainingMaximumCenticredits === null ||
    matchup.self.scoreCenticredits === null ||
    matchup.opponent.scoreCenticredits === null ||
    !matchup.self.outstanding ||
    !matchup.opponent.outstanding ||
    matchup.self.outstanding.picks + matchup.opponent.outstanding.picks !== 1
  )
    return null;
  if (
    [matchup.self, matchup.opponent].some(
      (member) =>
        member.selectedGames?.length ||
        !["Sealed", "Submitted"].includes(member.cardStatus),
    )
  )
    return null;
  const pending = Object.values(matchup.rows)
    .flat()
    .filter((row) => row.returnedCenticredits === null);
  if (pending.length !== 1) return null;
  const row = pending[0]!;
  const owner = row.side === "SELF" ? matchup.self : matchup.opponent;
  const rival = row.side === "SELF" ? matchup.opponent : matchup.self;
  if (
    owner.outstanding?.picks !== 1 ||
    owner.outstanding.credits !== row.stakeCredits ||
    owner.scoreCenticredits! >= rival.scoreCenticredits!
  )
    return null;
  const after =
    owner.scoreCenticredits! +
    Number(returnedCenticredits(row.stakeCredits, row.americanOdds, "WIN"));
  if (after <= rival.scoreCenticredits!) return null;
  return `If ${formatMarketProposition(row.proposition)} wins, ${owner.displayName} moves ahead, ${formatCenticredits(BigInt(after), true)}–${formatCenticredits(BigInt(rival.scoreCenticredits!), true)}.`;
}
