"use server";

import { z } from "zod";
import {
  resolveSeasonCardRules,
  usesRollingSubmissions,
} from "@/rulesets/card-rules";
import { refreshCardQuotes } from "@/adapters/providers/the-odds-api/refresh-card-quotes";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import {
  cardQuotePositionSchema,
  cardQuoteReviewSchema,
  quoteRecoveryMessage,
  type CardQuoteReviewResult,
} from "@/application/providers/card-quote-review";
import { liveQuoteHeadsSchema } from "@/application/queries/stage1-dtos";
import { getCardReviewContext } from "@/application/queries/get-card-review-context";

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
    return { status: "error", message: "Choose at least one bet to review." };
  try {
    const state = await getCardReviewContext(input.data.leagueSlug);
    if (
      !state?.week ||
      !state.ownerCard ||
      state.ownerCard.remainingCredits === 0
    )
      throw new Error("Card not available");
    const resolved = resolveSeasonCardRules(
      state.season.rulesetSnapshot,
      state.league.mode,
    );
    if (!resolved.supported)
      return { status: "error", message: resolved.message };
    const { card } = resolved.rules;
    const rolling = usesRollingSubmissions(resolved.rules);
    if (
      (!rolling && state.week.state !== "OPEN") ||
      (rolling &&
        (state.week.entryClosed ||
          ["PLANNED", "FINAL"].includes(state.week.state)))
    )
      throw new Error("Card not available");
    const submittedCount = rolling ? state.ownerCard.positionCount : 0;
    const submittedCredits = rolling ? state.ownerCard.allocatedCredits : 0;
    const batchCredits = input.data.positions.reduce(
      (sum, p) => sum + p.stakeCredits,
      0,
    );
    if (
      input.data.positions.length < card.minimumPositions ||
      input.data.positions.length + submittedCount > card.maximumPositions ||
      input.data.positions.some(
        (p) => p.stakeCredits < card.minimumStakeCredits,
      ) ||
      (rolling
        ? batchCredits + submittedCredits > card.weeklyAllocationCredits
        : batchCredits !== card.weeklyAllocationCredits)
    )
      return {
        status: "error",
        message: rolling
          ? "Review a valid batch within your remaining credits and weekly bet limit."
          : "Review a complete card under these season rules first.",
      };
    if (state.league.mode === "SIMULATION") {
      if (!rolling) return { status: "disabled" };
      const user = await createSupabaseServerClient();
      const result = await user
        .schema("api")
        .rpc("prepare_simulation_card_quotes", {
          p_league_slug: input.data.leagueSlug,
        });
      if (result.error) throw new Error(result.error.message);
      const prepared = z
        .object({ quotes: liveQuoteHeadsSchema })
        .parse(result.data);
      return { status: "simulation", quotes: prepared.quotes };
    }
    const refreshed = await refreshCardQuotes(
      state.league.id,
      input.data.positions,
    );
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
