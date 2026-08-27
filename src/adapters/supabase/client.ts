import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/adapters/supabase/config";

export function createSupabaseBrowserClient() {
  const { url, publishableKey } = getSupabasePublicConfig();
  return createBrowserClient(url, publishableKey);
}
