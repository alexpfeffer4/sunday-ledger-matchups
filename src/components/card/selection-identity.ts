/** Local draft identity mirrors the accepted market identity, never its quote. */
export type SelectionIdentity = {
  eventId: string;
  marketType: string;
  subjectId?: string | null;
  statistic?: string | null;
  period?: string | null;
};

export { selectionIdentityKey as selectionKey } from "@/domain/cards/selection-identity";
import { selectionIdentityKey } from "@/domain/cards/selection-identity";

export function sameSelection(
  a: SelectionIdentity,
  b: SelectionIdentity,
): boolean {
  return selectionIdentityKey(a) === selectionIdentityKey(b);
}

export const marketLabels = {
  MONEYLINE: "Winner",
  SPREAD: "Spread",
  TOTAL: "Total",
  PLAYER_PASSING_YARDS: "Passing yards",
  PLAYER_RUSHING_YARDS: "Rushing yards",
  PLAYER_RECEIVING_YARDS: "Receiving yards",
} as const;

export function marketLabel(type: string): string {
  return marketLabels[type as keyof typeof marketLabels] ?? "Player prop";
}
