import "server-only";

import { fullSeasonSimulationSlug } from "@/adapters/simulation/full-season";
import { getLiveStage1League } from "@/application/queries/get-live-stage1-league";
import { getSeasonRuleset } from "@/application/queries/get-season-ruleset";
import { getSimulationLeague } from "@/application/queries/get-simulation-league";
import { getSimulationSeasonArchive } from "@/application/queries/get-simulation-season-archive";

export async function getRulesAndStandingsContext(leagueSlug: string) {
  const exampleLeague = getSimulationLeague(leagueSlug);
  if (exampleLeague) {
    return {
      live: null,
      archive: null,
      persistedSnapshot: null,
      exampleLeague,
      isExample: true,
    };
  }

  if (leagueSlug === fullSeasonSimulationSlug) {
    return {
      live: null,
      archive: await getSimulationSeasonArchive(leagueSlug),
      persistedSnapshot: null,
      exampleLeague: null,
      isExample: true,
    };
  }

  const [live, archive, persistedSnapshot] = await Promise.all([
    getLiveStage1League(leagueSlug),
    getSimulationSeasonArchive(leagueSlug),
    getSeasonRuleset(leagueSlug),
  ]);

  return {
    live,
    archive,
    persistedSnapshot,
    exampleLeague: null,
    isExample: false,
  };
}
