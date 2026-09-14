import "server-only";

import { cache } from "react";
import { z } from "zod";
import { createSupabaseServerClient } from "@/adapters/supabase/server";

const commissionerCardStatusSchema = z.object({
  weekId: z.uuid(),
  nflWeek: z.number().int().min(1).max(18),
  rollingSubmissionsEnabled: z.boolean().optional(),
  cards: z
    .array(
      z.object({
        entryId: z.uuid(),
        displayName: z.string(),
        sealed: z.boolean().nullable(),
      }),
    )
    .max(16),
});

export type CommissionerCardStatus = z.infer<
  typeof commissionerCardStatusSchema
>;

// Called only by the commissioner page, never by shared member projections.
// The database independently checks the current commissioner's membership.
export const getCommissionerCardStatus = cache(
  async (leagueSlug: string): Promise<CommissionerCardStatus | null> => {
    const supabase = await createSupabaseServerClient();
    const result = await supabase
      .schema("api")
      .rpc("get_commissioner_card_status", { p_league_slug: leagueSlug });
    if (result.error || result.data === null) return null;
    const parsed = commissionerCardStatusSchema.safeParse(result.data);
    return parsed.success ? parsed.data : null;
  },
);
