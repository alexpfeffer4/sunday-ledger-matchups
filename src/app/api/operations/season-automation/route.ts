import { timingSafeEqual } from "node:crypto";
import { processSeasonAutomation } from "@/application/automation/worker";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const secret = process.env.SCORE_JOB_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? ""),
    expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (
    !secret ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  const body = await request.text();
  if (
    new URL(request.url).search ||
    (body.trim() !== "" && body.trim() !== "{}")
  )
    return Response.json(
      { error: "This worker accepts no caller-selected scope." },
      { status: 400, headers },
    );
  try {
    const result = await processSeasonAutomation();
    return Response.json(result, {
      status: result.status === "PARTIAL" ? 503 : 200,
      headers,
    });
  } catch {
    console.error(
      "Season automation unavailable; inspect private lifecycle run status.",
    );
    return Response.json({ status: "UNAVAILABLE" }, { status: 503, headers });
  }
}
