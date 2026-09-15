import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/adapters/supabase/database.types";
import { getSupabasePublicConfig } from "@/adapters/supabase/config";
import { getSupabaseServerSecret } from "@/adapters/supabase/server-secret";
import { fetchOddsEntitlementUsage } from "./client";

const usageSchema = z.object({
  remaining: z.number().int().nonnegative().max(2_147_483_647),
  used: z.number().int().nonnegative().max(2_147_483_647),
  last: z.literal(0),
});

/** Explicit release check for a newly configured server key. The database lease
 * excludes all paid calls; this only reads the fixed, zero-credit /sports API.
 * Recording proof never raises caps, resets usage, or enables any workers. */
export async function checkOddsAccount() {
  const secret = getSupabaseServerSecret();
  if (!secret || !process.env.ODDS_API_KEY)
    return { status: "UNCONFIGURED" } as const;
  const admin = createClient<Database>(getSupabasePublicConfig().url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const claimed = await admin.schema("api").rpc("claim_odds_account_probe");
  if (claimed.error) throw new Error("Odds account check lease unavailable.");
  const claim = z
    .discriminatedUnion("status", [
      z.object({ status: z.literal("IDLE") }),
      z.object({ status: z.literal("CLAIMED"), probeId: z.uuid() }),
    ])
    .parse(claimed.data);
  if (claim.status === "IDLE") return { status: "DEFERRED" } as const;
  try {
    const usage = usageSchema.parse(await fetchOddsEntitlementUsage());
    const completed = await admin
      .schema("api")
      .rpc("complete_odds_account_probe", {
        p_probe_id: claim.probeId,
        p_usage: usage,
      });
    if (completed.error) throw new Error("Odds account proof unavailable.");
    return z
      .discriminatedUnion("status", [
        usageSchema.extend({
          status: z.literal("READY"),
          observedAt: z.iso.datetime({ offset: true }),
        }),
        z.object({ status: z.literal("UNAVAILABLE") }),
      ])
      .parse(completed.data);
  } catch {
    await admin.schema("api").rpc("complete_odds_account_probe", {
      p_probe_id: claim.probeId,
      p_usage: null,
    });
    return { status: "UNAVAILABLE" } as const;
  }
}
