import "server-only";

import { cache } from "react";
import {
  fullSeasonSimulationArchive,
  fullSeasonSimulationSlug,
} from "@/adapters/simulation/full-season";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import {
  simulationSeasonArchiveSchema,
  type SimulationSeasonArchiveDto,
} from "@/application/queries/season-archive-dtos";

export const getSimulationSeasonArchive = cache(
  async (leagueSlug: string): Promise<SimulationSeasonArchiveDto | null> => {
    if (leagueSlug === fullSeasonSimulationSlug) {
      return simulationSeasonArchiveSchema.parse(fullSeasonSimulationArchive);
    }

    const supabase = await createSupabaseServerClient();
    const claims = await supabase.auth.getClaims();
    if (!claims.data?.claims?.sub) return null;

    const result = await supabase.schema("api").rpc("get_season_archive", {
      p_league_slug: leagueSlug,
    });
    if (result.error) {
      if (["42501", "P0002", "PGRST202"].includes(result.error.code ?? "")) {
        return null;
      }
      throw new Error("The season archive could not be loaded.");
    }
    if (result.data === null) return null;
    return simulationSeasonArchiveSchema.parse(result.data);
  },
);
