import { describe, expect, it } from "vitest";
import {
  stage1CorrectionResult,
  stage1InitialResults,
  stage1WeekOneFixture,
} from "@/adapters/simulation/stage1-week-one";
import {
  maximumStakeForOdds,
  validateProposedPosition,
} from "@/domain/cards/validate-position";
import { returnedCenticredits } from "@/domain/odds/american";
import { settleReceipt } from "@/domain/settlement/settle";
import { simulationSeason1Ruleset } from "@/rulesets/simulation-season-1";

describe("Stage 1 deterministic Week 1 fixture", () => {
  it("publishes eight events with Tuesday 6 a.m. ET grant time and a five-minute common lock", () => {
    expect(stage1WeekOneFixture.events).toHaveLength(8);
    expect(stage1WeekOneFixture.opensAt).toBe("2026-09-08T10:00:00.000Z");

    const earliestKickoff = Math.min(
      ...stage1WeekOneFixture.events.map((event) =>
        Date.parse(event.scheduledStartAt),
      ),
    );
    expect(Date.parse(stage1WeekOneFixture.commonLockAt)).toBe(
      earliestKickoff - 5 * 60 * 1_000,
    );
  });

  it("stores comparison observations while exposing only primary eligible quotes", () => {
    const observations = stage1WeekOneFixture.events.flatMap(
      (event) => event.markets,
    );
    const qualities = new Set(
      observations.map((observation) => observation.qualityStatus),
    );

    expect(qualities).toEqual(
      new Set([
        "HEALTHY",
        "STALE",
        "OUTLIER",
        "SUSPENDED",
        "PROVIDER_DEGRADED",
      ]),
    );
    expect(
      observations.filter((market) => market.bookKey === "fanduel"),
    ).toHaveLength(8);
    expect(
      observations
        .filter((market) => market.eligible)
        .every((market) => market.bookKey === "draftkings"),
    ).toBe(true);
  });

  it("preserves the exact shorter-than-minus-200 concentration boundary", () => {
    expect(maximumStakeForOdds(-225, simulationSeason1Ruleset)).toBe(750);
    expect(maximumStakeForOdds(-200, simulationSeason1Ruleset)).toBe(1_000);

    const result = validateProposedPosition({
      acceptedPositions: [],
      proposedPosition: {
        eventId: "bal-cle",
        marketType: "MONEYLINE",
        americanOdds: -225,
        stakeCredits: 750,
      },
      eligibleOpportunities: stage1WeekOneFixture.events.flatMap((event) =>
        event.markets
          .filter((market) => market.eligible)
          .map((market) => ({
            eventId: event.key,
            marketType: market.marketType,
            americanOdds: market.americanOdds,
          })),
      ),
      ruleset: simulationSeason1Ruleset,
    });
    expect(result).toMatchObject({ accepted: true, remainingCredits: 250 });
  });

  it("contains final, void, push, correction, and half-up settlement evidence", () => {
    expect(
      stage1InitialResults.some((result) => result.status === "VOID"),
    ).toBe(true);
    expect(stage1CorrectionResult).toMatchObject({
      eventKey: "buf-nyj",
      awayScore: 20,
      homeScore: 24,
    });

    const buffaloFinal = stage1InitialResults.find(
      (result) => result.eventKey === "buf-nyj",
    );
    expect(buffaloFinal).toBeDefined();
    if (
      !buffaloFinal ||
      buffaloFinal.awayScore === null ||
      buffaloFinal.homeScore === null
    ) {
      throw new Error("The Buffalo fixture must contain a final score.");
    }
    expect(
      settleReceipt(
        {
          id: "push",
          eventId: "buf-nyj",
          marketType: "TOTAL",
          selectedSide: "OVER",
          lineMilli: 44_000,
          americanOdds: -110,
          stakeCredits: 100,
        },
        {
          eventId: "buf-nyj",
          status: "FINAL",
          awayScore: buffaloFinal.awayScore,
          homeScore: buffaloFinal.homeScore,
        },
      ).outcome,
    ).toBe("PUSH");

    expect(returnedCenticredits(1, -160, "WIN")).toBe(163n);
    expect(returnedCenticredits(100, -160, "WIN")).toBe(16_250n);
  });
});
