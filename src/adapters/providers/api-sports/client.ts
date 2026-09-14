import "server-only";
import { z } from "zod";

const quotaStatusSchema = z.object({
  response: z.object({
    subscription: z.object({ active: z.boolean() }),
    requests: z.object({
      current: z.number().int().nonnegative(),
      limit_day: z.number().int().positive(),
    }),
  }),
});

/** Official quota-free endpoint. Discard all account/PII fields at this boundary. */
export async function fetchApiSportsQuotaStatus() {
  const key = process.env.API_SPORTS_NFL_KEY;
  if (!key) throw new Error("PLAYER_STATISTICS_UNCONFIGURED");
  const response = await fetch(
    "https://v1.american-football.api-sports.io/status",
    {
      headers: { "x-apisports-key": key, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!response.ok) throw new Error("PLAYER_STATISTICS_STATUS_UNAVAILABLE");
  const parsed = quotaStatusSchema.parse(await response.json());
  return {
    active: parsed.response.subscription.active,
    dailyLimit: parsed.response.requests.limit_day,
    used: parsed.response.requests.current,
    observedAt: new Date().toISOString(),
  };
}

export type StatisticsUsage = {
  remaining: number | null;
  rateLimit: number | null;
  retryAfterSeconds: number | null;
};
function positiveHeader(headers: Headers, name: string) {
  const value = headers.get(name);
  return value !== null && /^\d+$/.test(value) ? Number(value) : null;
}
export async function fetchApiSportsBoxScore(
  gameId: string,
  onUsage: (usage: StatisticsUsage) => void,
) {
  const key = process.env.API_SPORTS_NFL_KEY;
  if (!key) throw new Error("PLAYER_STATISTICS_UNCONFIGURED");
  if (!/^\d+$/.test(gameId)) throw new Error("INVALID_STATISTICS_GAME_ID");
  const url = new URL(
    "https://v1.american-football.api-sports.io/games/statistics/players",
  );
  url.searchParams.set("id", gameId);
  const response = await fetch(url, {
    headers: { "x-apisports-key": key, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  onUsage({
    remaining: positiveHeader(
      response.headers,
      "x-ratelimit-requests-remaining",
    ),
    rateLimit: positiveHeader(response.headers, "x-ratelimit-limit"),
    retryAfterSeconds:
      response.status === 429
        ? (positiveHeader(response.headers, "retry-after") ?? 60)
        : null,
  });
  if (!response.ok) throw new Error("PLAYER_STATISTICS_PROVIDER_UNAVAILABLE");
  const text = await response.text();
  if (text.length > 4_000_000)
    throw new Error("PLAYER_STATISTICS_RESPONSE_TOO_LARGE");
  const fetchedAt = new Date().toISOString();
  const lastModified = response.headers.get("last-modified");
  return {
    payload: JSON.parse(text) as unknown,
    fetchedAt,
    // Absence of source revision time remains explicit. The worker cannot turn
    // a fetch timestamp into a provider revision or complete box-score proof.
    sourceUpdatedAt:
      lastModified && Number.isFinite(Date.parse(lastModified))
        ? new Date(lastModified).toISOString()
        : null,
  };
}
