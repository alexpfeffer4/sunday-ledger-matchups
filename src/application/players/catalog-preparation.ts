import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import { getSupabasePublicConfig } from "@/adapters/supabase/config";
import { getSupabaseServerSecret } from "@/adapters/supabase/server-secret";
import {
  fetchApiSportsCatalog,
  fetchApiSportsQuotaStatus,
} from "@/adapters/providers/api-sports/client";
import { fetchNflverseCatalog } from "@/adapters/providers/nflverse/catalog-client";
import { acquirePlayerCatalogQuotes } from "@/adapters/providers/the-odds-api/catalog-quotes";
import {
  executePlayerCatalogJob,
  type CatalogProgress,
} from "@/application/players/catalog-runner";

/** Explicit commissioner Prepare queues the published slate, then advances the
 * same durable work used by the protected scheduler. Page reads do not call it. */
export async function runPlayerCatalogPreparation(
  leagueSlug: string,
): Promise<CatalogProgress> {
  const user = await createSupabaseServerClient();
  const queued = await user.rpc("enqueue_player_catalog", {
    p_league_slug: leagueSlug,
  });
  if (queued.error) throw new Error("PLAYER_CATALOG_PREPARATION_UNAVAILABLE");
  const parsed = z
    .object({
      status: z.enum(["READY", "PENDING", "DISABLED", "UNAVAILABLE"]),
      weekId: z.uuid().optional(),
      missingSources: z.number().int().nonnegative(),
    })
    .parse(queued.data);
  if (parsed.status !== "PENDING" || !parsed.weekId)
    return { status: parsed.status, missingSources: parsed.missingSources };
  return processPendingPlayerCatalog(parsed.weekId);
}

/** Server-only scheduler entry. Missing key/policy leaves queued work pending;
 * this function never enables policies, changes subscriptions or accepts cards. */
export async function processPendingPlayerCatalog(
  weekId?: string,
): Promise<CatalogProgress> {
  const secret = getSupabaseServerSecret();
  if (!secret) return { status: "DISABLED", missingSources: 1 };
  const admin = createClient(getSupabasePublicConfig().url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.any([
            AbortSignal.timeout(8_000),
            ...(init?.signal ? [init.signal] : []),
          ]),
        }),
    },
  }).schema("api");
  return executePlayerCatalogJob(
    {
      rpc: async (name, args) => {
        const response = await admin.rpc(name, args);
        return { data: response.data, error: response.error };
      },
    },
    {
      api: fetchApiSportsCatalog,
      quota: fetchApiSportsQuotaStatus,
      nflverse: fetchNflverseCatalog,
      quotes: acquirePlayerCatalogQuotes,
    },
    weekId,
  );
}
