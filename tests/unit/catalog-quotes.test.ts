import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acquirePlayerCatalogQuotes } from "@/adapters/providers/the-odds-api/catalog-quotes";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), fetch: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/adapters/supabase/config", () => ({
  getSupabasePublicConfig: () => ({ url: "http://localhost:54321" }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ schema: () => ({ rpc: mocks.rpc }) }),
}));
vi.mock("@/adapters/providers/the-odds-api/client", () => ({
  fetchNflPlayerProps: mocks.fetch,
}));
const families = ["player_pass_yds", "player_rush_yds", "player_reception_yds"];
function imported(event: string) {
  return {
    source: "THE_ODDS_API",
    fetchedAt: "2026-09-14T12:00:00Z",
    events: [
      {
        source: "THE_ODDS_API",
        externalEventId: event,
        sportKey: "americanfootball_nfl",
        awayTeam: "Away",
        homeTeam: "Home",
        scheduledStartAt: "2026-09-15T20:00:00Z",
        requestedFamilies: families,
        markets: [],
      },
    ],
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_SECRET_KEY", "local-fixture-only");
  vi.stubEnv("ODDS_API_KEY", "local-fixture-only");
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("bounded pre-menu catalog quote discovery", () => {
  it("returns retained source facts without paying again after quote TTL", async () => {
    const facts = { imports: [imported("previous-event")], pending: false };
    mocks.rpc.mockResolvedValue({ data: facts, error: null });
    expect(await acquirePlayerCatalogQuotes("week")).toEqual(facts);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });
  it("bounds a cold full slate to sixteen independently reserved provider calls", async () => {
    let claims = 0;
    const facts: ReturnType<typeof imported>[] = [];
    mocks.rpc.mockImplementation(
      async (name: string, args: Record<string, unknown>) => {
        if (name === "get_player_catalog_quotes")
          return { data: { imports: [...facts], pending: true } };
        if (name === "claim_player_catalog_quote") {
          claims += 1;
          return {
            data: {
              status: "CLAIMED",
              requestId: `10000000-0000-4000-8000-${String(claims).padStart(12, "0")}`,
              externalEventId: `game-${claims}`,
              families,
            },
          };
        }
        if (name === "complete_shared_quote_request") {
          facts.push(args.p_import as ReturnType<typeof imported>);
          return { data: { status: "SUCCEEDED" } };
        }
        throw new Error(name);
      },
    );
    mocks.fetch.mockImplementation(
      async ({ externalEventId, onUsageDetail }) => {
        onUsageDetail({
          remaining: 20000 - claims * 3,
          used: claims * 3,
          last: 3,
        });
        return imported(externalEventId);
      },
    );
    const result = await acquirePlayerCatalogQuotes("week");
    expect(
      result.imports.map((value) => value.events[0].externalEventId),
    ).toEqual(Array.from({ length: 16 }, (_, index) => `game-${index + 1}`));
    expect(result.pending).toBe(true);
    expect(claims).toBe(16);
    expect(mocks.fetch).toHaveBeenCalledTimes(16);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "complete_shared_quote_request",
      expect.objectContaining({
        p_usage: { remaining: 19952, used: 48, last: 3 },
      }),
    );
  });
  it("collects a full slate with ordinary three-second provider pacing inside the caller budget", async () => {
    vi.useFakeTimers();
    const started = Date.now();
    let claims = 0;
    let waitedForNext = false;
    const facts: ReturnType<typeof imported>[] = [];
    mocks.rpc.mockImplementation(
      async (name: string, args: Record<string, unknown>) => {
        if (name === "get_player_catalog_quotes")
          return { data: { imports: [...facts], pending: facts.length < 16 } };
        if (name === "claim_player_catalog_quote") {
          if (claims > 0 && !waitedForNext) {
            waitedForNext = true;
            return { data: { status: "WAIT", retryAfterMs: 3000 } };
          }
          waitedForNext = false;
          claims += 1;
          return {
            data: {
              status: "CLAIMED",
              requestId: `10000000-0000-4000-8000-${String(claims).padStart(12, "0")}`,
              externalEventId: `paced-${claims}`,
              families,
            },
          };
        }
        if (name === "complete_shared_quote_request") {
          facts.push(args.p_import as ReturnType<typeof imported>);
          return { data: { status: "SUCCEEDED" } };
        }
        throw new Error(name);
      },
    );
    mocks.fetch.mockImplementation(async ({ externalEventId }) =>
      imported(externalEventId),
    );
    const work = acquirePlayerCatalogQuotes("week", started + 60_000);
    await vi.runAllTimersAsync();
    const result = await work;
    expect(result.imports).toHaveLength(16);
    expect(result.pending).toBe(false);
    expect(mocks.fetch).toHaveBeenCalledTimes(16);
    expect(Date.now() - started).toBe(45_000);
  });
  it("stops before another reservation when a slow call exhausts the runtime margin", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const facts: ReturnType<typeof imported>[] = [];
    mocks.rpc.mockImplementation(
      async (name: string, args: Record<string, unknown>) => {
        if (name === "get_player_catalog_quotes")
          return { data: { imports: [...facts], pending: true } };
        if (name === "claim_player_catalog_quote")
          return {
            data: {
              status: "CLAIMED",
              requestId: "10000000-0000-4000-8000-000000000001",
              externalEventId: "slow-game",
              families,
            },
          };
        if (name === "complete_shared_quote_request") {
          facts.push(args.p_import as ReturnType<typeof imported>);
          return { data: { status: "SUCCEEDED" } };
        }
        throw new Error(name);
      },
    );
    mocks.fetch.mockImplementation(async () => {
      now += 14_000;
      return imported("slow-game");
    });

    const result = await acquirePlayerCatalogQuotes("week");
    expect(result.imports).toHaveLength(1);
    expect(result.pending).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(
      mocks.rpc.mock.calls.filter(
        ([name]) => name === "claim_player_catalog_quote",
      ),
    ).toHaveLength(1);
  });
  it.each(["DISABLED", "LIMIT", "WAIT"])(
    "preserves partial evidence and does not fetch on %s",
    async (status) => {
      const facts = { imports: [imported("already-done")], pending: true };
      mocks.rpc.mockImplementation(async (name: string) => ({
        data:
          name === "get_player_catalog_quotes"
            ? facts
            : { status, retryAfterMs: 0 },
      }));
      expect(await acquirePlayerCatalogQuotes("week")).toEqual(facts);
      expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );
  it("keeps cached progress when the caller has no full request margin left", async () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const facts = { imports: [imported("already-done")], pending: true };
    mocks.rpc.mockResolvedValue({ data: facts });

    expect(await acquirePlayerCatalogQuotes("week", now + 12_000)).toEqual(
      facts,
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(
      mocks.rpc.mock.calls.every(
        ([name]) => name === "get_player_catalog_quotes",
      ),
    ).toBe(true);
  });
  it("stops after repeated provider backoff without successful progress", async () => {
    vi.useFakeTimers();
    const facts = { imports: [imported("already-done")], pending: true };
    mocks.rpc.mockImplementation(async (name: string) => ({
      data:
        name === "get_player_catalog_quotes"
          ? facts
          : { status: "WAIT", retryAfterMs: 3000 },
    }));

    const work = acquirePlayerCatalogQuotes("week", Date.now() + 60_000);
    await vi.runAllTimersAsync();
    expect(await work).toEqual(facts);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(
      mocks.rpc.mock.calls.filter(
        ([name]) => name === "claim_player_catalog_quote",
      ),
    ).toHaveLength(2);
  });
  it("records charged failures once and leaves the next tick recoverable", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({
      data:
        name === "get_player_catalog_quotes"
          ? { imports: [], pending: true }
          : name === "claim_player_catalog_quote"
            ? {
                status: "CLAIMED",
                requestId: "10000000-0000-4000-8000-000000000001",
                externalEventId: "game",
                families,
              }
            : { status: "FAILED" },
    }));
    mocks.fetch.mockImplementation(async ({ onUsageDetail }) => {
      onUsageDetail({ remaining: 19997, used: 3, last: 3 });
      throw new Error("Provider failure");
    });
    expect(await acquirePlayerCatalogQuotes("week")).toEqual({
      imports: [],
      pending: true,
    });
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("complete_shared_quote_request", {
      p_request_id: "10000000-0000-4000-8000-000000000001",
      p_import: null,
      p_usage: { remaining: 19997, used: 3, last: 3 },
    });
  });
  it("can return existing facts without a configured provider key", async () => {
    vi.stubEnv("ODDS_API_KEY", "");
    mocks.rpc.mockResolvedValue({
      data: { imports: [imported("cached")], pending: true },
    });
    expect((await acquirePlayerCatalogQuotes("week")).imports).toHaveLength(1);
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
