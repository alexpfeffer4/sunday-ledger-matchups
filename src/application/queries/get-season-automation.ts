import "server-only";
import { queryFailure } from "./query-failure";
import { cache } from "react";
import { isSupabaseConfigured } from "@/adapters/supabase/config";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import { seasonAutomationSchema } from "@/application/automation/status";
export const getSeasonAutomation = cache(async (leagueSlug: string) => {
  if (!isSupabaseConfigured()) return null;
  const client = await createSupabaseServerClient();
  const startedAt = performance.now();
  const { data, error } = await client
    .schema("api")
    .rpc("get_season_automation", { p_league_slug: leagueSlug });
  if (error) {
    if (["PGRST202", "42501", "P0002"].includes(error.code)) return null;
    throw queryFailure(
      "get_season_automation",
      startedAt,
      error,
      "Season automation could not be loaded.",
    );
  }
  if (data === null) return null;
  const parsed = seasonAutomationSchema.safeParse(data);
  if (!parsed.success)
    throw queryFailure(
      "get_season_automation",
      startedAt,
      {},
      "Season automation status could not be confirmed.",
    );
  return parsed.data;
});

// Used only after the page's commissioner authorization. Unknown stays unknown
// while independent operating controls remain available; no fallback enrollment.
export const getCommissionerAutomationStatus = cache(
  async (leagueSlug: string) => {
    try {
      return await getSeasonAutomation(leagueSlug);
    } catch {
      return null;
    }
  },
);
