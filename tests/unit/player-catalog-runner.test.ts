import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  executePlayerCatalogJob,
  type CatalogFetchers,
  type CatalogPort,
} from "@/application/players/catalog-runner";
import {
  playerCatalogWireFixture,
  fullSlateCatalogWireFixture,
} from "../fixtures/player-catalog-wire";

function harness(wire = playerCatalogWireFixture()) {
  const sources = new Map<string, unknown>();
  const calls: { name: string; args?: Record<string, unknown> }[] = [];
  const eventId = randomUUID(),
    lease = randomUUID();
  let denyBudget = false;
  let dailyAttempts = 0;
  const rpc: CatalogPort["rpc"] = async (name, args) => {
    calls.push({ name, args });
    if (name === "claim_player_catalog_job")
      return {
        data: {
          status: "CLAIMED",
          leaseId: lease,
          weekId: eventId,
          season: wire.season,
          week: wire.week,
          events: wire.events,
          apiSportsContractValidated: wire.apiSportsContractValidated,
          nflverseContractValidated: wire.nflverseContractValidated,
          cachedSources: Object.fromEntries(sources),
        },
        error: null,
      };
    if (name === "claim_player_statistics_status")
      return { data: { status: "IDLE" }, error: null };
    if (name === "claim_player_catalog_source") {
      const key = args!.p_cache_key as string;
      return {
        data: sources.has(key)
          ? { status: "CACHED", payload: sources.get(key) }
          : { status: "CLAIMED", leaseId: randomUUID() },
        error: null,
      };
    }
    if (name === "complete_player_catalog_source") {
      if (args!.p_payload)
        sources.set(args!.p_cache_key as string, args!.p_payload);
    }
    if (name === "reserve_player_metadata_request")
      return denyBudget || dailyAttempts >= 20
        ? { data: null, error: new Error("global budget") }
        : (dailyAttempts++, { data: randomUUID(), error: null });
    return { data: null, error: null };
  };
  const fetchers: CatalogFetchers = {
    api: vi.fn(async (kind, _season, team, usage) => {
      usage({ remaining: 99, rateLimit: 10, retryAfterSeconds: null });
      return kind === "COVERAGE"
        ? wire.coverage
        : kind === "GAMES"
          ? wire.games
          : wire.rosters[team!];
    }),
    quota: vi.fn(async () => ({
      active: true,
      dailyLimit: 100,
      used: 0,
      observedAt: wire.now,
    })),
    nflverse: vi.fn(async () => wire.nflverse),
    quotes: vi.fn(async () => ({ imports: wire.quotes, pending: false })),
    now: () => wire.now,
  };
  return {
    wire,
    port: { rpc },
    fetchers,
    calls,
    sources,
    deny: () => {
      denyBudget = true;
    },
    nextDay: (expireShortCaches = false) => {
      dailyAttempts = 0;
      if (expireShortCaches)
        for (const key of sources.keys())
          if (!key.startsWith("ROSTER:")) sources.delete(key);
    },
  };
}
describe("durable automatic catalog preparation", () => {
  it("resumes bulk acquisition under two calls per run and imports all six without manual identities", async () => {
    const state = harness();
    const first = await executePlayerCatalogJob(state.port, state.fetchers);
    expect(first.status).toBe("PENDING");
    expect(state.fetchers.api).toHaveBeenCalledTimes(2);
    expect(state.fetchers.quotes).not.toHaveBeenCalled();
    expect(
      state.calls.filter((call) => call.name === "import_player_catalog"),
    ).toHaveLength(0);
    const second = await executePlayerCatalogJob(state.port, state.fetchers);
    expect(second).toEqual({ status: "READY", missingSources: 0 });
    expect(state.fetchers.api).toHaveBeenCalledTimes(4);
    expect(state.fetchers.nflverse).toHaveBeenCalledTimes(1);
    expect(
      state.calls.filter(
        (call) => call.name === "reserve_player_metadata_request",
      ),
    ).toHaveLength(4);
    expect(
      state.calls.filter(
        (call) => call.name === "complete_player_result_request",
      ),
    ).toHaveLength(4);
    const imported = state.calls.find(
      (call) => call.name === "import_player_catalog",
    )!.args!.p_records as unknown[];
    expect(imported).toHaveLength(18);
    await executePlayerCatalogJob(state.port, state.fetchers);
    expect(state.fetchers.api).toHaveBeenCalledTimes(4); // Another league/job shares the same source facts.
  });
  it("does not send any request when the shared result priority/quota reservation rejects", async () => {
    const state = harness();
    state.deny();
    expect(
      (await executePlayerCatalogJob(state.port, state.fetchers)).status,
    ).toBe("PENDING");
    expect(state.fetchers.api).not.toHaveBeenCalled();
    expect(
      state.calls.some(
        (call) => call.name === "complete_player_result_request",
      ),
    ).toBe(false);
    expect(
      state.calls.some(
        (call) =>
          call.name === "complete_player_catalog_source" &&
          call.args?.p_payload === null,
      ),
    ).toBe(true);
  });
  it("records a timed-out attempt once without inventing unused credit or successful coverage", async () => {
    const state = harness();
    state.fetchers.api = vi.fn(async () => {
      throw new Error("request timed out");
    });
    expect(
      (await executePlayerCatalogJob(state.port, state.fetchers)).status,
    ).toBe("PENDING");
    const completion = state.calls.filter(
      (call) => call.name === "complete_player_result_request",
    );
    expect(completion).toHaveLength(1);
    expect(completion[0].args?.p_observations).toBeNull();
    expect(state.sources.size).toBe(0);
    expect(
      state.calls.some((call) => call.name === "import_player_catalog"),
    ).toBe(false);
  });
  it("caches access validation but never imports an unvalidated immutable result mapping", async () => {
    const state = harness();
    state.wire.apiSportsContractValidated = false;
    await executePlayerCatalogJob(state.port, state.fetchers);
    expect(
      (await executePlayerCatalogJob(state.port, state.fetchers)).status,
    ).toBe("PENDING");
    expect(state.sources.size).toBe(5);
    expect(
      state.calls.some((call) => call.name === "import_player_catalog"),
    ).toBe(false);
    expect(
      state.calls.some((call) => call.name === "register_player_result_event"),
    ).toBe(false);
    expect(state.fetchers.quotes).not.toHaveBeenCalled();
  });
  it("stops at a disabled/complete job before any source or provider operation", async () => {
    const state = harness();
    const port: CatalogPort = {
      rpc: async () => ({ data: { status: "READY" }, error: null }),
    };
    expect(await executePlayerCatalogJob(port, state.fetchers)).toEqual({
      status: "READY",
      missingSources: 0,
    });
    expect(state.fetchers.api).not.toHaveBeenCalled();
    expect(state.fetchers.quotes).not.toHaveBeenCalled();
  });
  it("finishes a cold16-game96-player slate across the20/day bound with cached progress and no lost teams", async () => {
    const state = harness(fullSlateCatalogWireFixture());
    for (let tick = 0; tick < 10; tick++)
      expect(
        (await executePlayerCatalogJob(state.port, state.fetchers)).status,
      ).toBe("PENDING");
    expect(state.fetchers.api).toHaveBeenCalledTimes(20);
    expect(
      (await executePlayerCatalogJob(state.port, state.fetchers)).status,
    ).toBe("PENDING");
    expect(state.fetchers.api).toHaveBeenCalledTimes(20);
    state.nextDay();
    for (let tick = 0; tick < 6; tick++)
      expect(
        (await executePlayerCatalogJob(state.port, state.fetchers)).status,
      ).toBe("PENDING");
    expect(await executePlayerCatalogJob(state.port, state.fetchers)).toEqual({
      status: "READY",
      missingSources: 0,
    });
    expect(state.fetchers.api).toHaveBeenCalledTimes(34);
    expect(state.fetchers.nflverse).toHaveBeenCalledTimes(1);
    const imported = state.calls.find(
      (call) => call.name === "import_player_catalog",
    )!.args!.p_records as { provider: string; canonicalKey: string }[];
    expect(imported).toHaveLength(288);
    expect(
      new Set(
        imported
          .filter((row) => row.provider === "THE_ODDS_API")
          .map((row) => row.canonicalKey),
      ).size,
    ).toBe(96);
    expect(
      state.calls.filter(
        (call) => call.name === "register_player_result_event",
      ),
    ).toHaveLength(16);
  });
  it("also completes the16-game cold slate when12-hour coverage/game caches expire at the daily boundary", async () => {
    const state = harness(fullSlateCatalogWireFixture());
    for (let tick = 0; tick < 10; tick++)
      await executePlayerCatalogJob(state.port, state.fetchers);
    state.nextDay(true);
    for (let tick = 0; tick < 7; tick++)
      expect(
        (await executePlayerCatalogJob(state.port, state.fetchers)).status,
      ).toBe("PENDING");
    expect(await executePlayerCatalogJob(state.port, state.fetchers)).toEqual({
      status: "READY",
      missingSources: 0,
    });
    expect(state.fetchers.api).toHaveBeenCalledTimes(36);
    expect(state.fetchers.nflverse).toHaveBeenCalledTimes(2);
  });
});
