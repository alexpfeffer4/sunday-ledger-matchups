import type { Stage1StateDto } from "@/application/queries/stage1-dtos";
import {
  restoreCardDrafts,
  type RestoredCardDraft,
} from "./card-draft-storage";
import { sameSelection } from "./selection-identity";

type Slate = Stage1StateDto["slate"];

/** Review covers selected outcomes, not a full board. An absent outcome is not
 * a withdrawal. Full stored-board replacement stays with passive updates.
 * Identity/restoration own economic consent; this operation never accepts it.
 */
export function reconcileReviewedQuotes(
  slate: Slate,
  drafts: RestoredCardDraft[],
  quotes: readonly { eventId: string; markets: Slate[number]["markets"] }[],
) {
  const byEvent = new Map(
    quotes.map((event) => [event.eventId, event.markets]),
  );
  const nextSlate = slate.map((event) => {
    const fresh = byEvent.get(event.id);
    if (!fresh) return event;
    return {
      ...event,
      markets: [
        ...event.markets.filter(
          (market) =>
            !fresh.some(
              (quote) =>
                sameSelection(
                  { ...quote, eventId: event.id },
                  { ...market, eventId: event.id },
                ) && quote.outcomeKey === market.outcomeKey,
            ),
        ),
        ...fresh,
      ],
    };
  });
  const nextDrafts = restoreCardDrafts(
    JSON.stringify({ version: 1, drafts }),
    nextSlate,
  ).map((draft) => ({
    ...draft,
    // A new observation with identical economics retains the existing consent.
    reviewedPayloadHash: draft.quoteReviewRequired
      ? draft.reviewedPayloadHash
      : draft.payloadHash,
  }));
  return {
    slate: nextSlate,
    drafts: nextDrafts,
    allDraftsRetained: nextDrafts.length === drafts.length,
  };
}
