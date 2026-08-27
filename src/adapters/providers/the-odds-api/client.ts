import "server-only";

import { normalizeTheOddsApiOdds } from "@/adapters/providers/the-odds-api/normalize";
import type { LiveOddsImport } from "@/application/providers/live-odds";

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

export async function fetchNflOdds(options?: {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  fetchedAt?: string;
}): Promise<LiveOddsImport> {
  const apiKey = options?.apiKey ?? process.env.ODDS_API_KEY;
  if (!apiKey) {
    throw new OddsProviderRequestError(
      "The Odds API is not configured for this environment.",
    );
  }

  const url = new URL(nflOddsUrl);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("bookmakers", "draftkings");
  url.searchParams.set("markets", "h2h,spreads,totals");
  url.searchParams.set("oddsFormat", "american");
  url.searchParams.set("dateFormat", "iso");

  const fetchImpl = options?.fetchImpl ?? fetch;
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

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new OddsProviderRequestError(
      "The Odds API response was not valid JSON.",
    );
  }

  return normalizeTheOddsApiOdds(
    payload,
    options?.fetchedAt ?? new Date().toISOString(),
  );
}
