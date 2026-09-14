import type { Stage1StateDto } from "./stage1-dtos";

export type SelectedGame = {
  eventId: string;
  eventLabel: string;
  scheduledStartAt: string;
};

/** Receives only a server-authorized game projection, never hidden receipts. */
export function distinctUnrevealedGames(
  games: readonly SelectedGame[] | undefined,
  slate: Stage1StateDto["slate"],
): SelectedGame[] {
  const events = new Map(slate.map((event) => [event.id, event]));
  const distinct = new Map<string, SelectedGame>();
  for (const game of games ?? []) {
    const event = events.get(game.eventId);
    // Scheduled time alone never constitutes actual-start evidence.
    if (!event || event.actualStartedAt || event.state !== "SCHEDULED")
      continue;
    distinct.set(game.eventId, {
      eventId: game.eventId,
      eventLabel: game.eventLabel,
      scheduledStartAt: game.scheduledStartAt,
    });
  }
  return [...distinct.values()].sort(
    (a, b) =>
      a.scheduledStartAt.localeCompare(b.scheduledStartAt) ||
      a.eventId.localeCompare(b.eventId),
  );
}

export function rollingSubmissionStatus(
  submitted: boolean | null | undefined,
  entryClosed: boolean,
): string {
  if (submitted === true) return "Submitted";
  if (submitted === false)
    return entryClosed ? "No bets submitted" : "Not submitted";
  return "Status unavailable";
}
