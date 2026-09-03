import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ownerRehearsalBotCardPlan,
  ownerRehearsalBotNames,
  ownerRehearsalCheckpoints,
  ownerRehearsalGuide,
  ownerRehearsalSamplePlan,
} from "@/domain/rehearsal/owner-rehearsal";

describe("Owner Guided Rehearsal", () => {
  it("has one stable, recoverable checkpoint order", () => {
    expect(ownerRehearsalCheckpoints).toHaveLength(23);
    expect(ownerRehearsalCheckpoints[0]).toBe("FORMATION_EMPTY");
    expect(ownerRehearsalCheckpoints.at(-1)).toBe("COMPLETE");
    expect(new Set(ownerRehearsalCheckpoints).size).toBe(
      ownerRehearsalCheckpoints.length,
    );
    expect(Object.keys(ownerRehearsalGuide)).toEqual([
      ...ownerRehearsalCheckpoints,
    ]);
  });

  it("uses nine deterministic, neutral rehearsal-team names", () => {
    expect(ownerRehearsalBotNames).toHaveLength(9);
    expect(new Set(ownerRehearsalBotNames).size).toBe(9);
    expect(ownerRehearsalBotNames.join(" ")).not.toMatch(
      /pfeffer|admin|developer|test user|bot|dummy|celebrity/i,
    );
    expect(
      ownerRehearsalBotNames.every((name) => name.endsWith("Eleven")),
    ).toBe(true);
  });

  it("creates only Ruleset-sized, whole-credit bot card plans", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 18 }),
        fc.integer({ min: 1, max: 9 }),
        (week, botNumber) => {
          const first = ownerRehearsalBotCardPlan(week, botNumber);
          const replay = ownerRehearsalBotCardPlan(week, botNumber);
          expect(replay).toEqual(first);
          expect(first.eventOrdinal).toBeGreaterThanOrEqual(1);
          expect(first.eventOrdinal).toBeLessThanOrEqual(8);
          expect(["MONEYLINE", "SPREAD", "TOTAL"]).toContain(first.marketType);
          expect(["AWAY", "HOME", "OVER", "UNDER"]).toContain(first.side);
          expect(Number.isInteger(first.stakeCredits)).toBe(true);
          expect(first.stakeCredits).toBe(1_000);
        },
      ),
    );
  });

  it("varies bot cards without depending on a network or AI response", () => {
    const plans = new Set(
      Array.from({ length: 9 }, (_, index) =>
        JSON.stringify(ownerRehearsalBotCardPlan(8, index + 1)),
      ),
    );
    expect(plans.size).toBeGreaterThanOrEqual(6);
    expect(ownerRehearsalBotCardPlan(8, 4)).toEqual(
      ownerRehearsalBotCardPlan(8, 4),
    );
  });

  it("keeps the owner sample deterministic and includes lesson positions", () => {
    expect(ownerRehearsalSamplePlan("aa", 2)).toMatchObject({
      eventOrdinal: 4,
      marketType: "SPREAD",
      side: "AWAY",
      stakeCredits: 1_000,
    });
    expect(ownerRehearsalSamplePlan("aa", 3).eventOrdinal).toBe(3);
    expect(ownerRehearsalSamplePlan("aa", 8).eventOrdinal).toBe(5);
    expect(ownerRehearsalSamplePlan("aa", 17).eventOrdinal).toBe(6);
  });

  it("sends every open-week member task to the ordinary Make picks route", () => {
    const openWeekRoutes = Object.entries(ownerRehearsalGuide)
      .filter(([checkpoint]) => checkpoint.endsWith("_OPEN"))
      .map(([, step]) => step.href?.("owner-rehearsal"));

    expect(openWeekRoutes).toHaveLength(9);
    expect(openWeekRoutes).toEqual(
      Array.from({ length: 9 }, () => "/l/owner-rehearsal/slate"),
    );
  });
});
