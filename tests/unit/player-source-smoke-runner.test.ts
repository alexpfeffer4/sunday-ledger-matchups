import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { executePlayerSourceSmoke } from "@/application/players/source-smoke-runner";
import type { StatisticsUsage } from "@/adapters/providers/api-sports/client";
const mocked = vi.hoisted(() => ({
  coverage: vi.fn(),
  game: vi.fn(),
  summary: vi.fn(),
}));
vi.mock(
  "@/adapters/providers/api-sports/source-smoke-normalizer",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/adapters/providers/api-sports/source-smoke-normalizer")
    >()),
    validateSmokeCoverage: mocked.coverage,
    selectSmokeGame: mocked.game,
    summarizeSmokeSample: mocked.summary,
  }),
);
const runId = "898f02eb-e502-4ccd-8d31-95f0c28ebbb0";
const report = {
  coverageAvailable: true,
  gameIdentityVerified: true,
  bothRostersAvailable: true,
  boxScoreShapeValid: true,
  matchingPlayerCount: 12,
  passingRows: 2,
  rushingRows: 4,
  receivingRows: 6,
  offensiveActivityRows: 10,
  missingMappedPlayers: 9,
  completenessValidated: false,
  dnpValidated: false,
  correctionValidated: false,
};
const game = {
  id: "77",
  season: 2026 as const,
  scheduledStartAt: "2026-09-14T00:00:00Z",
  away: { id: "4", name: "Away" },
  home: { id: "8", name: "Home" },
  finalStatus: "FT" as const,
};
const source = {
  fetchedAt: "2026-09-15T12:00:00Z",
  payload: { private: "never retain raw source" },
};
function fixture() {
  let reserved = 0;
  const rpc = vi.fn(
    async (
      name: string,
      args?: Record<string, unknown>,
    ): Promise<{ data: unknown; error: unknown }> => {
      if (name === "claim_player_source_smoke")
        return {
          data: { status: "CLAIMED", smokeRunId: runId, season: 2026 },
          error: null,
        };
      if (name === "reserve_player_source_smoke_request") {
        reserved++;
        return {
          data: `099f02eb-e502-4ccd-8d31-95f0c28ebbb${reserved}`,
          error: null,
        };
      }
      if (name === "complete_player_source_smoke")
        return {
          data: {
            status: args!.p_status,
            smokeRunId: runId,
            season: 2026,
            requestsReserved: reserved,
            requestCeiling: 20,
            report: args!.p_report,
            checkedAt: "2026-09-15T12:00:00Z",
            failureStage: args!.p_failure_stage,
            failureCode: args!.p_failure_code,
            privateField: "must not escape",
          },
          error: null,
        };
      return { data: null, error: null };
    },
  );
  const quota = vi.fn(async () => ({
    active: true,
    dailyLimit: 100,
    used: 0,
    observedAt: "2026-09-15T12:00:00Z",
  }));
  const catalog = vi.fn(
    async (
      _kind: "COVERAGE" | "GAMES" | "ROSTER",
      _season: number,
      _team: string | null,
      usage: (value: StatisticsUsage) => void,
    ) => {
      usage({ remaining: 98, rateLimit: 8, retryAfterSeconds: null });
      return source;
    },
  );
  const boxScore = vi.fn(
    async (_id: string, usage: (value: StatisticsUsage) => void) => {
      usage({ remaining: 95, rateLimit: 8, retryAfterSeconds: null });
      return source;
    },
  );
  return { port: { rpc }, fetchers: { quota, catalog, boxScore }, rpc };
}
beforeEach(() => {
  mocked.game.mockReturnValue(game);
  mocked.summary.mockReturnValue(report);
});
afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});
it("makes only the fixed five scoped data reads and records metadata instead of importing evidence", async () => {
  const f = fixture();
  const result = await executePlayerSourceSmoke(
    f.port,
    f.fetchers,
    "smoke-2026-1",
  );
  expect(result).toMatchObject({
    status: "CHECKED",
    requestsReserved: 5,
    report,
  });
  expect(result).not.toHaveProperty("privateField");
  expect(
    f.fetchers.catalog.mock.calls.map(([kind, season, team]) => [
      kind,
      season,
      team,
    ]),
  ).toEqual([
    ["COVERAGE", 2026, null],
    ["GAMES", 2026, null],
    ["ROSTER", 2026, "4"],
    ["ROSTER", 2026, "8"],
  ]);
  expect(f.fetchers.boxScore).toHaveBeenCalledExactlyOnceWith(
    "77",
    expect.any(Function),
  );
  const completed = f.rpc.mock.calls.filter(
    ([name]) => name === "complete_player_result_request",
  );
  expect(completed).toHaveLength(5);
  expect(
    completed.every(
      ([, args]) => JSON.stringify(args!.p_observations) === "[]",
    ),
  ).toBe(true);
  expect(f.rpc.mock.calls.map(([name]) => name)).not.toContain(
    "import_player_result_observations",
  );
  expect(f.rpc.mock.calls.at(-1)).toEqual([
    "complete_player_source_smoke",
    {
      p_run_id: runId,
      p_status: "CHECKED",
      p_report: report,
      p_sample: { gameId: "77", awayTeamId: "4", homeTeamId: "8" },
      p_failure_stage: null,
      p_failure_code: null,
    },
  ]);
  expect(JSON.stringify(f.rpc.mock.calls)).not.toContain(
    "never retain raw source",
  );
});
it.each(["BUSY", "LIMIT", "DEFERRED"])(
  "does not call providers when claim is %s",
  async (status) => {
    const f = fixture();
    f.rpc.mockResolvedValueOnce({ data: { status }, error: null });
    expect(
      await executePlayerSourceSmoke(f.port, f.fetchers, "smoke-2026-1"),
    ).toEqual({ status });
    expect(f.fetchers.quota).not.toHaveBeenCalled();
    expect(f.fetchers.catalog).not.toHaveBeenCalled();
  },
);
it("returns the existing completed operation without new quota use", async () => {
  const f = fixture();
  f.rpc.mockResolvedValueOnce({
    data: {
      status: "CHECKED",
      smokeRunId: runId,
      season: 2026,
      requestsReserved: 5,
      requestCeiling: 20,
      report,
      checkedAt: "2026-09-15T12:00:00Z",
      failureStage: null,
      failureCode: null,
    },
    error: null,
  });
  expect(
    await executePlayerSourceSmoke(f.port, f.fetchers, "smoke-2026-1"),
  ).toMatchObject({ status: "CHECKED" });
  expect(f.fetchers.quota).not.toHaveBeenCalled();
  expect(f.fetchers.catalog).not.toHaveBeenCalled();
});
it("stops an inactive account before any charged metadata", async () => {
  const f = fixture();
  f.fetchers.quota.mockResolvedValueOnce({
    active: false,
    dailyLimit: 100,
    used: 0,
    observedAt: "2026-09-15T12:00:00Z",
  });
  expect(
    await executePlayerSourceSmoke(f.port, f.fetchers, "smoke-2026-1"),
  ).toMatchObject({
    status: "UNAVAILABLE",
    failureStage: "STATUS",
    requestsReserved: 0,
  });
  expect(f.fetchers.catalog).not.toHaveBeenCalled();
});
it("stops when reservation fails and never starts an unreserved provider request", async () => {
  const f = fixture();
  const original = f.rpc.getMockImplementation()!;
  f.rpc.mockImplementation(async (name, args) =>
    name === "reserve_player_source_smoke_request"
      ? { data: null, error: { private: "budget" } }
      : original(name, args),
  );
  expect(
    await executePlayerSourceSmoke(f.port, f.fetchers, "smoke-2026-1"),
  ).toMatchObject({
    status: "DEFERRED",
    failureCode: "BUDGET_DEFERRED",
    requestsReserved: 0,
  });
  expect(f.fetchers.catalog).not.toHaveBeenCalled();
});
it("keeps failed reservations charged, records backoff, and never retains raw errors", async () => {
  const f = fixture();
  f.fetchers.catalog.mockImplementationOnce(
    async (_kind, _season, _team, usage) => {
      usage({ remaining: 99, rateLimit: 2, retryAfterSeconds: 60 });
      throw new Error("raw-provider-key");
    },
  );
  expect(
    await executePlayerSourceSmoke(f.port, f.fetchers, "smoke-2026-1"),
  ).toMatchObject({ status: "UNAVAILABLE", requestsReserved: 1 });
  expect(f.rpc).toHaveBeenCalledWith(
    "complete_player_result_request",
    expect.objectContaining({
      p_observations: null,
      p_rate_limit: 2,
      p_retry_after_seconds: 60,
    }),
  );
  expect(JSON.stringify(f.rpc.mock.calls)).not.toContain("raw-provider-key");
  expect(f.fetchers.boxScore).not.toHaveBeenCalled();
});
it.each([
  ["CATALOG_CURRENT_SEASON_UNAVAILABLE", "CURRENT_SEASON_UNAVAILABLE"],
  ["SMOKE_COMPLETED_GAME_UNAVAILABLE", "NO_COMPLETED_GAME"],
])(
  "reports %s honestly without continuing later calls",
  async (error, failureCode) => {
    const f = fixture();
    if (failureCode === "CURRENT_SEASON_UNAVAILABLE")
      mocked.coverage.mockImplementationOnce(() => {
        throw new Error(error);
      });
    else
      mocked.game.mockImplementationOnce(() => {
        throw new Error(error);
      });
    expect(
      await executePlayerSourceSmoke(f.port, f.fetchers, "smoke-2026-1"),
    ).toMatchObject({ status: "UNAVAILABLE", failureCode });
    expect(f.fetchers.boxScore).not.toHaveBeenCalled();
  },
);
it("stops inside the bounded runtime instead of retrying provider calls", async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.fetchers.quota.mockImplementationOnce(async () => {
    vi.setSystemTime(Date.now() + 81_000);
    return {
      active: true,
      dailyLimit: 100,
      used: 0,
      observedAt: "2026-09-15T12:00:00Z",
    };
  });
  expect(
    await executePlayerSourceSmoke(f.port, f.fetchers, "smoke-2026-1"),
  ).toMatchObject({ status: "DEFERRED", requestsReserved: 0 });
  expect(f.fetchers.catalog).not.toHaveBeenCalled();
});
