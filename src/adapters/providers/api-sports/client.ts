import "server-only";

export type StatisticsUsage = { remaining: number | null; rateLimit: number | null; retryAfterSeconds: number | null };
function positiveHeader(headers: Headers, name: string) {
  const value = headers.get(name);
  return value !== null && /^\d+$/.test(value) ? Number(value) : null;
}
export async function fetchApiSportsBoxScore(gameId: string, onUsage: (usage: StatisticsUsage) => void) {
  const key = process.env.API_SPORTS_NFL_KEY;
  if (!key) throw new Error("PLAYER_STATISTICS_UNCONFIGURED");
  if (!/^\d+$/.test(gameId)) throw new Error("INVALID_STATISTICS_GAME_ID");
  const url = new URL("https://v1.american-football.api-sports.io/games/statistics/players");
  url.searchParams.set("id", gameId);
  const response = await fetch(url, {
    headers: { "x-apisports-key": key, Accept: "application/json" },
    cache: "no-store", signal: AbortSignal.timeout(12_000),
  });
  onUsage({
    remaining: positiveHeader(response.headers, "x-ratelimit-requests-remaining"),
    rateLimit: positiveHeader(response.headers, "x-ratelimit-limit"),
    retryAfterSeconds: response.status === 429 ? positiveHeader(response.headers, "retry-after") ?? 60 : null,
  });
  if (!response.ok) throw new Error("PLAYER_STATISTICS_PROVIDER_UNAVAILABLE");
  const text = await response.text();
  if (text.length > 4_000_000) throw new Error("PLAYER_STATISTICS_RESPONSE_TOO_LARGE");
  const fetchedAt = new Date().toISOString();
  const lastModified = response.headers.get("last-modified");
  return {
    payload: JSON.parse(text) as unknown, fetchedAt,
    // Absence of source revision time remains explicit. The worker cannot turn
    // a fetch timestamp into a provider revision or complete box-score proof.
    sourceUpdatedAt: lastModified && Number.isFinite(Date.parse(lastModified)) ? new Date(lastModified).toISOString() : null,
  };
}
