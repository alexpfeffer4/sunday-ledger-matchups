import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { fetchNflverseCatalog } from "@/adapters/providers/nflverse/catalog-client";

afterEach(() => vi.unstubAllGlobals());

describe("nflverse featured catalog acquisition", () => {
  it("can acquire the primary directory and schedule without a usage-statistics dependency", async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.includes("stats_player"))
        return new Response("unavailable", { status: 503 });
      return new Response("season,team\n2026,ARI", {
        headers: { "last-modified": "Sun, 20 Sep 2026 12:00:00 GMT" },
      });
    });
    vi.stubGlobal("fetch", fetch);
    const result = await fetchNflverseCatalog(2026, {
      includeUsageStats: false,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      fetch.mock.calls.every(
        ([url]) =>
          !url.includes("stats_player") && !url.includes("depth_charts"),
      ),
    ).toBe(true);
    expect(result.statsCsv).toBe(
      "player_id,season,week,recent_team,attempts,carries,targets\n",
    );
    expect(result.sourceUpdatedAt).toBe("2026-09-20T12:00:00.000Z");
  });

  it("preserves the legacy usage request and fails if that required source is unavailable", async () => {
    const fetch = vi.fn(async (url: string) =>
      url.includes("stats_player")
        ? new Response("unavailable", { status: 503 })
        : new Response("season,team\n2026,ARI", {
            headers: { "last-modified": "Sun, 20 Sep 2026 12:00:00 GMT" },
          }),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(fetchNflverseCatalog(2026)).rejects.toThrow(
      "CATALOG_NFLVERSE_UNAVAILABLE",
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
