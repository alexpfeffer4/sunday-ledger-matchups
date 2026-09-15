import "server-only";

import { z } from "zod";
import type { Json } from "@/adapters/supabase/database.types";
import type { createSupabaseServerClient } from "@/adapters/supabase/server";
import { refreshCardQuotes } from "@/adapters/providers/the-odds-api/refresh-card-quotes";
import { cardQuoteReviewSchema } from "@/application/providers/card-quote-review";
import type { AppActionState } from "./action-state";

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;
export type SubmissionPosition = {
  marketSnapshotId: string;
  payloadHash: string;
  stakeCredits: number;
  reviewId?: string;
};
const bindingSchema = z.object({
  intentId: z.uuid(),
  leagueId: z.uuid(),
  mode: z.enum(["LIVE", "SIMULATION"]),
  operationKey: z.string(),
  committed: z.boolean(),
  reset: z.boolean().optional().default(false),
  cardSealed: z.boolean().optional().default(false),
});
const renewalSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("UNCHANGED"),
    positions: z.array(
      z.object({
        marketSnapshotId: z.uuid(),
        payloadHash: z.string(),
        stakeCredits: z.number(),
        reviewId: z.uuid().optional(),
        intentId: z.uuid().optional(),
      }),
    ),
  }),
  z.object({
    status: z.literal("CHANGED"),
    changes: z.array(
      z.object({
        selectionKey: z.string(),
        label: z.string(),
        before: z.object({
          lineMilli: z.number().nullable(),
          americanOdds: z.number(),
        }),
        after: z
          .object({
            lineMilli: z.number().nullable(),
            americanOdds: z.number(),
          })
          .nullable(),
      }),
    ),
  }),
]);

export type SubmissionIntentResult =
  | { status: "accepted"; replayed: boolean }
  | { status: "reset" }
  | { status: "already-sealed" }
  | { status: "simulation"; operationKey: string; intentId: string }
  | { status: "error"; code: string }
  | {
      status: "changed";
      quoteReview: NonNullable<AppActionState["quoteReview"]>;
      quoteChanges: NonNullable<AppActionState["quoteChanges"]>;
    };

/** Called only by the explicit Submit action. Network work never owns consent,
 * and there is at most one renewal pass. The SQL command decides acceptance. */
export async function submitCardIntent(
  client: Client,
  input: {
    leagueSlug: string;
    submissionId: string;
    positions: SubmissionPosition[];
  },
): Promise<SubmissionIntentResult> {
  const api = client.schema("api");
  const bound = await api.rpc("bind_card_submission_intent", {
    p_league_slug: input.leagueSlug,
    p_intent_id: input.submissionId,
    p_positions: input.positions as unknown as Json,
  });
  if (bound.error) return { status: "error", code: bound.error.message };
  const binding = bindingSchema.parse(bound.data);
  // Authorization and exact consent comparison already happened in the RPC.
  // Do this before any refresh, quote read, expiry or current-week check.
  if (binding.reset) return { status: "reset" };
  if (binding.committed) return { status: "accepted", replayed: true };
  if (binding.cardSealed) return { status: "already-sealed" };
  if (binding.mode === "SIMULATION")
    return {
      status: "simulation",
      operationKey: binding.operationKey,
      intentId: binding.intentId,
    };
  const positions = input.positions.map((position, index) => ({
    ...position,
    ...(index === 0 ? { intentId: binding.intentId } : {}),
  }));
  const accept = (batch: Json) =>
    api.rpc("accept_stage1_card", {
      p_league_slug: input.leagueSlug,
      p_positions: batch,
      p_idempotency_key: binding.operationKey,
    });
  const first = await accept(positions as unknown as Json);
  if (!first.error && isResetSubmission(first.data)) return { status: "reset" };
  if (!first.error) return { status: "accepted", replayed: false };
  // A timeout may have happened after commit. Recover before provider work.
  const recovered = await api.rpc("bind_card_submission_intent", {
    p_league_slug: input.leagueSlug,
    p_intent_id: input.submissionId,
    p_positions: input.positions as unknown as Json,
  });
  if (recovered.error)
    return { status: "error", code: recovered.error.message };
  const recovery = bindingSchema.parse(recovered.data);
  if (recovery.reset) return { status: "reset" };
  if (recovery.committed) return { status: "accepted", replayed: true };
  if (recovery.cardSealed) return { status: "already-sealed" };
  if (
    !/QUOTE_(REVIEW_EXPIRED|REVIEW_REQUIRED|CHANGED|SOURCE_STALE)|quote is stale/i.test(
      first.error.message,
    )
  ) {
    return { status: "error", code: first.error.message };
  }
  try {
    await refreshCardQuotes(binding.leagueId, input.positions);
    const reviewed = await api.rpc("review_live_card_quotes", {
      p_league_slug: input.leagueSlug,
      p_positions: input.positions.map(
        ({ marketSnapshotId, payloadHash, stakeCredits }) => ({
          marketSnapshotId,
          payloadHash,
          stakeCredits,
        }),
      ),
    });
    if (reviewed.error)
      return { status: "error", code: reviewed.error.message };
    const review = cardQuoteReviewSchema.parse(reviewed.data);
    const validated = await api.rpc("revalidate_card_submission_intent", {
      p_intent_id: input.submissionId,
      p_review_id: review.reviewId,
    });
    if (validated.error)
      return { status: "error", code: validated.error.message };
    const renewed = renewalSchema.parse(validated.data);
    if (renewed.status === "CHANGED")
      return {
        status: "changed",
        quoteReview: review,
        quoteChanges: renewed.changes,
      };
    const accepted = await accept(renewed.positions as unknown as Json);
    if (!accepted.error && isResetSubmission(accepted.data))
      return { status: "reset" };
    if (!accepted.error) return { status: "accepted", replayed: false };
    // One final recovery read; never another fetch/review or automatic retry loop.
    const last = await api.rpc("bind_card_submission_intent", {
      p_league_slug: input.leagueSlug,
      p_intent_id: input.submissionId,
      p_positions: input.positions as unknown as Json,
    });
    if (!last.error) {
      const recovery = bindingSchema.parse(last.data);
      if (recovery.reset) return { status: "reset" };
      if (recovery.committed) return { status: "accepted", replayed: true };
      if (recovery.cardSealed) return { status: "already-sealed" };
    }
    return {
      status: "error",
      code: last.error?.message ?? accepted.error.message,
    };
  } catch (error) {
    return {
      status: "error",
      code: error instanceof Error ? error.message : "QUOTE_REFRESH_FAILED",
    };
  }
}

/** A superseded acceptance remains in audit but is no longer an active bet. */
export function isResetSubmission(value: unknown): boolean {
  return z.object({ status: z.literal("RESET") }).safeParse(value).success;
}
