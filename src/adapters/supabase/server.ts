import "server-only";

import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "@/adapters/supabase/config";
import type { Database } from "@/adapters/supabase/database.types";

export async function createSupabaseServerClient(
  onCookiesToSet?: SetAllCookies,
) {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabasePublicConfig();

  return createServerClient<Database, "api">(url, publishableKey, {
    db: { schema: "api" },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, headers) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot write cookies. The request Proxy refreshes
          // sessions before protected content renders.
        }
        return onCookiesToSet?.(cookiesToSet, headers);
      },
    },
  });
}
