import "server-only";

import { cache } from "react";
import {
  exampleSeasonArchive,
  exampleSeasonSlug,
} from "@/adapters/example/example-season";
import { isSupabaseConfigured } from "@/adapters/supabase/config";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import {
  seasonArchiveSchema,
  simulationSeasonArchiveSchema,
  type SeasonArchiveDto,
} from "@/application/queries/season-archive-dtos";

export const getSeasonArchive = cache(
  async (leagueSlug: string): Promise<SeasonArchiveDto | null> => {
    if (leagueSlug === exampleSeasonSlug) {
      return simulationSeasonArchiveSchema.parse(exampleSeasonArchive);
    }
    if (!isSupabaseConfigured()) return null;

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

    const archive = seasonArchiveSchema.parse(result.data);
    return archive.mode === "LIVE" ? archive : null;
  },
);
