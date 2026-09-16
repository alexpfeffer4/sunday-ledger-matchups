import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/adapters/supabase/config";
import { getSupabaseServerSecret } from "@/adapters/supabase/server-secret";
import {
  fetchNflOdds,
  fetchNflPlayerProps,
} from "@/adapters/providers/the-odds-api/client";
import { propFamilySchema } from "@/application/providers/player-prop-quotes";
import { executeBackgroundQuotes } from "./background-runner";
export async function processBackgroundQuotes() {
  const secret = getSupabaseServerSecret();
  if (!secret) return { status: "DISABLED", fetched: 0, applied: 0, failed: 0 };
  const deadline = AbortSignal.timeout(48_000);
  const admin = createClient(getSupabasePublicConfig().url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.any([
            deadline,
            AbortSignal.timeout(6000),
            ...(init?.signal ? [init.signal] : []),
          ]),
        }),
    },
  }).schema("api");
  return executeBackgroundQuotes({
    rpc: async (name, args) => {
      const { data, error } = await admin.rpc(name, args);
      return { data, error };
    },
    fetch: (claim, onUsageDetail) =>
      claim.kind === "MAIN"
        ? fetchNflOdds({ eventIds: claim.eventIds, onUsageDetail })
        : fetchNflPlayerProps({
            externalEventId: claim.eventIds[0],
            families: claim.families.map((family) =>
              propFamilySchema.parse(family),
            ),
            onUsageDetail,
          }),
  });
}
