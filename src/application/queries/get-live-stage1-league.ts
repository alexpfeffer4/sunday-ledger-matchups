import "server-only";
import { queryFailure } from "./query-failure";

import { cache } from "react";
import { isSupabaseConfigured } from "@/adapters/supabase/config";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import { getOwnerRehearsalForLeague } from "@/application/queries/get-owner-rehearsal";
import { withVerifiedRulesetHash } from "@/rulesets/verify-snapshot";
import { getPlayerPropMenu } from "./get-player-prop-menu";
import {
  liveQuoteHeadsSchema,
  stage1StateSchema,
  type Stage1StateDto,
} from "@/application/queries/stage1-dtos";

// Base authorized state is shared by the shell and pages within this request.
// Published event status and owner receipts remain present; no menu/quote refresh.
export const getLeagueState = cache(
  async (leagueSlug: string): Promise<Stage1StateDto | null> => {
    if (!isSupabaseConfigured()) return null;

    const supabase = await createSupabaseServerClient();
    const claims = await supabase.auth.getClaims();
    if (!claims.data?.claims?.sub) return null;

    const startedAt = performance.now();
    const result = await supabase.schema("api").rpc("get_stage1_state", {
      p_league_slug: leagueSlug,
    });

    if (result.error) {
      if (["42501", "PGRST116", "P0002"].includes(result.error.code ?? "")) {
        return null;
      }
      throw queryFailure(
        "get_stage1_state",
        startedAt,
        result.error,
        "The league could not be loaded.",
      );
    }

    const state = stage1StateSchema.parse(result.data);
    state.season.rulesetSnapshot = await withVerifiedRulesetHash(
      state.season.rulesetSnapshot,
    );
    return state;
  },
);

export const getAuthoritativeLeagueState = cache(
  async (
    leagueSlug: string,
    projection: "quotes" | "quotes-and-props" = "quotes-and-props",
  ): Promise<Stage1StateDto | null> => {
    const state = await getLeagueState(leagueSlug);
    if (!state?.week) return state;
    const supabase = await createSupabaseServerClient();
    // These stored reads share the same authorized league/week prerequisite.
    // Neither one acquires provider data or depends on the other's response.
    const quoteStartedAt = performance.now();
    const [menu, currentQuotes] = await Promise.all([
      // Matchup/My Card need current prices for draft status, but do not show
      // the selectable prop catalog. Keep their quote freshness unchanged.
      projection === "quotes-and-props" && state.week.propsEnabled
        ? getPlayerPropMenu(leagueSlug)
        : null,
      (async () => {
        if (
          state.league.mode === "SIMULATION" &&
          !state.week!.rollingSubmissionsEnabled &&
          !(await getOwnerRehearsalForLeague(leagueSlug))
        )
          return null;
        return supabase.schema("api").rpc("get_live_quote_heads", {
          p_league_slug: leagueSlug,
        });
      })(),
    ]);
    // Never mutate the request-cached base used by the shell/history callers.
    const enriched =
      menu && menu.weekId === state.week.id
        ? {
            ...state,
            slate: state.slate.map((event) => ({
              ...event,
              playerProps: menu.slots
                .filter((slot) => slot.eventId === event.id)
                .map((slot) => {
                  const publicSlot = { ...slot };
                  delete publicSlot.candidates;
                  return publicSlot;
                }),
            })),
          }
        : state;
    if (!currentQuotes) return enriched;
    if (currentQuotes.error) {
      if (currentQuotes.error.code === "PGRST202") return enriched;
      throw queryFailure(
        "get_live_quote_heads",
        quoteStartedAt,
        currentQuotes.error,
        "The current NFL quotes could not be loaded.",
      );
    }

    const heads = liveQuoteHeadsSchema.parse(currentQuotes.data);
    if (heads.length === 0) return enriched;
    const marketsByEvent = new Map(
      heads.map((event) => [event.eventId, event.markets] as const),
    );

    return {
      ...enriched,
      slate: enriched.slate.map((event) => ({
        ...event,
        markets: marketsByEvent.get(event.id) ?? event.markets,
      })),
    };
  },
);

/** @deprecated Use the mode-neutral authoritative query. */
export const getLiveStage1League = getAuthoritativeLeagueState;
