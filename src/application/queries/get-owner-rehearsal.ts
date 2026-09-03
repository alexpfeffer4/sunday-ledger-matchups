import "server-only";

import { cache } from "react";
import { z } from "zod";
import { isSupabaseConfigured } from "@/adapters/supabase/config";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import { ownerRehearsalCheckpoints } from "@/domain/rehearsal/owner-rehearsal";

const ownerRehearsalSchema = z.object({
  leagueName: z.string(),
  leagueSlug: z.string(),
  checkpoint: z.enum(ownerRehearsalCheckpoints),
  checkpointOrdinal: z.number().int().min(0).max(22),
  totalCheckpoints: z.literal(22),
  generation: z.number().int().positive(),
  botCount: z.number().int().min(0).max(9),
  currentWeek: z.number().int().min(1).max(18).nullable(),
  weekState: z
    .enum(["PLANNED", "OPEN", "LOCKED", "PROVISIONAL", "FINAL"])
    .nullable(),
  lifecycle: z.enum([
    "DRAFT",
    "REGULAR",
    "PLAYOFFS",
    "CHAMPION_FINAL",
    "WEEK_18_EXHIBITION",
    "FINAL",
  ]),
  ownerCardSealed: z.boolean(),
  ownerCardChoice: z.enum(["MANUAL", "SAMPLE"]).nullable(),
  quoteReviewPending: z.boolean(),
  startedAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type OwnerRehearsalSummary = z.infer<typeof ownerRehearsalSchema>;

export const hasOwnerRehearsalEntitlement = cache(
  async (): Promise<boolean> => {
    if (!isSupabaseConfigured()) return false;
    const supabase = await createSupabaseServerClient();
    const claims = await supabase.auth.getClaims();
    if (!claims.data?.claims?.sub) return false;
    const result = await supabase
      .schema("api")
      .rpc("has_owner_rehearsal_entitlement");
    return result.error === null && result.data === true;
  },
);

export const getOwnerRehearsal = cache(
  async (): Promise<OwnerRehearsalSummary | null> => {
    if (!(await hasOwnerRehearsalEntitlement())) return null;
    const supabase = await createSupabaseServerClient();
    const result = await supabase.schema("api").rpc("get_owner_rehearsal");
    if (result.error) {
      if (["42501", "PGRST202"].includes(result.error.code ?? "")) return null;
      throw new Error("The owner rehearsal could not be loaded.");
    }
    return result.data === null
      ? null
      : ownerRehearsalSchema.parse(result.data);
  },
);

export async function getOwnerRehearsalForLeague(
  leagueSlug: string,
): Promise<OwnerRehearsalSummary | null> {
  const rehearsal = await getOwnerRehearsal();
  return rehearsal?.leagueSlug === leagueSlug ? rehearsal : null;
}
