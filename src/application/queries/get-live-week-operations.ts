import "server-only";

import { cache } from "react";
import { z } from "zod";
import { isSupabaseConfigured } from "@/adapters/supabase/config";
import { createSupabaseServerClient } from "@/adapters/supabase/server";

const liveEventResultSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  status: z.enum(["FINAL", "VOID"]),
  awayScore: z.number().int().nonnegative().nullable(),
  homeScore: z.number().int().nonnegative().nullable(),
  source: z.enum(["THE_ODDS_API", "MANUAL_OBJECTIVE"]),
  reason: z.string().min(3),
  recordedAt: z.string(),
});

const liveWeekOperationsSchema = z.object({
  weekState: z.enum(["PLANNED", "OPEN", "LOCKED", "PROVISIONAL", "FINAL"]),
  correctionWindowClosesAt: z.string().nullable(),
  latestImportAt: z.string().nullable(),
  events: z.array(
    z.object({
      id: z.uuid(),
      externalEventId: z.string().min(1),
      awayTeam: z.string().min(1),
      homeTeam: z.string().min(1),
      scheduledStartAt: z.string(),
      state: z.enum(["SCHEDULED", "LIVE", "FINAL", "VOID", "CORRECTED"]),
      canVoidAfterPostponement: z.boolean(),
      correctionCount: z.number().int().nonnegative(),
      result: liveEventResultSchema.nullable(),
    }),
  ),
});

export type LiveWeekOperations = z.infer<typeof liveWeekOperationsSchema>;

export const getLiveWeekOperations = cache(
  async (leagueSlug: string): Promise<LiveWeekOperations | null> => {
    if (!isSupabaseConfigured()) return null;

    const supabase = await createSupabaseServerClient();
    const claims = await supabase.auth.getClaims();
    if (!claims.data?.claims?.sub) return null;

    const result = await supabase
      .schema("api")
      .rpc("get_live_week_operations", { p_league_slug: leagueSlug });
    if (result.error) {
      if (
        ["42501", "PGRST116", "PGRST202", "P0002"].includes(
          result.error.code ?? "",
        )
      ) {
        return null;
      }
      throw new Error("Live week operations could not be loaded.");
    }
    if (result.data === null) return null;
    return liveWeekOperationsSchema.parse(result.data);
  },
);
