import "server-only";
import { queryFailure } from "./query-failure";

import { cache } from "react";
import { isSupabaseConfigured } from "@/adapters/supabase/config";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import {
  weeklyCloseStateSchema,
  type WeeklyCloseStateDto,
} from "@/application/queries/weekly-close-dtos";

export const getWeeklyCloseState = cache(
  async (leagueSlug: string): Promise<WeeklyCloseStateDto | null> => {
    if (!isSupabaseConfigured()) return null;

    const supabase = await createSupabaseServerClient();
    const claims = await supabase.auth.getClaims();
    if (!claims.data?.claims?.sub) return null;

    const startedAt = performance.now();
    const result = await supabase.schema("api").rpc("get_weekly_close_state", {
      p_league_slug: leagueSlug,
    });

    if (result.error) {
      if (
        ["42501", "PGRST116", "PGRST202", "P0002"].includes(
          result.error.code ?? "",
        )
      ) {
        return null;
      }
      if (result.error.code === "55000") {
        throw queryFailure(
          "get_weekly_close_state",
          startedAt,
          result.error,
          "Season memory stopped because official competitive lineage is ambiguous.",
        );
      }
      throw queryFailure(
        "get_weekly_close_state",
        startedAt,
        result.error,
        "The active-season ledger could not be loaded.",
      );
    }

    return weeklyCloseStateSchema.parse(result.data);
  },
);
