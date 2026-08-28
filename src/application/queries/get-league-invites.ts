import "server-only";

import { cache } from "react";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import {
  leagueInviteSummarySchema,
  type LeagueInviteSummary,
} from "@/application/queries/league-invite-dtos";

export const getLeagueInvites = cache(
  async (leagueSlug: string): Promise<LeagueInviteSummary[]> => {
    const supabase = await createSupabaseServerClient();
    const result = await supabase
      .schema("api")
      .rpc("list_league_invites", { p_league_slug: leagueSlug });

    if (result.error) {
      if (["42501", "PGRST202"].includes(result.error.code ?? "")) return [];
      throw new Error("League invitations could not be loaded.");
    }

    return leagueInviteSummarySchema.array().parse(result.data);
  },
);
