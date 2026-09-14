import { timingSafeEqual } from "node:crypto";
import { processPlayerResults } from "@/adapters/providers/player-result-worker";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = process.env.SCORE_JOB_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  const headers = { "Cache-Control": "private, no-store" };
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  try {
    const result = await processPlayerResults();
    return Response.json(result, { status: result.status === "PARTIAL" ? 503 : 200, headers });
  } catch {
    console.error("Player result checkpoint unavailable; inspect private result jobs.");
    return Response.json({ status: "UNAVAILABLE" }, { status: 503, headers });
  }
}
