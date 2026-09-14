import "server-only";

export async function fetchNflverseSeasonEvidence(year: number) {
  if (!Number.isInteger(year) || year < 2020 || year > 2100)
    throw new Error("INVALID_STATISTICS_SEASON");
  const urls = [
    `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${year}.csv`,
    `https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_${year}.csv`,
  ];
  const files = await Promise.all(
    urls.map(async (url) => {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error("NFLVERSE_SOURCE_UNAVAILABLE");
      const text = await response.text();
      if (text.length > 25_000_000)
        throw new Error("NFLVERSE_SOURCE_TOO_LARGE");
      const modified = response.headers.get("last-modified");
      if (!modified || !Number.isFinite(Date.parse(modified)))
        throw new Error("NFLVERSE_REVISION_UNAVAILABLE");
      return { text, sourceUpdatedAt: new Date(modified).toISOString() };
    }),
  );
  return {
    statsCsv: files[0].text,
    snapsCsv: files[1].text,
    statsSourceUpdatedAt: files[0].sourceUpdatedAt,
    snapsSourceUpdatedAt: files[1].sourceUpdatedAt,
    fetchedAt: new Date().toISOString(),
  };
}
