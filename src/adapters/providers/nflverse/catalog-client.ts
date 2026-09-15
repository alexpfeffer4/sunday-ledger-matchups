import "server-only";
import type { NflverseCatalogFiles } from "@/adapters/providers/player-catalog-normalizer";

/** Fixed public nflverse sources; URLs cannot be supplied by a caller. */
export async function fetchNflverseCatalog(
  season: number,
  options: { includeUsageStats?: boolean } = {},
): Promise<NflverseCatalogFiles> {
  if (!Number.isInteger(season) || season < 2020 || season > 2100)
    throw new Error("INVALID_CATALOG_SEASON");
  const urls = [
    `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${season}.csv`,
    "https://github.com/nflverse/nfldata/raw/master/data/games.csv",
  ];
  if (options.includeUsageStats !== false)
    urls.push(
      `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`,
    );
  const files = await Promise.all(
    urls.map(async (url, index) => {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
      // Week1 has no current-season usage yet. Absence of usage is honest fallback,
      // whereas absent roster or schedule makes identity unavailable.
      if (index === 2 && response.status === 404)
        return {
          text: "player_id,season,week,recent_team,attempts,carries,targets\n",
          modified: null,
        };
      if (!response.ok) throw new Error("CATALOG_NFLVERSE_UNAVAILABLE");
      const text = await response.text();
      if (text.length > 12000000) throw new Error("CATALOG_NFLVERSE_TOO_LARGE");
      const modified = response.headers.get("last-modified");
      if (index === 0 && (!modified || !Number.isFinite(Date.parse(modified))))
        throw new Error("CATALOG_NFLVERSE_REVISION_UNAVAILABLE");
      return { text, modified };
    }),
  );
  return {
    rosterCsv: files[0].text,
    scheduleCsv: files[1].text,
    // Featured-line nomination needs a current directory and schedule only.
    // Legacy usage-based selection retains the historical-statistics request.
    statsCsv:
      files[2]?.text ??
      "player_id,season,week,recent_team,attempts,carries,targets\n",
    fetchedAt: new Date().toISOString(),
    sourceUpdatedAt: new Date(files[0].modified!).toISOString(),
  };
}
