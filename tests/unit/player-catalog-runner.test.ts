import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  executePlayerCatalogJob,
  type CatalogFetchers,
  type CatalogPort,
} from "@/application/players/catalog-runner";
import {
  playerCatalogWireFixture,
  fullSlateCatalogWireFixture,
} from "../fixtures/player-catalog-wire";

import { nflversePrimaryCatalogFixture } from "../fixtures/nflverse-primary-catalog";

afterEach(() => vi.useRealTimers());

function harness(
  wire = playerCatalogWireFixture(),
  options: { primary?: boolean; selectionPolicy?: string } = {},
) {
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
          sourcePolicy: options.primary
            ? "NFLVERSE_PRIMARY"
            : "API_SPORTS_NFLVERSE",
          selectionPolicy:
            options.selectionPolicy ??
            (options.primary
              ? "FEATURED_HIGHEST_STANDARD_LINES"
              : "LEGACY_ROLE_PRIORITY"),
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

describe("nflverse primary pilot acquisition", () => {
  it("deducts elapsed source work from the absolute quote acquisition deadline", async () => {
    const state = harness(nflversePrimaryCatalogFixture(), { primary: true });
    const startedAt = Date.parse(state.wire.now);
    vi.useFakeTimers();
    vi.setSystemTime(startedAt);
    state.fetchers.now = () => new Date().toISOString();
    state.fetchers.nflverse = vi.fn(async () => {
      vi.setSystemTime(startedAt + 35_000);
      return state.wire.nflverse;
    });
    state.fetchers.quotes = vi.fn(async (_weekId, deadlineAt) => {
      expect(deadlineAt).toBe(startedAt + 60_000);
      expect(deadlineAt! - Date.now()).toBe(25_000);
      return { imports: state.wire.quotes, pending: false };
    });

    expect(await executePlayerCatalogJob(state.port, state.fetchers)).toEqual({
      status: "READY",
      missingSources: 0,
    });
    const proposals = state.calls.find(
      (call) => call.name === "record_player_catalog_nominations",
    )!.args!.p_proposals as { nominationVerifiedAt: string }[];
    expect(
      proposals.every(
        (proposal) => proposal.nominationVerifiedAt === state.wire.now,
      ),
    ).toBe(true);
  });
  it.each([
    "quotes",
    "register_player_result_event",
    "last_result_event",
    "import_player_catalog",
  ])(
    "defers after the worker deadline at %s and resumes cached evidence without changing source times",
    async (boundary) => {
      const wire = nflversePrimaryCatalogFixture(fullSlateCatalogWireFixture());
      wire.events = wire.events.slice(0, 2);
      wire.quotes = wire.quotes.slice(0, 2);
      const state = harness(wire, { primary: true });
      const startedAt = Date.parse(wire.now);
      vi.useFakeTimers();
      vi.setSystemTime(startedAt);
      state.fetchers.now = () => new Date().toISOString();
      state.fetchers.quotes = vi.fn(async () => {
        if (boundary === "quotes") vi.setSystemTime(startedAt + 80_000);
        return { imports: wire.quotes, pending: false };
      });
      const slowPort: CatalogPort = {
        rpc: async (name, args) => {
          const result = await state.port.rpc(name, args);
          if (
            name === boundary ||
            (boundary === "last_result_event" &&
              name === "register_player_result_event" &&
              state.calls.filter((call) => call.name === name).length ===
                wire.events.length)
          )
            vi.setSystemTime(startedAt + 80_000);
          return result;
        },
      };

      expect(await executePlayerCatalogJob(slowPort, state.fetchers)).toEqual({
        status: "PENDING",
        missingSources: 1,
      });
      const postQuoteWrites = state.calls.filter((call) =>
        [
          "register_player_result_event",
          "import_player_catalog",
          "record_player_catalog_nominations",
          "complete_player_catalog_job",
        ].includes(call.name),
      );
      expect(postQuoteWrites.map((call) => call.name)).toEqual(
        boundary === "quotes"
          ? ["complete_player_catalog_job"]
          : boundary === "register_player_result_event"
            ? ["register_player_result_event", "complete_player_catalog_job"]
            : boundary === "last_result_event"
              ? [
                  "register_player_result_event",
                  "register_player_result_event",
                  "complete_player_catalog_job",
                ]
              : [
                  "register_player_result_event",
                  "register_player_result_event",
                  "import_player_catalog",
                  "complete_player_catalog_job",
                ],
      );
      expect(postQuoteWrites.at(-1)?.args).toMatchObject({
        p_status: "PENDING",
        p_error: "CATALOG_WORK_DEFERRED",
      });
      expect(state.sources.has("NFLVERSE_PRIMARY:2026")).toBe(true);

      vi.setSystemTime(startedAt + 5 * 60_000);
      state.fetchers.quotes = vi.fn(async () => ({
        imports: wire.quotes,
        pending: false,
      }));
      expect(await executePlayerCatalogJob(state.port, state.fetchers)).toEqual(
        {
          status: "READY",
          missingSources: 0,
        },
      );
      expect(state.fetchers.nflverse).toHaveBeenCalledTimes(1);
      expect(state.fetchers.api).not.toHaveBeenCalled();
      const proposals = state.calls.find(
        (call) => call.name === "record_player_catalog_nominations",
      )!.args!.p_proposals as {
        proposedCanonicalKey: string | null;
        nominationVerifiedAt: string;
      }[];
      expect(proposals).toHaveLength(12);
      expect(
        proposals.every(
          (proposal) =>
            proposal.proposedCanonicalKey !== null &&
            proposal.nominationVerifiedAt === wire.now,
        ),
      ).toBe(true);
      expect(state.fetchers.quotes).toHaveBeenCalledWith(
        expect.any(String),
        startedAt + 6 * 60_000,
      );
    },
  );
  it.each([14, 16])(
    "prepares a %i-game slate with zero API-Sports calls or reservations",
    async (games) => {
      const wire = nflversePrimaryCatalogFixture(fullSlateCatalogWireFixture());
      wire.events = wire.events.slice(0, games);
      wire.quotes = wire.quotes.slice(0, games);
      wire.apiSportsContractValidated = false;
      const state = harness(wire, { primary: true });
      expect(await executePlayerCatalogJob(state.port, state.fetchers)).toEqual(
        { status: "READY", missingSources: 0 },
      );
      expect(state.fetchers.api).not.toHaveBeenCalled();
      expect(state.fetchers.quota).not.toHaveBeenCalled();
      expect(state.fetchers.nflverse).toHaveBeenCalledWith(2026, {
        includeUsageStats: false,
      });
      expect(
        state.calls.some((call) =>
          [
            "claim_player_statistics_status",
            "reserve_player_metadata_request",
            "complete_player_result_request",
          ].includes(call.name),
        ),
      ).toBe(false);
      const registered = state.calls.filter(
        (call) => call.name === "register_player_result_event",
      );
      expect(registered).toHaveLength(games);
      expect(
        registered.every(
          (call) =>
            (call.args!.p_mapping as { apiSportsEventId: unknown })
              .apiSportsEventId === null,
        ),
      ).toBe(true);
      const records = state.calls.find(
        (call) => call.name === "import_player_catalog",
      )!.args!.p_records as { provider: string }[];
      expect(records).toHaveLength(games * 6 * 2);
      expect(records.some((row) => row.provider === "API_SPORTS")).toBe(false);
      const nomination = state.calls.find(
        (call) => call.name === "record_player_catalog_nominations",
      );
      expect(nomination?.args?.p_proposals).toHaveLength(games * 6);
      expect(state.calls.indexOf(nomination!)).toBeGreaterThan(
        state.calls.findIndex((call) => call.name === "import_player_catalog"),
      );
      await executePlayerCatalogJob(state.port, state.fetchers);
      expect(state.fetchers.nflverse).toHaveBeenCalledTimes(1);
    },
  );
  it("keeps an empty successful discovery retryable until real lines arrive", async () => {
    const state = harness(nflversePrimaryCatalogFixture(), { primary: true });
    const imports = state.wire.quotes;
    state.fetchers.quotes = vi.fn(async () => ({
      imports: [],
      pending: false,
    }));
    expect(await executePlayerCatalogJob(state.port, state.fetchers)).toEqual({
      status: "PENDING",
      missingSources: 6,
    });
    expect(
      state.calls.some(
        (call) => call.name === "record_player_catalog_nominations",
      ),
    ).toBe(true);
    state.fetchers.quotes = vi.fn(async () => ({ imports, pending: false }));
    expect(await executePlayerCatalogJob(state.port, state.fetchers)).toEqual({
      status: "READY",
      missingSources: 0,
    });
    expect(state.fetchers.nflverse).toHaveBeenCalledTimes(1);
  });
  it("keeps primary source evidence separate from cached legacy metadata", async () => {
    const state = harness(nflversePrimaryCatalogFixture(), { primary: true });
    state.sources.set("NFLVERSE:2026", playerCatalogWireFixture().nflverse);
    expect(
      (await executePlayerCatalogJob(state.port, state.fetchers)).status,
    ).toBe("READY");
    expect(state.fetchers.nflverse).toHaveBeenCalledTimes(1);
    expect(state.sources.has("NFLVERSE_PRIMARY:2026")).toBe(true);
  });
  it("nominates primary players across database and provider kickoff serialization", async () => {
    const wire = nflversePrimaryCatalogFixture();
    wire.events[0].scheduledStartAt = "2026-09-21T00:20:00+00:00";
    wire.quotes[0].events[0].scheduledStartAt = "2026-09-21T00:20:00Z";
    const state = harness(wire, { primary: true });

    expect(await executePlayerCatalogJob(state.port, state.fetchers)).toEqual({
      status: "READY",
      missingSources: 0,
    });
    const proposals = state.calls.find(
      (call) => call.name === "record_player_catalog_nominations",
    )!.args!.p_proposals as { proposedCanonicalKey: string | null }[];
    expect(proposals).toHaveLength(6);
    expect(
      proposals.every((proposal) => proposal.proposedCanonicalKey !== null),
    ).toBe(true);
    expect(state.fetchers.api).not.toHaveBeenCalled();
  });
  it("does not import immutable identities or spend quote credits before the primary contract passes", async () => {
    const wire = nflversePrimaryCatalogFixture();
    wire.nflverseContractValidated = false;
    const state = harness(wire, { primary: true });
    expect(
      (await executePlayerCatalogJob(state.port, state.fetchers)).status,
    ).toBe("PENDING");
    expect(state.fetchers.quotes).not.toHaveBeenCalled();
    expect(
      state.calls.some((call) => call.name === "import_player_catalog"),
    ).toBe(false);
  });
  it("rejects an inconsistent source/selection policy before any provider operation", async () => {
    const state = harness(nflversePrimaryCatalogFixture(), {
      primary: true,
      selectionPolicy: "LEGACY_ROLE_PRIORITY",
    });
    expect(
      (await executePlayerCatalogJob(state.port, state.fetchers)).status,
    ).toBe("UNAVAILABLE");
    expect(state.fetchers.nflverse).not.toHaveBeenCalled();
    expect(state.fetchers.quotes).not.toHaveBeenCalled();
  });
  it("keeps identities unresolved when primary current roster evidence is absent", async () => {
    const wire = nflversePrimaryCatalogFixture();
    wire.nflverse.rosterCsv =
      "season,team,position,full_name,gsis_id,pfr_id,status";
    const state = harness(wire, { primary: true });
    expect(
      (await executePlayerCatalogJob(state.port, state.fetchers)).status,
    ).not.toBe("READY");
    expect(
      state.calls.some((call) => call.name === "import_player_catalog"),
    ).toBe(false);
  });
});
