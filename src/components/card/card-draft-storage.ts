import { sameSelection } from "@/components/card/selection-identity";
import type { Stage1StateDto } from "@/application/queries/stage1-dtos";

type SlateMarket = Stage1StateDto["slate"][number]["markets"][number];

export type RestoredCardDraft = {
  subjectId?: string | null;
  subjectLabel?: string | null;
  statistic?: "PASSING_YARDS" | "RUSHING_YARDS" | "RECEIVING_YARDS" | null;
  period?: "FULL_GAME" | null;
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
      | "subjectId"
      | "subjectLabel"
      | "statistic"
      | "period"
      | "marketSnapshotId"
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

const validMarketTypes = [
  "MONEYLINE",
  "SPREAD",
  "TOTAL",
  "PLAYER_PASSING_YARDS",
  "PLAYER_RUSHING_YARDS",
  "PLAYER_RECEIVING_YARDS",
] as const;
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
        !Number.isSafeInteger(draft.reviewedAmericanOdds) ||
        draft.reviewedAmericanOdds === 0 ||
        typeof draft.reviewedPayloadHash !== "string" ||
        typeof draft.reviewedProposition !== "string" ||
        !Number.isSafeInteger(draft.stakeCredits) ||
        draft.stakeCredits <= 0 ||
        (draft.marketType.startsWith("PLAYER_") &&
          (typeof draft.subjectId !== "string" ||
            !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
              draft.subjectId,
            ) ||
            draft.period !== "FULL_GAME" ||
            !["PASSING_YARDS", "RUSHING_YARDS", "RECEIVING_YARDS"].includes(
              draft.statistic ?? "",
            )))
      ) {
        return [];
      }
      const event = slate.find((candidate) => candidate.id === draft.eventId);
      const market = event?.markets.find(
        (candidate) =>
          sameSelection({ ...candidate, eventId: draft.eventId }, draft) &&
          candidate.outcomeKey === draft.outcomeKey,
      );
      if (!event || !market)
        return [
          {
            subjectId: draft.subjectId,
            subjectLabel: draft.subjectLabel,
            statistic: draft.statistic,
            period: draft.period,
            americanOdds: draft.reviewedAmericanOdds,
            eventId: draft.eventId,
            marketSnapshotId:
              draft.marketSnapshotId ??
              `unavailable:${draft.eventId}:${draft.marketType}`,
            marketType: draft.marketType,
            outcomeKey: draft.outcomeKey,
            payloadHash: draft.reviewedPayloadHash,
            proposition: draft.reviewedProposition,
            quoteReviewRequired: true,
            reviewedAmericanOdds: draft.reviewedAmericanOdds,
            reviewedPayloadHash: draft.reviewedPayloadHash,
            reviewedProposition: draft.reviewedProposition,
            stakeCredits: draft.stakeCredits,
          },
        ];

      return [
        {
          subjectId: market.subjectId,
          subjectLabel: market.subjectLabel,
          statistic: market.statistic,
          period: market.period,
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
