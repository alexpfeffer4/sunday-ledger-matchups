import "server-only";

import { cache } from "react";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import {
  stage1StateSchema,
  type Stage1StateDto,
} from "@/application/queries/stage1-dtos";

export const getLiveStage1League = cache(
  async (leagueSlug: string): Promise<Stage1StateDto | null> => {
    const supabase = await createSupabaseServerClient();
    const claims = await supabase.auth.getClaims();
    if (!claims.data?.claims?.sub) return null;

    const result = await supabase.schema("api").rpc("get_stage1_state", {
      p_league_slug: leagueSlug,
    });

    if (result.error) {
      if (["42501", "PGRST116", "P0002"].includes(result.error.code ?? "")) {
        return null;
      }
      throw new Error("The league could not be loaded.");
    }

    return stage1StateSchema.parse(result.data);
  },
);
