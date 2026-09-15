/** Economic selection identity excludes changing lines, prices and quote evidence. */
export type SelectionIdentity = {
  eventId: string;
  marketType: string;
  subjectId?: string | null;
  statistic?: string | null;
  period?: string | null;
};

export function selectionIdentityKey(selection: SelectionIdentity): string {
  return selection.subjectId
    ? `${selection.eventId}:${selection.subjectId}:${selection.statistic ?? ""}:${selection.period ?? ""}`
    : `${selection.eventId}:${selection.marketType}`;
}
