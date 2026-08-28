import "server-only";

import { cache } from "react";
import { isSupabaseConfigured } from "@/adapters/supabase/config";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import {
  seasonRulesetSnapshotSchema,
  type SeasonRulesetSnapshotDto,
} from "@/application/queries/season-ruleset-dtos";

export const getSeasonRuleset = cache(
  async (leagueSlug: string): Promise<SeasonRulesetSnapshotDto | null> => {
    if (!isSupabaseConfigured()) return null;

    const supabase = await createSupabaseServerClient();
    const claims = await supabase.auth.getClaims();
    if (!claims.data?.claims?.sub) return null;

    const result = await supabase.schema("api").rpc("get_season_ruleset", {
      p_league_slug: leagueSlug,
    });
    if (result.error) {
      if (["42501", "P0002", "PGRST202"].includes(result.error.code ?? "")) {
        return null;
      }
      throw new Error("The season rules could not be loaded.");
    }
    if (result.data === null) return null;
    return seasonRulesetSnapshotSchema.parse(result.data);
  },
);
