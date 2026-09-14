import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/adapters/supabase/database.types";
import { getSupabasePublicConfig } from "@/adapters/supabase/config";
import { getSupabaseServerSecret } from "@/adapters/supabase/server-secret";
import { fetchOddsEntitlementUsage } from "./client";

/** Scheduled operations call this cheaply. SQL disables it until verified paid
 * entitlement is configured, permits one/hour and excludes paid calls in flight.
 * The public sports-directory endpoint consumes zero Odds API credits. */
export async function reconcileOddsEntitlement() {
  const secret = getSupabaseServerSecret();
  if (!secret || !process.env.ODDS_API_KEY) return "IDLE" as const;
  const admin = createClient<Database>(getSupabasePublicConfig().url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const claimed = await admin.schema("api").rpc("claim_odds_entitlement_probe");
  if (claimed.error) throw new Error(claimed.error.message);
  const claim = z
    .discriminatedUnion("status", [
      z.object({ status: z.literal("IDLE") }),
      z.object({ status: z.literal("CLAIMED"), probeId: z.uuid() }),
    ])
    .parse(claimed.data);
  if (claim.status === "IDLE") return "IDLE" as const;
  try {
    const usage = await fetchOddsEntitlementUsage();
    const completed = await admin
      .schema("api")
      .rpc("complete_odds_entitlement_probe", {
        p_probe_id: claim.probeId,
        p_usage: usage,
      });
    if (completed.error) throw new Error(completed.error.message);
    return z
      .object({ status: z.enum(["SUCCEEDED", "FAILED", "IGNORED"]) })
      .parse(completed.data).status;
  } catch {
    // A failed free probe never increases remaining quota or resets app usage.
    await admin.schema("api").rpc("complete_odds_entitlement_probe", {
      p_probe_id: claim.probeId,
      p_usage: null,
    });
    return "FAILED" as const;
  }
}
