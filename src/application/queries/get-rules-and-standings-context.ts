import "server-only";

import { exampleSeasonSlug } from "@/adapters/example/example-season";
import { getLiveStage1League } from "@/application/queries/get-live-stage1-league";
import { getSeasonRuleset } from "@/application/queries/get-season-ruleset";
import { getSeasonArchive } from "@/application/queries/get-season-archive";

export async function getRulesAndStandingsContext(leagueSlug: string) {
  if (leagueSlug === exampleSeasonSlug) {
    return {
      live: null,
      archive: await getSeasonArchive(leagueSlug),
      persistedSnapshot: null,
      isExample: true,
    };
  }

  const [live, archive, persistedSnapshot] = await Promise.all([
    getLiveStage1League(leagueSlug),
    getSeasonArchive(leagueSlug),
    getSeasonRuleset(leagueSlug),
  ]);

  return {
    live,
    archive,
    persistedSnapshot,
    isExample: false,
  };
}
