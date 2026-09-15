import { timingSafeEqual } from "node:crypto";
import { checkOddsAccount } from "@/adapters/providers/the-odds-api/account-check";
import { reconcileOddsEntitlement } from "@/adapters/providers/the-odds-api/entitlement";
import { refreshLiveScores } from "@/adapters/providers/the-odds-api/provider-requests";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  try {
    if (new URL(request.url).searchParams.get("check") === "odds-account") {
      const result = await checkOddsAccount();
      return Response.json(result, {
        headers,
        status: result.status === "READY" ? 200 : 503,
      });
    }
    const entitlement = await reconcileOddsEntitlement();
    // A completed free probe shares the same three-second launch spacing.
    if (entitlement !== "IDLE")
      await new Promise((resolve) => setTimeout(resolve, 3000));
    // Database selects all scope and timing. Never accept caller-authored IDs.
    const result = await refreshLiveScores();
    return Response.json(result, {
      headers,
      status: result.status === "FAILED" ? 503 : 200,
    });
  } catch {
    // No keys, raw provider content, or league/member identifiers in job output.
    console.error(
      "Scheduled score checkpoint failed; inspect private provider request status.",
    );
    return Response.json({ status: "UNAVAILABLE" }, { status: 503, headers });
  }
}
