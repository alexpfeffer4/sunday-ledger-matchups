"use server";

import { z } from "zod";
import { resolveSeasonCardRules } from "@/rulesets/card-rules";
import { refreshCardQuotes } from "@/adapters/providers/the-odds-api/refresh-card-quotes";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import {
  cardQuotePositionSchema,
  cardQuoteReviewSchema,
  quoteRecoveryMessage,
  type CardQuoteReviewResult,
} from "@/application/providers/card-quote-review";
import { getAuthoritativeLeagueState } from "@/application/queries/get-live-stage1-league";

export async function reviewLiveCardQuotes(
  leagueSlug: string,
  positions: unknown,
): Promise<CardQuoteReviewResult> {
  const input = z
    .object({
      leagueSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      positions: z.array(cardQuotePositionSchema).min(1).max(100),
    })
    .safeParse({ leagueSlug, positions });
  if (!input.success)
    return { status: "error", message: "Review a complete card first." };
  try {
    const state = await getAuthoritativeLeagueState(input.data.leagueSlug);
    if (
      !state?.week ||
      !state.ownerCard ||
      state.league.mode !== "LIVE" ||
      state.week.state !== "OPEN" ||
      state.ownerCard.remainingCredits === 0
    )
      throw new Error("Card not available");
    const resolved = resolveSeasonCardRules(state.season.rulesetSnapshot, state.league.mode);
    if (!resolved.supported) return { status: "error", message: resolved.message };
    const { card } = resolved.rules;
    if (input.data.positions.length < card.minimumPositions || input.data.positions.length > card.maximumPositions ||
        input.data.positions.some(p => p.stakeCredits < card.minimumStakeCredits) ||
        input.data.positions.reduce((sum, p) => sum + p.stakeCredits, 0) !== card.weeklyAllocationCredits)
      return { status: "error", message: "Review a complete card under these season rules first." };
    const refreshed = await refreshCardQuotes(state.league.id);
    if (refreshed === "DISABLED") return { status: "disabled" };
    const user = await createSupabaseServerClient();
    const result = await user.schema("api").rpc("review_live_card_quotes", {
      p_league_slug: input.data.leagueSlug,
      p_positions: input.data.positions,
    });
    if (result.error) throw new Error(result.error.message);
    return {
      status: "ready",
      review: cardQuoteReviewSchema.parse(result.data),
    };
  } catch (error) {
    return {
      status: "error",
      message: quoteRecoveryMessage(
        error instanceof Error ? error.message : "",
      ),
    };
  }
}
