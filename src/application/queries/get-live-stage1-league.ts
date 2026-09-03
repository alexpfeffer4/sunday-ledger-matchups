import "server-only";

import { cache } from "react";
import { isSupabaseConfigured } from "@/adapters/supabase/config";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import {
  liveQuoteHeadsSchema,
  stage1StateSchema,
  type Stage1StateDto,
} from "@/application/queries/stage1-dtos";

export const getAuthoritativeLeagueState = cache(
  async (leagueSlug: string): Promise<Stage1StateDto | null> => {
    if (!isSupabaseConfigured()) return null;

    const supabase = await createSupabaseServerClient();
    const claims = await supabase.auth.getClaims();
    if (!claims.data?.claims?.sub) return null;

    const result = await supabase.schema("api").rpc("get_stage1_state", {
      p_league_slug: leagueSlug,
    });

    if (result.error) {
      if (["42501", "PGRST116", "P0002"].includes(result.error.code ?? "")) {
        return null;
      }
      throw new Error("The league could not be loaded.");
    }

    const state = stage1StateSchema.parse(result.data);
    if (!state.week) return state;

    const currentQuotes = await supabase
      .schema("api")
      .rpc("get_live_quote_heads", { p_league_slug: leagueSlug });
    if (currentQuotes.error) {
      if (currentQuotes.error.code === "PGRST202") return state;
      throw new Error("The current NFL quotes could not be loaded.");
    }

    const heads = liveQuoteHeadsSchema.parse(currentQuotes.data);
    if (heads.length === 0) return state;
    const marketsByEvent = new Map(
      heads.map((event) => [event.eventId, event.markets] as const),
    );

    return {
      ...state,
      slate: state.slate.map((event) => ({
        ...event,
        markets: marketsByEvent.get(event.id) ?? event.markets,
      })),
    };
  },
);

/** @deprecated Use the mode-neutral authoritative query. */
export const getLiveStage1League = getAuthoritativeLeagueState;
