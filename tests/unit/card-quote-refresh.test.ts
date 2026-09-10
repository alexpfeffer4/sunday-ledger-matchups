import { beforeEach, describe, expect, it, vi } from "vitest";
import { refreshCardQuotes } from "@/adapters/providers/the-odds-api/refresh-card-quotes";
import { fetchNflOdds } from "@/adapters/providers/the-odds-api/client";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  complete: vi.fn(),
  fetch: vi.fn(),
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
