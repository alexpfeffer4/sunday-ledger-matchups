import "server-only";

import { cache } from "react";
import { isSupabaseConfigured } from "@/adapters/supabase/config";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import {
  livePlayoffStateSchema,
  type LivePlayoffState,
} from "@/application/queries/live-playoff-dtos";

export const getLivePlayoffState = cache(
  async (leagueSlug: string): Promise<LivePlayoffState | null> => {
    if (!isSupabaseConfigured()) return null;

    const supabase = await createSupabaseServerClient();
    const claims = await supabase.auth.getClaims();
    if (!claims.data?.claims?.sub) return null;

    const result = await supabase
      .schema("api")
      .rpc("get_playoff_state", { p_league_slug: leagueSlug });

    if (result.error) {
      if (
        ["42501", "PGRST116", "PGRST202", "P0002"].includes(
          result.error.code ?? "",
        )
      ) {
        return null;
      }
      throw new Error("The playoff bracket could not be loaded.");
    }
    if (!result.data) return null;
    return livePlayoffStateSchema.parse(result.data);
  },
);
