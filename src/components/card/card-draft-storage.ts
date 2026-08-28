import type { Stage1StateDto } from "@/application/queries/stage1-dtos";

type SlateMarket = Stage1StateDto["slate"][number]["markets"][number];

export type RestoredCardDraft = {
  americanOdds: number;
  eventId: string;
  marketSnapshotId: string;
  marketType: SlateMarket["marketType"];
  outcomeKey: SlateMarket["outcomeKey"];
  payloadHash: string;
  proposition: string;
  quoteReviewRequired: boolean;
  reviewedAmericanOdds: number;
  reviewedPayloadHash: string;
  reviewedProposition: string;
  stakeCredits: number;
};

export type StoredCardDraft = {
  drafts: Array<
    Pick<
      RestoredCardDraft,
      | "eventId"
      | "marketType"
      | "outcomeKey"
      | "reviewedAmericanOdds"
      | "reviewedPayloadHash"
      | "reviewedProposition"
      | "stakeCredits"
    >
  >;
  version: 1;
};

const validMarketTypes = ["MONEYLINE", "SPREAD", "TOTAL"] as const;
const validOutcomeKeys = ["AWAY", "HOME", "OVER", "UNDER"] as const;

export function restoreCardDrafts(
  value: string | null,
  slate: Stage1StateDto["slate"],
): RestoredCardDraft[] {
  if (!value) return [];

  try {
    const stored = JSON.parse(value) as StoredCardDraft;
    if (stored.version !== 1 || !Array.isArray(stored.drafts)) return [];

    return stored.drafts.flatMap((draft) => {
      if (
        !draft ||
        typeof draft.eventId !== "string" ||
        !validMarketTypes.includes(draft.marketType) ||
        !validOutcomeKeys.includes(draft.outcomeKey) ||
        !Number.isInteger(draft.reviewedAmericanOdds) ||
        typeof draft.reviewedPayloadHash !== "string" ||
        typeof draft.reviewedProposition !== "string" ||
        !Number.isInteger(draft.stakeCredits) ||
        draft.stakeCredits <= 0
      ) {
        return [];
      }
      const event = slate.find((candidate) => candidate.id === draft.eventId);
      const market = event?.markets.find(
        (candidate) =>
          candidate.marketType === draft.marketType &&
          candidate.outcomeKey === draft.outcomeKey,
      );
      if (!event || !market) return [];

      return [
        {
          americanOdds: market.americanOdds,
          eventId: event.id,
          marketSnapshotId: market.id,
          marketType: market.marketType,
          outcomeKey: market.outcomeKey,
          payloadHash: market.payloadHash,
          proposition: market.proposition,
          quoteReviewRequired:
            draft.reviewedPayloadHash !== market.payloadHash ||
            market.qualityStatus !== "HEALTHY",
          reviewedAmericanOdds: draft.reviewedAmericanOdds,
          reviewedPayloadHash: draft.reviewedPayloadHash,
          reviewedProposition: draft.reviewedProposition,
          stakeCredits: draft.stakeCredits,
        },
      ];
    });
  } catch {
    return [];
  }
}
