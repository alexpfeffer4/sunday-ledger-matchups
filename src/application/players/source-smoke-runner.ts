import { z } from "zod";
import type { CatalogSource } from "@/adapters/providers/player-catalog-normalizer";
import type { StatisticsUsage } from "@/adapters/providers/api-sports/client";
import {
  selectSmokeGame,
  sourceSmokeReportSchema,
  summarizeSmokeSample,
  validateSmokeCoverage,
  type SmokeGame,
} from "@/adapters/providers/api-sports/source-smoke-normalizer";

type Port = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};
type Fetchers = {
  quota: () => Promise<{
    active: boolean;
    dailyLimit: number;
    used: number;
    observedAt: string;
  }>;
  catalog: (
    kind: "COVERAGE" | "GAMES" | "ROSTER",
    season: number,
    teamId: string | null,
    usage: (value: StatisticsUsage) => void,
  ) => Promise<CatalogSource>;
  boxScore: (
    gameId: string,
    usage: (value: StatisticsUsage) => void,
  ) => Promise<CatalogSource>;
};
const stageSchema = z.enum([
  "STATUS",
  "COVERAGE",
  "GAMES",
  "AWAY_ROSTER",
  "HOME_ROSTER",
  "BOX_SCORE",
  "SUMMARY",
]);
const completedSchema = z.object({
  status: z.enum(["CHECKED", "UNAVAILABLE", "DEFERRED"]),
  smokeRunId: z.uuid(),
  season: z.literal(2026),
  requestsReserved: z.number().int().min(0).max(5),
  requestCeiling: z.literal(20),
  report: sourceSmokeReportSchema.nullable(),
  checkedAt: z.iso.datetime({ offset: true }),
  failureStage: stageSchema.nullable(),
  failureCode: z
    .enum([
      "SOURCE_UNAVAILABLE",
      "SOURCE_SHAPE_UNSUPPORTED",
      "CURRENT_SEASON_UNAVAILABLE",
      "NO_COMPLETED_GAME",
      "BUDGET_DEFERRED",
      "LEASE_EXPIRED",
    ])
    .nullable(),
});
class SmokeBudgetDeferred extends Error {}
async function rpc(port: Port, name: string, args?: Record<string, unknown>) {
  const response = await port.rpc(name, args);
  if (response.error) throw new Error("SOURCE_SMOKE_LEDGER_UNAVAILABLE");
  return response.data;
}

/** Five fixed source reads at most, with no competitive imports. Failed calls
 * keep their reservations. A repeated operation returns its recorded result. */
export async function executePlayerSourceSmoke(
  port: Port,
  fetchers: Fetchers,
  operationKey: string,
) {
  const startedAt = Date.now();
  const claimed = await rpc(port, "claim_player_source_smoke", {
    p_operation_key: operationKey,
  });
  const status = z.object({ status: z.string() }).parse(claimed).status;
  if (
    ["BUSY", "LIMIT", "DEFERRED"].includes(status) &&
    !z.object({ smokeRunId: z.uuid() }).safeParse(claimed).success
  )
    return { status: z.enum(["BUSY", "LIMIT", "DEFERRED"]).parse(status) };
  if (status !== "CLAIMED") return completedSchema.parse(claimed);
  const claim = z
    .object({
      status: z.literal("CLAIMED"),
      smokeRunId: z.uuid(),
      season: z.literal(2026),
    })
    .parse(claimed);
  let stage: z.infer<typeof stageSchema> = "STATUS";
  let game: SmokeGame | null = null;
  const request = async (
    load: (onUsage: (value: StatisticsUsage) => void) => Promise<CatalogSource>,
  ) => {
    if (Date.now() - startedAt >= 80_000) throw new SmokeBudgetDeferred();
    const reservation = await port.rpc("reserve_player_source_smoke_request", {
      p_run_id: claim.smokeRunId,
    });
    if (reservation.error) throw new SmokeBudgetDeferred();
    const requestId = z.uuid().parse(reservation.data);
    let succeeded = false;
    let usage: StatisticsUsage = {
      remaining: null,
      rateLimit: null,
      retryAfterSeconds: null,
    };
    try {
      if (Date.now() - startedAt >= 80_000) throw new SmokeBudgetDeferred();
      const source = await load((value) => {
        usage = value;
      });
      succeeded = true;
      return source;
    } finally {
      // Empty metadata observations mark only transport success; they cannot
      // create result observations, mappings, settlements, or player jobs.
      await rpc(port, "complete_player_result_request", {
        p_request_id: requestId,
        p_observations: succeeded ? [] : null,
        p_remaining: usage.remaining,
        p_rate_limit: usage.rateLimit,
        p_retry_after_seconds: usage.retryAfterSeconds,
      });
    }
  };
  const complete = (value: {
    status: "CHECKED" | "UNAVAILABLE" | "DEFERRED";
    report?: z.infer<typeof sourceSmokeReportSchema>;
    failureCode?: z.infer<typeof completedSchema>["failureCode"];
  }) =>
    rpc(port, "complete_player_source_smoke", {
      p_run_id: claim.smokeRunId,
      p_status: value.status,
      p_report: value.report ?? null,
      p_sample: game
        ? {
            gameId: game.id,
            awayTeamId: game.away.id,
            homeTeamId: game.home.id,
          }
        : null,
      p_failure_stage: value.status === "CHECKED" ? null : stage,
      p_failure_code: value.failureCode ?? null,
    }).then((result) => completedSchema.parse(result));
  try {
    const quota = await fetchers.quota();
    await rpc(port, "complete_player_statistics_status", {
      p_lease_id: claim.smokeRunId,
      p_active: quota.active,
      p_daily_limit: quota.dailyLimit,
      p_used: quota.used,
      p_observed_at: quota.observedAt,
    });
    if (!quota.active)
      return complete({
        status: "UNAVAILABLE",
        failureCode: "SOURCE_UNAVAILABLE",
      });
    stage = "COVERAGE";
    const coverage = await request((usage) =>
      fetchers.catalog("COVERAGE", 2026, null, usage),
    );
    validateSmokeCoverage(coverage);
    stage = "GAMES";
    const games = await request((usage) =>
      fetchers.catalog("GAMES", 2026, null, usage),
    );
    game = selectSmokeGame(games, new Date().toISOString());
    stage = "AWAY_ROSTER";
    const away = await request((usage) =>
      fetchers.catalog("ROSTER", 2026, game!.away.id, usage),
    );
    stage = "HOME_ROSTER";
    const home = await request((usage) =>
      fetchers.catalog("ROSTER", 2026, game!.home.id, usage),
    );
    stage = "BOX_SCORE";
    const box = await request((usage) => fetchers.boxScore(game!.id, usage));
    stage = "SUMMARY";
    const report = summarizeSmokeSample({
      game,
      rosters: [away, home],
      boxScore: box,
    });
    return complete({ status: "CHECKED", report });
  } catch (error) {
    if (error instanceof SmokeBudgetDeferred)
      return complete({ status: "DEFERRED", failureCode: "BUDGET_DEFERRED" });
    const message = error instanceof Error ? error.message : "";
    const failureCode =
      message === "CATALOG_CURRENT_SEASON_UNAVAILABLE"
        ? "CURRENT_SEASON_UNAVAILABLE"
        : message === "SMOKE_COMPLETED_GAME_UNAVAILABLE"
          ? "NO_COMPLETED_GAME"
          : error instanceof z.ZodError || message.startsWith("SMOKE_")
            ? "SOURCE_SHAPE_UNSUPPORTED"
            : "SOURCE_UNAVAILABLE";
    return complete({ status: "UNAVAILABLE", failureCode });
  }
}
