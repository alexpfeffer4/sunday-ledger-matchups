import "server-only";

const MAX_SOURCE_BYTES = 25_000_000;

/** Bound the download before decoding/materializing it, including chunked
 * responses whose Content-Length is absent or describes compressed bytes. */
async function readSource(response: Response): Promise<string> {
  if (Number(response.headers.get("content-length")) > MAX_SOURCE_BYTES) {
    await response.body?.cancel();
    throw new Error("NFLVERSE_SOURCE_TOO_LARGE");
  }
  if (!response.body) throw new Error("NFLVERSE_SOURCE_UNAVAILABLE");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const chunks: string[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SOURCE_BYTES) {
        await reader.cancel();
        throw new Error("NFLVERSE_SOURCE_TOO_LARGE");
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

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
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("NFLVERSE_SOURCE_UNAVAILABLE");
      }
      const modified = response.headers.get("last-modified");
      if (!modified || !Number.isFinite(Date.parse(modified))) {
        await response.body?.cancel();
        throw new Error("NFLVERSE_REVISION_UNAVAILABLE");
      }
      const text = await readSource(response);
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
