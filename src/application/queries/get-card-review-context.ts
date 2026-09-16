import "server-only";
import { z } from "zod";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import { isSupabaseConfigured } from "@/adapters/supabase/config";
import { withVerifiedRulesetHash } from "@/rulesets/verify-snapshot";
import { getLeagueState } from "./get-live-stage1-league";

const reviewContextSchema = z.object({
  league: z.object({ id: z.uuid(), mode: z.enum(["LIVE", "SIMULATION"]) }),
  season: z.object({ rulesetSnapshot: z.unknown() }),
  week: z
    .object({
      state: z.enum(["PLANNED", "OPEN", "LOCKED", "PROVISIONAL", "FINAL"]),
      entryClosed: z.boolean(),
    })
    .nullable(),
  ownerCard: z
    .object({
      remainingCredits: z.number().int().nonnegative(),
      allocatedCredits: z.number().int().nonnegative(),
      positionCount: z.number().int().nonnegative(),
    })
    .nullable(),
});

export async function getCardReviewContext(leagueSlug: string) {
  if (!isSupabaseConfigured()) return null;
  const client = await createSupabaseServerClient();
  const claims = await client.auth.getClaims();
  if (!claims.data?.claims?.sub) return null;
  const result = await client.schema("api").rpc("get_card_review_context", {
    p_league_slug: leagueSlug,
  });
  // Compatible Preview/rolling deployment before the additive RPC is installed.
  // Only a missing function permits fallback; authorization errors never do.
  if (result.error?.code === "PGRST202") {
    const state = await getLeagueState(leagueSlug);
    if (!state) return null;
    return reviewContextSchema.parse({
      league: state.league,
      season: state.season,
      week: state.week && {
        ...state.week,
        entryClosed: state.week.entryClosed ?? false,
      },
      ownerCard: state.ownerCard && {
        ...state.ownerCard,
        positionCount: state.ownerCard.positions.length,
      },
    });
  }
  if (result.error) {
    if (["42501", "28000", "P0002"].includes(result.error.code ?? ""))
      return null;
    throw new Error("Your card could not be loaded for review.");
  }
  const state = reviewContextSchema.parse(result.data);
  state.season.rulesetSnapshot = await withVerifiedRulesetHash(
    state.season.rulesetSnapshot,
  );
  return state;
}
