import "server-only";

import {
  normalizeTheOddsApiOdds,
  OddsProviderPayloadError,
  selectNearestNflSlateEventIds,
} from "@/adapters/providers/the-odds-api/normalize";
import type { LiveOddsImport } from "@/application/providers/live-odds";

const nflEventsUrl =
  "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events";
const nflOddsUrl =
  "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds";

export class OddsProviderRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OddsProviderRequestError";
  }
}

export function isOddsProviderConfigured(): boolean {
  return Boolean(process.env.ODDS_API_KEY);
}

async function fetchProviderJson(
  url: URL,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new OddsProviderRequestError(
      "The Odds API request failed before a response was received.",
    );
  }

  if (!response.ok) {
    throw new OddsProviderRequestError(
      `The Odds API request failed with status ${response.status}.`,
    );
  }

  try {
    return await response.json();
  } catch {
    throw new OddsProviderRequestError(
      "The Odds API response was not valid JSON.",
    );
  }
}

export async function fetchNflOdds(options?: {
  apiKey?: string;
  eventIds?: string[];
  fetchImpl?: typeof fetch;
  fetchedAt?: string;
}): Promise<LiveOddsImport> {
  const apiKey = options?.apiKey ?? process.env.ODDS_API_KEY;
  if (!apiKey) {
    throw new OddsProviderRequestError(
      "The Odds API is not configured for this environment.",
    );
  }

  const fetchImpl = options?.fetchImpl ?? fetch;
  const requestedEventIds = options?.eventIds;
  if (
    requestedEventIds &&
    (requestedEventIds.length < 1 ||
      requestedEventIds.length > 32 ||
      new Set(requestedEventIds).size !== requestedEventIds.length ||
      requestedEventIds.some((eventId) => eventId.trim().length === 0))
  ) {
    throw new OddsProviderRequestError(
      "A quote refresh requires 1 through 32 unique event identifiers.",
    );
  }

  let eventIds = requestedEventIds;
  if (!eventIds) {
    const eventsUrl = new URL(nflEventsUrl);
    eventsUrl.searchParams.set("apiKey", apiKey);
    eventsUrl.searchParams.set("dateFormat", "iso");
    const discoveryPayload = await fetchProviderJson(eventsUrl, fetchImpl);
    eventIds = selectNearestNflSlateEventIds(discoveryPayload);
  }

  const oddsUrl = new URL(nflOddsUrl);
  oddsUrl.searchParams.set("apiKey", apiKey);
  oddsUrl.searchParams.set("bookmakers", "draftkings");
  oddsUrl.searchParams.set("markets", "h2h,spreads,totals");
  oddsUrl.searchParams.set("oddsFormat", "american");
  oddsUrl.searchParams.set("dateFormat", "iso");
  oddsUrl.searchParams.set("eventIds", eventIds.join(","));
  const payload = await fetchProviderJson(oddsUrl, fetchImpl);

  const liveImport = normalizeTheOddsApiOdds(
    payload,
    options?.fetchedAt ?? new Date().toISOString(),
  );
  const selectedEventIds = new Set(eventIds);
  if (
    liveImport.events.some(
      (event) => !selectedEventIds.has(event.externalEventId),
    )
  ) {
    throw new OddsProviderPayloadError(
      "The Odds API returned an event outside the selected NFL slate.",
    );
  }
  if (
    requestedEventIds &&
    (liveImport.events.length !== requestedEventIds.length ||
      requestedEventIds.some(
        (eventId) =>
          !liveImport.events.some(
            (providerEvent) => providerEvent.externalEventId === eventId,
          ),
      ))
  ) {
    throw new OddsProviderPayloadError(
      "The Odds API did not return the complete published NFL slate.",
    );
  }
  return liveImport;
}
