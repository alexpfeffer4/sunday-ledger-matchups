import { z } from "zod";
import { liveQuoteHeadsSchema } from "@/application/queries/stage1-dtos";

export const cardQuotePositionSchema = z.object({
  marketSnapshotId: z.uuid(),
  payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
  stakeCredits: z.number().int().min(50).max(1_000),
});
export const cardQuoteReviewSchema = z.object({
  reviewId: z.uuid(),
  reviewedAt: z.string(),
  expiresAt: z.string(),
  fetchedAt: z.string(),
  quotes: liveQuoteHeadsSchema,
});
export type CardQuoteReviewResult =
  | { status: "ready"; review: z.infer<typeof cardQuoteReviewSchema> }
  | { status: "disabled" }
  | { status: "error"; message: string };

export function quoteRecoveryMessage(code: string): string {
  if (/lock|not open|not available/i.test(code))
    return "Picks are closed or this card is no longer available. Your draft has been kept.";
  if (/QUOTE_REVIEW_EXPIRED|QUOTE_REVIEW_REQUIRED/i.test(code))
    return "Check current odds again before sealing. Your draft has been kept.";
  if (/QUOTE_CHANGED/i.test(code))
    return "Odds changed during confirmation. Check current odds and review the changes beside your picks.";
  if (/QUOTE_REFRESH_BUSY|QUOTE_REFRESH_COOLDOWN/i.test(code))
    return "Odds are being checked. Wait a moment, then check again. Your draft has been kept.";
  if (/QUOTE_REFRESH_BUDGET/i.test(code))
    return "Odds checks are temporarily paused. Try again later. Your draft has been kept.";
  if (/QUOTE_SOURCE_STALE/i.test(code))
    return "The latest odds response is still too old to verify. Try again later. Your draft has been kept.";
  return "We could not verify current odds. Nothing was sealed. Your draft has been kept; try again shortly.";
}
