import { timingSafeEqual } from "node:crypto";
import { checkPlayerSourceSmoke } from "@/adapters/providers/api-sports/source-smoke";

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
  )
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  const operationKey = request.headers.get("x-operation-key") ?? "";
  if (!/^[A-Za-z0-9:_-]{8,120}$/.test(operationKey))
    return Response.json(
      { status: "INVALID_OPERATION" },
      { status: 400, headers },
    );
  try {
    const result = await checkPlayerSourceSmoke(operationKey);
    return Response.json(result, {
      headers,
      status: result.status === "CHECKED" ? 200 : 503,
    });
  } catch {
    return Response.json({ status: "UNAVAILABLE" }, { status: 503, headers });
  }
}
