import { beforeEach, describe, expect, it, vi } from "vitest";
import { refreshCardQuotes } from "@/adapters/providers/the-odds-api/refresh-card-quotes";
import { fetchNflOdds } from "@/adapters/providers/the-odds-api/client";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  complete: vi.fn(),
  fetch: vi.fn(),
  props: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/adapters/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    schema: () => ({ rpc: mocks.claim }),
  }),
}));
vi.mock("@/adapters/supabase/config", () => ({
  getSupabasePublicConfig: () => ({ url: "http://localhost:54321" }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ schema: () => ({ rpc: mocks.complete }) }),
}));
vi.mock("@/adapters/providers/the-odds-api/client", () => ({
  fetchNflOdds: mocks.fetch,
  fetchNflPlayerProps: mocks.props,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_SECRET_KEY", "local-test-only");
  mocks.complete.mockResolvedValue({ data: {}, error: null });
});

describe("server-owned published quote refresh", () => {
  it.each(["DISABLED", "CACHED"])("does not fetch for %s", async (status) => {
    mocks.claim.mockResolvedValue({ data: { status }, error: null });
    expect(await refreshCardQuotes("league")).toBe(status);
    expect(fetchNflOdds).not.toHaveBeenCalled();
  });
  it.each([
    "QUOTE_REFRESH_BUSY",
    "QUOTE_REFRESH_BUDGET",
    "League membership required.",
  ])("does not fetch after %s", async (message) => {
    mocks.claim.mockResolvedValue({ error: { message } });
    await expect(refreshCardQuotes("league")).rejects.toThrow(message);
    expect(fetchNflOdds).not.toHaveBeenCalled();
  });
  it("persists only a claimed event set and records provider quota", async () => {
    const leaseId = "10000000-0000-4000-8000-000000000001";
    mocks.claim.mockResolvedValue({
      data: { status: "CLAIMED", leaseId, eventIds: ["event-a"] },
    });
    const imported = {
      source: "THE_ODDS_API",
      fetchedAt: "2026-09-10T12:00:00Z",
      events: [],
    };
    mocks.fetch.mockImplementation(async ({ onUsage }) => {
      onUsage(497);
      return imported;
    });
    expect(await refreshCardQuotes("league")).toBe("REFRESHED");
    expect(mocks.fetch).toHaveBeenCalledWith({
      eventIds: ["event-a"],
      onUsage: expect.any(Function),
    });
    expect(mocks.complete).toHaveBeenCalledWith("complete_live_quote_refresh", {
      p_lease_id: leaseId,
      p_import: imported,
      p_requests_remaining: 497,
    });
  });
  it("records failure without resubmitting a provider call or changing terms", async () => {
    mocks.claim.mockResolvedValue({
      data: {
        status: "CLAIMED",
        leaseId: "10000000-0000-4000-8000-000000000001",
        eventIds: ["event-a"],
      },
    });
    mocks.fetch.mockRejectedValue(new Error("provider failed"));
    await expect(refreshCardQuotes("league")).rejects.toThrow(
      "provider failed",
    );
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.complete).toHaveBeenCalledWith(
      "complete_live_quote_refresh",
      expect.objectContaining({ p_import: null }),
    );
  });
});

