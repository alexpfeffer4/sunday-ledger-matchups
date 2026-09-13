type PublishedEvent = {
  key: string;
  awayTeam: string;
  homeTeam: string;
  scheduledStartAt: string;
};
type ProviderEvent = {
  externalEventId: string;
  awayTeam: string;
  homeTeam: string;
  scheduledStartAt: string;
};

/** Whitelist public event identity fields for operator diagnostics. Do not log
 * provider payloads, scores, quotes, cards, authentication or participant data. */
export function scoreEventMismatches(
  published: readonly PublishedEvent[],
  received: readonly ProviderEvent[],
) {
  const expected = new Map(published.map((event) => [event.key, event]));
  return received
    .flatMap((event) => {
      const original = expected.get(event.externalEventId);
      if (
        !original ||
        (original.awayTeam === event.awayTeam &&
          original.homeTeam === event.homeTeam &&
          new Date(original.scheduledStartAt).getTime() ===
            new Date(event.scheduledStartAt).getTime())
      )
        return [];
      return [
        {
          eventId: event.externalEventId,
          published: {
            awayTeam: original.awayTeam,
            homeTeam: original.homeTeam,
            scheduledStartAt: original.scheduledStartAt,
          },
          provider: {
            awayTeam: event.awayTeam,
            homeTeam: event.homeTeam,
            scheduledStartAt: event.scheduledStartAt,
          },
        },
      ];
    })
    .slice(0, 4);
}

export type { PublishedEvent };
