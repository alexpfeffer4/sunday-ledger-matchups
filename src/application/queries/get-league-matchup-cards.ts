import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import {
  leagueMatchupCardsSchema,
  type LeagueMatchupCards,
} from "./league-matchup-dtos";
export const getLeagueMatchupCards = cache(
  async (
    leagueSlug: string,
    weekId: string,
  ): Promise<LeagueMatchupCards | null> => {
    const supabase = await createSupabaseServerClient();
    const result = await supabase
      .schema("api")
      .rpc("get_league_matchup_cards", {
        p_league_slug: leagueSlug,
        p_week_id: weekId,
      });
    if (result.error) {
      // Safe staggered rollout: the existing member matchup remains available.
      if (["PGRST202", "42501", "P0002"].includes(result.error.code))
        return null;
      throw new Error("League matchups could not be loaded. Please try again.");
    }
    return leagueMatchupCardsSchema.parse(result.data);
  },
);
