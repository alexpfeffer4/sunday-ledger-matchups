import { timingSafeEqual } from "node:crypto";
import { fetchApiSportsQuotaStatus } from "@/adapters/providers/api-sports/client";
import { processPlayerResults } from "@/adapters/providers/player-result-worker";
import { processPendingPlayerCatalog } from "@/application/players/catalog-preparation";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const secret = process.env.SCORE_JOB_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  const headers = { "Cache-Control": "private, no-store" };
  if (
    !secret ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  if (new URL(request.url).searchParams.get("check") === "statistics-account") {
    if (!process.env.API_SPORTS_NFL_KEY) {
      return Response.json(
        { status: "UNCONFIGURED" },
        { status: 503, headers },
      );
    }
    try {
      // This protected, quota-free check reads only normalized account status.
      // It cannot dispatch work, change readiness, or expose provider account data.
      const { active, dailyLimit, used, observedAt } =
        await fetchApiSportsQuotaStatus();
      return Response.json(
        {
          status: active ? "READY" : "UNAVAILABLE",
          active,
          dailyLimit,
          used,
          observedAt,
        },
        { status: active ? 200 : 503, headers },
      );
    } catch {
      return Response.json({ status: "UNAVAILABLE" }, { status: 503, headers });
    }
  }
  try {
    // Start accepted-result work first. The database also gives due results
    // reservation priority; independent catalog work fits the same bounded call.
    const resultWork = processPlayerResults();
    const catalogWork = processPendingPlayerCatalog();
    const [results, catalog] = await Promise.allSettled([
      resultWork,
      catalogWork,
    ]);
    const result =
      results.status === "fulfilled"
        ? results.value
        : { status: "UNAVAILABLE", attempted: 0, reconciled: 0 };
    const preparation =
      catalog.status === "fulfilled"
        ? catalog.value
        : { status: "UNAVAILABLE", missingSources: 0 };
    return Response.json(
      { ...result, catalog: preparation },
      {
        status:
          result.status === "PARTIAL" ||
          result.status === "UNAVAILABLE" ||
          preparation.status === "UNAVAILABLE"
            ? 503
            : 200,
        headers,
      },
    );
  } catch {
    console.error(
      "Player result checkpoint unavailable; inspect private result jobs.",
    );
    return Response.json({ status: "UNAVAILABLE" }, { status: 503, headers });
  }
}
