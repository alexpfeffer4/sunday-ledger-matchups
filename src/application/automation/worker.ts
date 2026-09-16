import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/adapters/supabase/config";
import { getSupabaseServerSecret } from "@/adapters/supabase/server-secret";
import { fetchNflOdds } from "@/adapters/providers/the-odds-api/client";
import { fetchNflverseSchedule } from "@/adapters/providers/nflverse/catalog-client";
import { executeSeasonAutomation } from "./runner";

export async function processSeasonAutomation() {
  const secret = getSupabaseServerSecret();
  if (!secret) return { status: "DISABLED", attempted: 0, failed: 0 };
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
  // Reserve up to sixteen seconds for usage/completion RPCs after HTTP work.
  const acquisitionDeadline = AbortSignal.timeout(40_000);
  return executeSeasonAutomation({
    rpc: async (name, args) => {
      const { data, error } = await admin.rpc(name, args);
      return { data, error };
    },
    schedule: (season) => fetchNflverseSchedule(season, acquisitionDeadline),
    odds: (onUsage) =>
      fetchNflOdds({
        onUsage,
        fetchImpl: (input, init) =>
          fetch(input, {
            ...init,
            signal: AbortSignal.any([
              acquisitionDeadline,
              ...(init?.signal ? [init.signal] : []),
            ]),
          }),
      }),
  });
}
