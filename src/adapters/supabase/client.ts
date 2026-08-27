import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/adapters/supabase/config";
import type { Database } from "@/adapters/supabase/database.types";

export function createSupabaseBrowserClient() {
  const { url, publishableKey } = getSupabasePublicConfig();
  return createBrowserClient<Database, "api">(url, publishableKey, {
    db: { schema: "api" },
  });
}
