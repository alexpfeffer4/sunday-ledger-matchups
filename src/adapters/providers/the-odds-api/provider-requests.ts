import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  fetchNflOdds,
  fetchNflScores,
} from "@/adapters/providers/the-odds-api/client";
import { getSupabasePublicConfig } from "@/adapters/supabase/config";
import { getSupabaseServerSecret } from "@/adapters/supabase/server-secret";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import type { Database, Json } from "@/adapters/supabase/database.types";

function providerClient() {
  const secret = getSupabaseServerSecret();
  if (!secret || !process.env.ODDS_API_KEY)
    throw new Error("PROVIDER_UNCONFIGURED");
  return createClient<Database>(getSupabasePublicConfig().url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function fetchBudgetedNflOdds(
  leagueId: string,
  eventIds?: string[],
) {
  const admin = providerClient();
  const user = await createSupabaseServerClient();
  const claimed = await user
    .schema("api")
    .rpc("claim_provider_odds_request", { p_league_id: leagueId });
  if (claimed.error) throw new Error(claimed.error.message);
  const requestId = z.uuid().parse(claimed.data);
  let remaining: number | null = null;
  let succeeded = false;
  try {
    const imported = await fetchNflOdds({
      eventIds,
      onUsage: (value) => {
        remaining = value;
      },
    });
    succeeded = true;
    return imported;
  } finally {
    const completed = await admin
      .schema("api")
      .rpc("complete_provider_request", {
        p_request_id: requestId,
        p_import: succeeded ? {} : null,
        p_requests_remaining: remaining ?? undefined,
      });
    if (completed.error)
      throw new Error(
        "Provider usage could not be recorded. Retry after the request lease expires.",
      );
  }
}

const claimSchema = z.discriminatedUnion("status", [
  z.object({ status: z.enum(["DISABLED", "IDLE", "BUSY"]) }),
  z.object({
    status: z.literal("CLAIMED"),
    leaseId: z.uuid(),
    eventIds: z.array(z.string()).min(1).max(32),
  }),
]);

/** Called by the authenticated checkpoint endpoint or an explicit commissioner
 * action. Browser refresh never reaches this adapter. No participant reads. */
export async function refreshLiveScores(leagueId?: string) {
  const admin = providerClient();
  const claimed = leagueId
    ? await (
        await createSupabaseServerClient()
      )
        .schema("api")
        .rpc("claim_live_score_refresh", { p_league_id: leagueId })
    : await admin.schema("api").rpc("claim_scheduled_score_refresh");
  if (claimed.error) throw new Error(claimed.error.message);
  const claim = claimSchema.parse(claimed.data);
  if (claim.status !== "CLAIMED")
    return { status: claim.status, eventCount: 0 };
  let remaining: number | null = null;
  try {
    const imported = await fetchNflScores({
      eventIds: claim.eventIds,
      onUsage: (value) => {
        remaining = value;
      },
    });
    const completed = await admin
      .schema("api")
      .rpc("complete_provider_request", {
        p_request_id: claim.leaseId,
        p_import: imported as unknown as Json,
        p_requests_remaining: remaining ?? undefined,
      });
    if (completed.error) throw new Error(completed.error.message);
    return z
      .object({
        status: z.enum(["SUCCEEDED", "PARTIAL", "FAILED"]),
        eventCount: z.number().int().nonnegative(),
      })
      .parse(completed.data);
  } catch (error) {
    await admin.schema("api").rpc("complete_provider_request", {
      p_request_id: claim.leaseId,
      p_import: null,
      p_requests_remaining: remaining ?? undefined,
    });
    throw error;
  }
}
