import "server-only";

import { cache } from "react";
import { z } from "zod";
import { isSupabaseConfigured } from "@/adapters/supabase/config";
import { createSupabaseServerClient } from "@/adapters/supabase/server";

const week17CorrectionOperationsSchema = z.object({
  weekState: z.literal("FINAL"),
  pairingPublished: z.boolean(),
  pairingReplaceable: z.boolean().nullable(),
  events: z.array(
    z.object({
      id: z.uuid(),
      externalEventId: z.string().min(1),
      awayTeam: z.string().min(1),
      homeTeam: z.string().min(1),
      scheduledStartAt: z.string(),
      correctionCount: z.number().int().nonnegative(),
      result: z.object({
        id: z.uuid(),
        version: z.number().int().positive(),
        status: z.enum(["FINAL", "VOID"]),
        awayScore: z.number().int().nonnegative().nullable(),
        homeScore: z.number().int().nonnegative().nullable(),
        source: z.enum(["THE_ODDS_API", "MANUAL_OBJECTIVE"]),
        reason: z.string().min(3),
        recordedAt: z.string(),
      }),
    }),
  ),
});

export type Week17CorrectionOperations = z.infer<
  typeof week17CorrectionOperationsSchema
>;

export const getWeek17CorrectionOperations = cache(
  async (leagueSlug: string): Promise<Week17CorrectionOperations | null> => {
    if (!isSupabaseConfigured()) return null;
    const supabase = await createSupabaseServerClient();
    const claims = await supabase.auth.getClaims();
    if (!claims.data?.claims?.sub) return null;
    const result = await supabase
      .schema("api")
      .rpc("get_week17_correction_operations", {
        p_league_slug: leagueSlug,
      });
    if (result.error) {
      if (["42501", "P0002", "PGRST202"].includes(result.error.code ?? "")) {
        return null;
      }
      throw new Error("Week 17 correction controls could not be loaded.");
    }
    if (result.data === null) return null;
    return week17CorrectionOperationsSchema.parse(result.data);
  },
);
