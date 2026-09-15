import type { LeagueMatchupCards } from "@/application/queries/league-matchup-dtos";
import { makePhase6State } from "./phase6-paired-matchup";
import { makePhase7State, phase7Ids } from "./phase7-season-memory";

export function historicalFixture() {
  const history = makePhase7State();
  const { state: live } = makePhase6State("FINAL");
  const game = history.matchups.find((item) => item.id === phase7Ids.matchup1)!;
  const positions = [
    live.ownerCard!.positions,
    live.matchup!.opponentRevealedPositions,
  ];
  const cards: LeagueMatchupCards = {
    weekId: game.weekId,
    cards: [game.sideAEntryId, game.sideBEntryId].map((entryId, index) => ({
      entryId,
      readiness: "COMPLIANT",
      scoreCenticredits: index === 0 ? 40000 : 20000,
      outstanding: { picks: 0, credits: 0 },
      positions: positions[index]!,
      selectedGames: live.slate.map((event) => ({
        eventId: event.id,
        eventLabel: `${event.awayTeam} at ${event.homeTeam}`,
        scheduledStartAt: event.scheduledStartAt,
      })),
    })),
  };
  return { history, cards, game, live };
}
