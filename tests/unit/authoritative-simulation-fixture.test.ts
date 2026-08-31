import { describe, expect, it } from "vitest";
import {
  canonicalScenarioOverrides,
  canonicalSimulationFixturePackId,
  canonicalSimulationManifestHash,
  canonicalSimulationSeed,
  SimulationFixtureAdapter,
} from "@/adapters/simulation";

describe("authoritative Simulation fixture adapter", () => {
  it("exposes one deterministic 18-week DraftKings-shaped pack", async () => {
    const first = new SimulationFixtureAdapter();
    const second = new SimulationFixtureAdapter(
      canonicalSimulationFixturePackId,
      canonicalSimulationSeed,
    );

    expect(canonicalSimulationManifestHash).toMatch(/^[0-9a-f]{64}$/);
    for (let week = 1; week <= 18; week += 1) {
      const [events, repeated, markets] = await Promise.all([
        first.listEvents(week),
        second.listEvents(week),
        first.listMainMarkets(week),
      ]);
      expect(events).toEqual(repeated);
      expect(events).toHaveLength(8);
      expect(new Set(events.map((event) => event.externalEventId)).size).toBe(
        8,
      );
      expect(markets).toHaveLength(8);
      expect(
        markets.every(
          (event) =>
            event.source === "SIMULATION_FIXTURE" &&
            event.markets.length === 6 &&
            event.markets.every((market) => market.sourceBook === "draftkings"),
        ),
      ).toBe(true);
    }
  });

  it("reveals only the latest scripted version available at the supplied clock", async () => {
    const adapter = new SimulationFixtureAdapter();
    const week8Events = await adapter.listEvents(8);
    const before = await adapter.getEventResults(
      8,
      week8Events[0].scheduledStartAt,
    );
    const afterFinal = await adapter.getEventResults(
      8,
      new Date(
        new Date(week8Events.at(-1)!.scheduledStartAt).getTime() +
          5 * 60 * 60_000,
      ).toISOString(),
    );
    const afterCorrection = await adapter.getEventResults(
      8,
      new Date(
        new Date(week8Events.at(-1)!.scheduledStartAt).getTime() +
          31 * 60 * 60_000,
      ).toISOString(),
    );

    expect(before).toEqual([]);
    expect(afterFinal).toHaveLength(8);
    expect(afterFinal.every((result) => result.version === 2)).toBe(true);
    expect(
      afterCorrection.find((result) => result.version === 3),
    ).toMatchObject({ status: "FINAL", source: "SIMULATION_FIXTURE" });
  });

  it("contains every canonical scenario and supported roster-size target", () => {
    const scenarioIds = new Set(
      canonicalScenarioOverrides.map((scenario) => scenario.id),
    );
    expect(scenarioIds).toEqual(
      new Set([
        "WIN_LOSS",
        "PUSH",
        "VOID",
        "REGULAR_EXACT_TIE",
        "ONE_INCOMPLETE_CARD",
        "BOTH_CARDS_INCOMPLETE",
        "THIRD_REGULAR_MISS",
        "PLAYOFF_EXACT_TIE",
        "PLAYOFF_SINGLE_INCOMPLETE",
        "PLAYOFF_DUAL_INCOMPLETE",
        "POSTPONEMENT_48H_VOID",
        "OBJECTIVE_CORRECTION",
        "RESEEDING",
        "ELIGIBLE_COUNTS_0_TO_6",
        "SIX_SLOT_VACANCIES",
        "BYE_EXHIBITIONS",
        "EXHIBITION_MISSES",
        "CHAMPION_FINALITY",
        "WEEK_18",
        "ARCHIVE_FINALITY",
        "W17_CORRECTION_BEFORE_W18_SEAL",
        "W17_CORRECTION_AFTER_W18_SEAL",
      ]),
    );
    expect(
      canonicalScenarioOverrides.find(
        (scenario) => scenario.id === "ELIGIBLE_COUNTS_0_TO_6",
      )?.rosterSizes,
    ).toEqual([4, 6, 8, 10, 12, 14, 16]);
  });

  it("rejects caller-selected packs and seeds", () => {
    expect(
      () => new SimulationFixtureAdapter("caller-pack", "caller-seed"),
    ).toThrow(/reviewed canonical/);
  });
});
