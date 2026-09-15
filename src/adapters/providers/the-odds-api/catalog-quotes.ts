import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabasePublicConfig } from "@/adapters/supabase/config";
import { getSupabaseServerSecret } from "@/adapters/supabase/server-secret";
import type { Database, Json } from "@/adapters/supabase/database.types";
import {
  propFamilySchema,
  propQuoteImportSchema,
  type PropQuoteImport,
} from "@/application/providers/player-prop-quotes";
import { fetchNflPlayerProps, type OddsUsage } from "./client";

const factsSchema = z.object({
  imports: z.array(propQuoteImportSchema),
  pending: z.boolean(),
});
const claimSchema = z.discriminatedUnion("status", [
  z.object({ status: z.enum(["DISABLED", "CACHED", "LIMIT"]) }),
  z.object({
    status: z.literal("WAIT"),
    retryAfterMs: z.number().int().min(0).max(3000),
  }),
  z.object({
    status: z.literal("CLAIMED"),
    requestId: z.uuid(),
    externalEventId: z.string().min(1),
    families: z.array(propFamilySchema).min(1).max(3),
  }),
]);

/** The leased catalog worker discovers public book identities before a menu
 * exists. SQL derives eligible published events and caps each job lease at two
 * paid requests. Twelve-hour identity progress never renews live quote proofs. */
export async function acquirePlayerCatalogQuotes(
  weekId: string,
): Promise<{ imports: PropQuoteImport[]; pending: boolean }> {
  const secret = getSupabaseServerSecret();
  if (!secret) return { imports: [], pending: true };
  const admin = createClient<Database>(getSupabasePublicConfig().url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  async function readFacts() {
    const result = await admin.schema("api").rpc("get_player_catalog_quotes", {
      p_week_id: weekId,
    });
    if (result.error) throw new Error(result.error.message);
    return factsSchema.parse(result.data);
  }
  const cached = await readFacts();
  if (!cached.pending || !process.env.ODDS_API_KEY) return cached;
  const deadline = Date.now() + 25_000;
  let waited = false;
  let requests = 0;
  while (requests < 2 && Date.now() + 12_000 < deadline) {
    const claimed = await admin
      .schema("api")
      .rpc("claim_player_catalog_quote", {
        p_week_id: weekId,
      });
    // A spent budget preserves accumulated identity facts for the next tick.
    if (claimed.error) break;
    const claim = claimSchema.parse(claimed.data);
    if (claim.status === "WAIT") {
      if (waited || claim.retryAfterMs === 0) break;
      waited = true;
      await new Promise((resolve) => setTimeout(resolve, claim.retryAfterMs));
      continue;
    }
    if (claim.status !== "CLAIMED") break;
    requests += 1;
    let usage: OddsUsage = { remaining: null, used: null, last: null };
    try {
      const imported = await fetchNflPlayerProps({
        externalEventId: claim.externalEventId,
        families: claim.families,
        onUsageDetail: (value) => {
          usage = value;
        },
      });
      const completed = await admin
        .schema("api")
        .rpc("complete_shared_quote_request", {
          p_request_id: claim.requestId,
          p_import: imported as unknown as Json,
          p_usage: usage,
        });
      if (completed.error) throw new Error(completed.error.message);
      if (
        z.object({ status: z.string() }).parse(completed.data).status !==
        "SUCCEEDED"
      )
        break;
    } catch {
      await admin.schema("api").rpc("complete_shared_quote_request", {
        p_request_id: claim.requestId,
        p_import: null,
        p_usage: usage,
      });
      break;
    }
  }
  return readFacts();
}
