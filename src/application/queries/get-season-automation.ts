import "server-only";
import { cache } from "react";
import { isSupabaseConfigured } from "@/adapters/supabase/config";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import { seasonAutomationSchema } from "@/application/automation/status";
export const getSeasonAutomation = cache(async (leagueSlug: string) => {
  if (!isSupabaseConfigured()) return null;
  const client = await createSupabaseServerClient();
  const { data, error } = await client
    .schema("api")
    .rpc("get_season_automation", { p_league_slug: leagueSlug });
  if (error) {
    if (["PGRST202", "42501", "P0002"].includes(error.code)) return null;
    throw new Error("Season automation could not be loaded.");
  }
  return data === null ? null : seasonAutomationSchema.parse(data);
});
