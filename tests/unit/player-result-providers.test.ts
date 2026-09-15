import { afterEach, expect, it, vi } from "vitest";
import {
  fetchApiSportsBoxScore,
  fetchApiSportsCatalog,
  fetchApiSportsQuotaStatus,
} from "@/adapters/providers/api-sports/client";
import { fetchNflverseSeasonEvidence } from "@/adapters/providers/nflverse/client";

vi.mock("server-only", () => ({}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("uses the documented game id parameter, server-only header, and truthful missing source time", async () => {
  vi.stubEnv("API_SPORTS_NFL_KEY", "fixture-secret");
  const fetcher = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ response: [] }), {
      headers: {
        "x-ratelimit-requests-remaining": "89",
        "x-ratelimit-limit": "8",
      },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const usage = vi.fn();
  const result = await fetchApiSportsBoxScore("123", usage);
  expect(result.sourceUpdatedAt).toBeNull();
  expect(String(fetcher.mock.calls[0][0])).toBe(
    "https://v1.american-football.api-sports.io/games/statistics/players?id=123",
  );
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    cache: "no-store",
    headers: { "x-apisports-key": "fixture-secret" },
  });
  expect(usage).toHaveBeenCalledWith({
    remaining: 89,
    rateLimit: 8,
    retryAfterSeconds: null,
  });
});

it("records 429 usage and backoff even when no usable evidence returns", async () => {
  vi.stubEnv("API_SPORTS_NFL_KEY", "fixture-secret");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response("unavailable", {
        status: 429,
        headers: {
          "retry-after": "90",
          "x-ratelimit-requests-remaining": "0",
        },
      }),
    ),
  );
  const usage = vi.fn();
  await expect(fetchApiSportsBoxScore("123", usage)).rejects.toThrow(
    "PROVIDER_UNAVAILABLE",
  );
  expect(usage).toHaveBeenCalledWith({
    remaining: 0,
    rateLimit: null,
    retryAfterSeconds: 90,
  });
});

it("sanitizes the quota-free status response before any persistence", async () => {
  vi.stubEnv("API_SPORTS_NFL_KEY", "fixture-secret");
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      response: {
        account: { email: "private@example.test", firstname: "Private" },
        subscription: { active: true, plan: "Free" },
        requests: { current: 4, limit_day: 100 },
      },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const status = await fetchApiSportsQuotaStatus();
  expect(status).toMatchObject({ active: true, dailyLimit: 100, used: 4 });
  expect(Object.keys(status).sort()).toEqual([
    "active",
    "dailyLimit",
    "observedAt",
    "used",
  ]);
  expect(fetcher.mock.calls[0][0]).toBe(
    "https://v1.american-football.api-sports.io/status",
  );
});

it("blocks invalid game ids or absent keys before a request", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  vi.stubEnv("API_SPORTS_NFL_KEY", "");
  await expect(fetchApiSportsBoxScore("123", vi.fn())).rejects.toThrow(
    "UNCONFIGURED",
  );
  vi.stubEnv("API_SPORTS_NFL_KEY", "fixture-secret");
  await expect(fetchApiSportsBoxScore("123&other=1", vi.fn())).rejects.toThrow(
    "INVALID_STATISTICS_GAME_ID",
  );
  expect(fetcher).not.toHaveBeenCalled();
});

it("fetches the two allowed nflverse artifacts once and preserves independent revision times", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response("statistic,values\n", {
        headers: { "last-modified": "Sun, 13 Sep 2026 23:00:00 GMT" },
      }),
    )
    .mockResolvedValueOnce(
      new Response("snap,values\n", {
        headers: { "last-modified": "Mon, 14 Sep 2026 02:00:00 GMT" },
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  const result = await fetchNflverseSeasonEvidence(2026);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(result.statsSourceUpdatedAt).toBe("2026-09-13T23:00:00.000Z");
  expect(result.snapsSourceUpdatedAt).toBe("2026-09-14T02:00:00.000Z");
  expect(
    fetcher.mock.calls.every(([url]) =>
      String(url).startsWith(
        "https://github.com/nflverse/nflverse-data/releases/download/",
      ),
    ),
  ).toBe(true);
});

it.each([
  ["COVERAGE", null, "leagues?id=1&season=2026"],
  ["GAMES", null, "games?league=1&season=2026"],
  ["ROSTER", "42", "players?team=42&season=2026"],
] as const)(
  "acquires %s only through the fixed server catalog endpoint",
  async (kind, team, suffix) => {
    vi.stubEnv("API_SPORTS_NFL_KEY", "fixture-secret");
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ response: [] }), {
        headers: {
          "x-ratelimit-requests-remaining": "79",
          "last-modified": "Mon, 14 Sep 2026 02:00:00 GMT",
        },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const usage = vi.fn();
    const result = await fetchApiSportsCatalog(kind, 2026, team, usage);
    expect(String(fetcher.mock.calls[0][0])).toBe(
      `https://v1.american-football.api-sports.io/${suffix}`,
    );
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      cache: "no-store",
      headers: { "x-apisports-key": "fixture-secret" },
    });
    expect(result.sourceUpdatedAt).toBe("2026-09-14T02:00:00.000Z");
    expect(usage).toHaveBeenCalledWith({
      remaining: 79,
      rateLimit: null,
      retryAfterSeconds: null,
    });
  },
);

it("rejects invalid catalog seasons and team identities before network usage", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(
    fetchApiSportsCatalog("COVERAGE", 2026.5, null, vi.fn()),
  ).rejects.toThrow("INVALID_STATISTICS_SEASON");
  await expect(
    fetchApiSportsCatalog("ROSTER", 2026, "42&league=2", vi.fn()),
  ).rejects.toThrow("INVALID_STATISTICS_TEAM_ID");
  await expect(
    fetchApiSportsCatalog("GAMES", 2026, "42", vi.fn()),
  ).rejects.toThrow("INVALID_STATISTICS_TEAM_ID");
  expect(fetcher).not.toHaveBeenCalled();
});

it("charges catalog response usage before rejecting a failed provider request", async () => {
  vi.stubEnv("API_SPORTS_NFL_KEY", "fixture-secret");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response("unavailable", {
        status: 429,
        headers: { "x-ratelimit-requests-remaining": "0" },
      }),
    ),
  );
  const usage = vi.fn();
  await expect(
    fetchApiSportsCatalog("GAMES", 2026, null, usage),
  ).rejects.toThrow("PROVIDER_UNAVAILABLE");
  expect(usage).toHaveBeenCalledWith({
    remaining: 0,
    rateLimit: null,
    retryAfterSeconds: 60,
  });
});