describe("selective shared refresh", () => {
  const planId = "10000000-0000-4000-8000-000000000010";
  const requestId = "10000000-0000-4000-8000-000000000011";
  const positions = [
    { marketSnapshotId: "10000000-0000-4000-8000-000000000012" },
  ];
  function setup() {
    mocks.claim.mockImplementation(async (name: string) => ({
      data:
        name === "plan_live_quote_refresh"
          ? { status: "PLANNED", planId, requestIds: [requestId] }
          : { status: "REFRESHED" },
      error: null,
    }));
  }
  it("reuses public shared coverage without any provider request", async () => {
    setup();
    mocks.complete.mockResolvedValue({
      data: { status: "CACHED" },
      error: null,
    });
    expect(await refreshCardQuotes("league", positions)).toBe("REFRESHED");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.props).not.toHaveBeenCalled();
    expect(mocks.claim).toHaveBeenCalledWith("apply_live_quote_plan", {
      p_plan_id: planId,
    });
  });
  it("does not fetch main lines for an all-prop batch and records exact cost headers", async () => {
    setup();
    mocks.complete.mockImplementation(async (name: string) => ({
      data:
        name === "claim_shared_quote_request"
          ? {
              status: "CLAIMED",
              kind: "PROPS",
              requestId,
              eventIds: ["event-a"],
              families: ["player_pass_yds"],
            }
          : { status: "SUCCEEDED" },
      error: null,
    }));
    const imported = {
      source: "THE_ODDS_API",
      fetchedAt: "2026-09-14T12:00:00Z",
      events: [],
    };
    mocks.props.mockImplementation(async ({ onUsageDetail }) => {
      onUsageDetail({ remaining: 499, used: 1, last: 1 });
      return imported;
    });
    expect(await refreshCardQuotes("league", positions)).toBe("REFRESHED");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.props).toHaveBeenCalledWith({
      externalEventId: "event-a",
      families: ["player_pass_yds"],
      onUsageDetail: expect.any(Function),
    });
    expect(mocks.complete).toHaveBeenCalledWith(
      "complete_shared_quote_request",
      {
        p_request_id: requestId,
        p_import: imported,
        p_usage: { remaining: 499, used: 1, last: 1 },
      },
    );
  });
  it("finishes a maximum17-request mixed batch without truncating games", async () => {
    const requestIds = Array.from(
      { length: 17 },
      (_, i) => `10000000-0000-4000-8000-${String(100 + i).padStart(12, "0")}`,
    );
    mocks.claim.mockImplementation(async (name: string) => ({
      data:
        name === "plan_live_quote_refresh"
          ? { status: "PLANNED", planId, requestIds }
          : { status: "REFRESHED" },
      error: null,
    }));
    mocks.complete.mockImplementation(
      async (name: string, args: { p_request_id: string }) => ({
        data:
          name === "claim_shared_quote_request"
            ? {
                status: "CLAIMED",
                kind: args.p_request_id === requestIds[0] ? "MAIN" : "PROPS",
                requestId: args.p_request_id,
                eventIds: [args.p_request_id],
                families:
                  args.p_request_id === requestIds[0]
                    ? ["MAIN"]
                    : ["player_pass_yds"],
              }
            : { status: "SUCCEEDED" },
        error: null,
      }),
    );
    mocks.fetch.mockResolvedValue({});
    mocks.props.mockResolvedValue({});
    expect(await refreshCardQuotes("league", positions)).toBe("REFRESHED");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.props).toHaveBeenCalledTimes(16);
    expect(
      mocks.complete.mock.calls.filter(
        ([name]) => name === "complete_shared_quote_request",
      ),
    ).toHaveLength(17);
    expect(mocks.claim).toHaveBeenLastCalledWith("apply_live_quote_plan", {
      p_plan_id: planId,
    });
  });
  it("retains charged failure evidence and never applies a partial batch", async () => {
    setup();
    mocks.complete.mockImplementation(async (name: string) => ({
      data:
        name === "claim_shared_quote_request"
          ? {
              status: "CLAIMED",
              kind: "PROPS",
              requestId,
              eventIds: ["event-a"],
              families: ["player_pass_yds"],
            }
          : { status: "FAILED" },
      error: null,
    }));
    mocks.props.mockImplementation(async ({ onUsageDetail }) => {
      onUsageDetail({ remaining: 498, used: 2, last: 1 });
      throw new Error("charged failure");
    });
    await expect(refreshCardQuotes("league", positions)).rejects.toThrow(
      "charged failure",
    );
    expect(mocks.complete).toHaveBeenCalledWith(
      "complete_shared_quote_request",
      {
        p_request_id: requestId,
        p_import: null,
        p_usage: { remaining: 498, used: 2, last: 1 },
      },
    );
    expect(mocks.claim).not.toHaveBeenCalledWith(
      "apply_live_quote_plan",
      expect.anything(),
    );
    expect(mocks.props).toHaveBeenCalledTimes(1);
  });
});
