import "server-only";
import { queryFailure } from "./query-failure";
import { cache } from "react";
import { isSupabaseConfigured } from "@/adapters/supabase/config";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import { playerPropMenuSchema } from "./player-prop-dtos";

export const getPlayerPropMenu = cache(async (leagueSlug: string) => {
  if (!isSupabaseConfigured()) return null;
  const client = await createSupabaseServerClient();
  const startedAt = performance.now();
  const result = await client.schema("api").rpc("get_player_prop_menu", {
    p_league_slug: leagueSlug,
  });
  if (result.error) {
    if (["PGRST202", "42501", "P0002"].includes(result.error.code ?? ""))
      return null;
    throw queryFailure(
      "get_player_prop_menu",
      startedAt,
      result.error,
      "The player menu could not be loaded.",
    );
  }
  return playerPropMenuSchema.parse(result.data);
});
