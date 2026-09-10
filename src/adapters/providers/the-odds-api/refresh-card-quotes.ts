import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { fetchNflOdds } from "@/adapters/providers/the-odds-api/client";
import { getSupabasePublicConfig } from "@/adapters/supabase/config";
import { getSupabaseServerSecret } from "@/adapters/supabase/server-secret";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import type { Database, Json } from "@/adapters/supabase/database.types";

const claimSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("DISABLED") }),
  z.object({ status: z.literal("CACHED") }),
  z.object({
    status: z.literal("CLAIMED"),
    leaseId: z.uuid(),
    eventIds: z.array(z.string()).min(1).max(32),
  }),
]);

/** Explicit review/commissioner requests share the database lease and quota.
 * No render, browser timer, or participant query calls the provider.
 */
export async function refreshCardQuotes(leagueId: string) {
  const user = await createSupabaseServerClient();
  const claimed = await user.schema("api").rpc("claim_live_quote_refresh", {
    p_league_id: leagueId,
  });
  if (claimed.error) throw new Error(claimed.error.message);
  const claim = claimSchema.parse(claimed.data);
  if (claim.status !== "CLAIMED") return claim.status;

  // This privileged client exists only inside the provider persistence adapter.
  // It never reads participant data or accepts cards on a member's behalf.
  const secret = getSupabaseServerSecret();
  if (!secret) throw new Error("QUOTE_REFRESH_UNCONFIGURED");
  const admin = createClient<Database>(getSupabasePublicConfig().url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let remaining: number | null = null;
  try {
    const imported = await fetchNflOdds({
      eventIds: claim.eventIds,
      onUsage: (value) => {
        remaining = value;
      },
    });
    const completed = await admin
      .schema("api")
      .rpc("complete_live_quote_refresh", {
        p_lease_id: claim.leaseId,
        p_import: imported as unknown as Json,
        p_requests_remaining: remaining ?? undefined,
      });
    if (completed.error) throw new Error(completed.error.message);
    return "REFRESHED" as const;
  } catch (error) {
    // A failed completion rolls back the entire import/head update. Conservatively
    // keep its reserved quota even when a timeout makes the actual charge unknown.
    await admin.schema("api").rpc("complete_live_quote_refresh", {
      p_lease_id: claim.leaseId,
      p_import: null,
      p_requests_remaining: remaining ?? undefined,
    });
    throw error;
  }
}
