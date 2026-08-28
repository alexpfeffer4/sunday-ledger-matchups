import "server-only";

import { cache } from "react";
import { z } from "zod";
import { isSupabaseConfigured } from "@/adapters/supabase/config";
import { createSupabaseServerClient } from "@/adapters/supabase/server";

const liveRegularSeasonScheduleSchema = z.object({
  algorithmVersion: z.literal("circle-v1"),
  seed: z.string().min(16),
  outputHash: z.string().regex(/^[0-9a-f]{64}$/),
  publishedAt: z.string(),
  orderedEntryIds: z.array(z.uuid()).min(4).max(16),
  matchups: z.array(
    z.object({
      week: z.number().int().min(1).max(14),
      sideAEntryId: z.uuid(),
      sideAName: z.string().min(1),
      sideBEntryId: z.uuid(),
      sideBName: z.string().min(1),
    }),
  ),
});

export type LiveRegularSeasonSchedule = z.infer<
  typeof liveRegularSeasonScheduleSchema
>;

export const getLiveRegularSeasonSchedule = cache(
  async (leagueSlug: string): Promise<LiveRegularSeasonSchedule | null> => {
    if (!isSupabaseConfigured()) return null;

    const supabase = await createSupabaseServerClient();
    const claims = await supabase.auth.getClaims();
    if (!claims.data?.claims?.sub) return null;

    const result = await supabase
      .schema("api")
      .rpc("get_live_regular_season_schedule", {
        p_league_slug: leagueSlug,
      });
    if (result.error) {
      if (["42501", "PGRST116", "P0002"].includes(result.error.code ?? "")) {
        return null;
      }
      if (result.error.code === "PGRST202") return null;
      throw new Error("The published schedule could not be loaded.");
    }
    if (result.data === null) return null;
    return liveRegularSeasonScheduleSchema.parse(result.data);
  },
);
