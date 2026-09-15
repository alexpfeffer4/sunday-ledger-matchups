import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/adapters/supabase/config";
import { getSupabaseServerSecret } from "@/adapters/supabase/server-secret";
import { executePlayerSourceSmoke } from "@/application/players/source-smoke-runner";
import {
  fetchApiSportsBoxScore,
  fetchApiSportsCatalog,
  fetchApiSportsQuotaStatus,
} from "./client";

export async function checkPlayerSourceSmoke(operationKey: string) {
  const secret = getSupabaseServerSecret();
  if (!secret || !process.env.API_SPORTS_NFL_KEY)
    return { status: "UNCONFIGURED" } as const;
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
  return executePlayerSourceSmoke(
    {
      rpc: async (name, args) => {
        const result = await admin.rpc(name, args);
        return { data: result.data, error: result.error };
      },
    },
    {
      quota: fetchApiSportsQuotaStatus,
      catalog: fetchApiSportsCatalog,
      boxScore: fetchApiSportsBoxScore,
    },
    operationKey,
  );
}
