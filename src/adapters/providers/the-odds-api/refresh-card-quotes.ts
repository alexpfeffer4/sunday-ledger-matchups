import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  fetchNflOdds,
  fetchNflPlayerProps,
  type OddsUsage,
} from "@/adapters/providers/the-odds-api/client";
import { getSupabasePublicConfig } from "@/adapters/supabase/config";
import { getSupabaseServerSecret } from "@/adapters/supabase/server-secret";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import { propFamilySchema } from "@/application/providers/player-prop-quotes";
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
export async function refreshCardQuotes(
  leagueId: string,
  positions?: readonly { marketSnapshotId: string }[],
) {
  if (positions) return refreshSelectedCardQuotes(leagueId, positions);
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

const selectedPlanSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("DISABLED") }),
  z.object({
    status: z.literal("PLANNED"),
    planId: z.uuid(),
    requestIds: z.array(z.uuid()).min(1).max(64),
  }),
]);
const requestClaimSchema = z.discriminatedUnion("status", [
  z.object({ status: z.enum(["DISABLED", "CACHED"]) }),
  z.object({
    status: z.literal("WAIT"),
    retryAfterMs: z.number().int().min(1).max(3000),
  }),
  z.object({
    status: z.literal("CLAIMED"),
    kind: z.enum(["MAIN", "PROPS"]),
    requestId: z.uuid(),
    eventIds: z.array(z.string()).min(1).max(32),
    families: z.array(z.string()).min(1).max(3),
  }),
]);

/** Bound the whole explicit action to90s. Four in-flight calls, a database-owned
 *3s global launch interval,10s HTTP timeouts and25s individual leases support
 *the maximum17 fresh requests without treating a45s old league lease as a batch.
 *A partial failure keeps useful public cache but never submits a partial batch. */
async function refreshSelectedCardQuotes(
  leagueId: string,
  positions:
    | readonly { marketSnapshotId: string }[]
    | { playerMenu: true; eventId?: string },
) {
  const secret = getSupabaseServerSecret();
  if (!secret) throw new Error("QUOTE_REFRESH_UNCONFIGURED");
  const user = await createSupabaseServerClient();
  const planned = await user.schema("api").rpc("plan_live_quote_refresh", {
    p_league_id: leagueId,
    p_positions: positions as unknown as Json,
  });
  if (planned.error) throw new Error(planned.error.message);
  const plan = selectedPlanSchema.parse(planned.data);
  if (plan.status === "DISABLED") return "DISABLED" as const;
  const readyPlan = plan;
  const admin = createClient<Database>(getSupabasePublicConfig().url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const deadline = Date.now() + 90_000;
  let next = 0;
  let failure: unknown;
  async function worker() {
    while (!failure && next < readyPlan.requestIds.length) {
      const requestId = readyPlan.requestIds[next++];
      try {
        while (!failure) {
          // Leave enough time for one HTTP timeout plus persistence; no new work
          // launches after the action budget, and no detached tasks outlive it.
          if (Date.now() + 12_000 >= deadline)
            throw new Error("QUOTE_REFRESH_BUSY");
          const claimed = await admin
            .schema("api")
            .rpc("claim_shared_quote_request", {
              p_plan_id: readyPlan.planId,
              p_request_id: requestId,
            });
          if (claimed.error) throw new Error(claimed.error.message);
          const claim = requestClaimSchema.parse(claimed.data);
          if (claim.status === "CACHED") break;
          if (claim.status === "DISABLED")
            throw new Error("QUOTE_REFRESH_DISABLED");
          if (claim.status === "WAIT") {
            await new Promise((resolve) =>
              setTimeout(resolve, claim.retryAfterMs),
            );
            continue;
          }
          if (claim.status !== "CLAIMED")
            throw new Error("QUOTE_REFRESH_LEASE_INVALID");
          let usage: OddsUsage = { remaining: null, used: null, last: null };
          try {
            const onUsageDetail = (value: OddsUsage) => {
              usage = value;
            };
            const imported =
              claim.kind === "MAIN"
                ? await fetchNflOdds({
                    eventIds: claim.eventIds,
                    onUsageDetail,
                  })
                : await fetchNflPlayerProps({
                    externalEventId: z
                      .array(z.string())
                      .length(1)
                      .parse(claim.eventIds)[0],
                    families: z
                      .array(propFamilySchema)
                      .min(1)
                      .max(3)
                      .parse(claim.families),
                    onUsageDetail,
                  });
            const completed = await admin
              .schema("api")
              .rpc("complete_shared_quote_request", {
                p_request_id: requestId,
                p_import: imported as unknown as Json,
                p_usage: usage,
              });
            if (completed.error) throw new Error(completed.error.message);
            if (
              z.object({ status: z.string() }).parse(completed.data).status !==
              "SUCCEEDED"
            )
              throw new Error("QUOTE_REFRESH_LEASE_INVALID");
          } catch (error) {
            await admin.schema("api").rpc("complete_shared_quote_request", {
              p_request_id: requestId,
              p_import: null,
              p_usage: usage,
            });
            throw error;
          }
          break;
        }
      } catch (error) {
        failure ??= error;
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(4, readyPlan.requestIds.length) }, worker),
  );
  if (failure) throw failure;
  const applied = await user
    .schema("api")
    .rpc("apply_live_quote_plan", { p_plan_id: readyPlan.planId });
  if (applied.error) throw new Error(applied.error.message);
  return "REFRESHED" as const;
}

/** Explicit commissioner action after confirming the full player menu. Also
 * retrieves newly available quotes for already frozen, unchanged identities. */
export async function refreshPlayerMenuQuotes(
  leagueId: string,
  eventId?: string,
) {
  return refreshSelectedCardQuotes(leagueId, {
    playerMenu: true,
    ...(eventId ? { eventId } : {}),
  });
}
