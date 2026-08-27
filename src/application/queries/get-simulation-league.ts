import {
  cardPositionsFixture,
  historyMeetingsFixture,
  leagueScoreboardFixture,
  matchupHomeFixture,
  simulationLeagueSlug,
  slateFixture,
  standingsFixture,
} from "@/adapters/simulation/poc-week-six";
import { generateRegularSeasonSchedule } from "@/domain/schedule/generate";

function getSchedule() {
  const namesById = new Map(
    standingsFixture.map((standing) => [standing.id, standing.memberName]),
  );
  const publication = generateRegularSeasonSchedule({
    entryIds: standingsFixture.map((standing) => standing.id),
    seed: "west-21st-ledger-2026",
  });

  return {
    ...publication,
    matchups: publication.matchups.map((matchup) => ({
      ...matchup,
      sideA: namesById.get(matchup.sideAEntryId) ?? "Unknown member",
      sideB: namesById.get(matchup.sideBEntryId) ?? "Unknown member",
    })),
  };
}

export function getSimulationLeague(slug: string) {
  if (slug !== simulationLeagueSlug) return null;
  return {
    matchup: matchupHomeFixture,
    slate: slateFixture,
    standings: standingsFixture,
    cardPositions: cardPositionsFixture,
    scoreboard: leagueScoreboardFixture,
    historyMeetings: historyMeetingsFixture,
    schedule: getSchedule(),
  };
}
