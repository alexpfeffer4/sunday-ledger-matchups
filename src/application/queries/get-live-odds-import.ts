import "server-only";

import { cache } from "react";
import { z } from "zod";
import { isSupabaseConfigured } from "@/adapters/supabase/config";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import { liveProviderEventSchema } from "@/application/providers/live-odds";

const databaseTimestampSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());

export const liveOddsImportReviewSchema = z.object({
  importId: z.uuid(),
  source: z.literal("THE_ODDS_API"),
  fetchedAt: databaseTimestampSchema,
  importedAt: databaseTimestampSchema,
  eventCount: z.number().int().positive(),
  payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
  events: z.array(liveProviderEventSchema).min(1),
});

export type LiveOddsImportReview = z.infer<typeof liveOddsImportReviewSchema>;

export const getLiveOddsImport = cache(
  async (leagueSlug: string): Promise<LiveOddsImportReview | null> => {
    if (!isSupabaseConfigured()) return null;

    const supabase = await createSupabaseServerClient();
    const claims = await supabase.auth.getClaims();
    if (!claims.data?.claims?.sub) return null;

    const result = await supabase.schema("api").rpc("get_live_odds_import", {
      p_league_slug: leagueSlug,
    });
    if (result.error) {
      if (["42501", "P0002", "PGRST202"].includes(result.error.code ?? "")) {
        return null;
      }
      throw new Error("The live odds import could not be loaded.");
    }
    if (result.data === null) return null;
    return liveOddsImportReviewSchema.parse(result.data);
  },
);
