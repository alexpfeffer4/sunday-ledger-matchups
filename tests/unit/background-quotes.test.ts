import { describe, expect, it, vi } from "vitest";
import { executeBackgroundQuotes } from "@/application/quotes/background-runner";
const runId = "10000000-0000-4000-8000-000000000001",
  requestId = "10000000-0000-4000-8000-000000000002",
  eventId = "10000000-0000-4000-8000-000000000003";
describe("bounded quote worker", () => {
  it.each(["IDLE", "DISABLED"])("%s makes no provider call", async (status) => {
    const fetch = vi.fn();
    expect(
      (
        await executeBackgroundQuotes({
          rpc: async () => ({ data: { status }, error: null }),
          fetch,
        })
      ).status,
    ).toBe(status);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("one saved fetch fans out independently and recovers one failed league", async () => {
    let acquired = false,
      completed = false,
      applications = 0;
    const fetch = vi.fn(async () => ({ source: "THE_ODDS_API" }));
    const rpc = vi.fn(async (name: string) => {
      let data: unknown;
      if (name === "claim_background_quote_run")
        data = { status: "CLAIMED", runId };
      else if (name === "claim_background_quote_request") {
        data = acquired
          ? { status: "IDLE" }
          : {
              status: "CLAIMED",
              requestId,
              kind: "MAIN",
              eventIds: ["game-1"],
              families: ["MAIN"],
            };
        acquired = true;
      } else if (name === "complete_background_quote_request") {
        completed = true;
        data = { status: "SUCCEEDED" };
      } else if (name === "next_background_quote_application")
        data =
          completed && applications < 20
            ? { status: "READY", eventId, requestIds: [requestId] }
            : { status: "IDLE" };
      else if (name === "apply_background_quote_event")
        data = { status: applications++ === 0 ? "FAILED" : "REFRESHED" };
      return { data, error: null };
    });
    const result = await executeBackgroundQuotes({ rpc, fetch });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      fetched: 1,
      applied: 19,
      failed: 1,
      status: "PARTIAL",
    });
  });
  it("backoff and unknown charges are recorded once, then acquisition stops", async () => {
    const rpc = vi.fn(async (name: string) => ({
      error: null,
      data:
        name === "claim_background_quote_run"
          ? { status: "CLAIMED", runId }
          : name === "claim_background_quote_request"
            ? {
                status: "CLAIMED",
                requestId,
                kind: "PROPS",
                eventIds: ["game-1"],
                families: ["player_pass_yds"],
              }
            : { status: "IDLE" },
    }));
    const fetch = vi.fn(async () => {
      throw Object.assign(new Error("limited"), {
        statusCode: 429,
        retryAfterSeconds: 900,
      });
    });
    expect((await executeBackgroundQuotes({ rpc, fetch })).status).toBe(
      "PARTIAL",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "complete_background_quote_request",
      expect.objectContaining({
        p_import: null,
        p_retry_after_seconds: 900,
        p_failure: "RATE_LIMIT",
        p_usage: { remaining: null, used: null, last: null },
      }),
    );
  });
});
