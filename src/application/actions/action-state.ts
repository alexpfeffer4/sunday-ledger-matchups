import type { CardQuoteReviewResult } from "@/application/providers/card-quote-review";

export type AppActionState = {
  status: "idle" | "success" | "error";
  message: string;
  href?: string;
  hrefLabel?: string;
  value?: string;
  requiresConfirmation?: boolean;
  quoteReview?: Extract<CardQuoteReviewResult, { status: "ready" }>["review"];
  quoteChanges?: Array<{
    selectionKey: string;
    label: string;
    before: { lineMilli: number | null; americanOdds: number };
    after: { lineMilli: number | null; americanOdds: number } | null;
  }>;
};

export const initialAppActionState: AppActionState = {
  status: "idle",
  message: "",
};
