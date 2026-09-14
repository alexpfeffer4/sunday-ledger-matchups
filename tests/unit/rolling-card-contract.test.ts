import { describe, expect, it } from "vitest";
import { validateDraftCard } from "@/domain/cards/validate-card-draft";
import { cardCompliance } from "@/domain/cards/validate-position";
import { eventAcceptsBets } from "@/components/card/owner-card-context";
import { hashRuleset } from "@/rulesets/canonicalize";
import { resolveSeasonCardRules } from "@/rulesets/card-rules";
import { pocSeason13Ruleset } from "@/rulesets/poc-season-1-3";
import { pocSeason1Ruleset } from "@/rulesets/poc-season-1";
import { simulationSeason13Ruleset } from "@/rulesets/simulation-season-1-3";
import { frozenCardRulesFixture } from "../fixtures/card-rules";
import { makeStage3CardState } from "../fixtures/stage3-card-journey";
const bet = (eventId: string, stakeCredits: number, americanOdds = 100) => ({
  eventId,
  stakeCredits,
  americanOdds,
  marketType: "MONEYLINE" as const,
});
const validate = (
  draftPositions: ReturnType<typeof bet>[],
  acceptedPositions: ReturnType<typeof bet>[] = [],
) =>
  validateDraftCard({
    draftPositions,
    acceptedPositions,
    eligibleOpportunities: [],
    ruleset: pocSeason13Ruleset,
  });

describe("rolling weekly card contract", () => {
  it("pins independently reviewable canonical activation hashes", async () => {
    await expect(hashRuleset(pocSeason13Ruleset)).resolves.toBe(
      "e96725423ca2a02a3922ccd05e0ea99916375da199b2438f42be17a1a7a29b65",
    );
    await expect(hashRuleset(simulationSeason13Ruleset)).resolves.toBe(
      "2f033f52a0ae85afe49f314c11e0f6cf4783300bc7b71b71c079b61d08aeced5",
    );
  });
  it("supports explicit Live and Simulation1.3 without activating legacy defaults", () => {
    expect(pocSeason1Ruleset.version).toBe("1.2");
    for (const [mode, rules] of [
      ["LIVE", pocSeason13Ruleset],
      ["SIMULATION", simulationSeason13Ruleset],
    ] as const) {
      expect(
        resolveSeasonCardRules(frozenCardRulesFixture(mode, rules), mode),
      ).toMatchObject({ supported: true, version: "1.3" });
    }
  });
  it("accepts partial batches including an unusable remainder and keeps budget cumulative", () => {
    expect(validate([bet("a", 600)])).toMatchObject({
      accepted: true,
      allocatedCredits: 600,
    });
    expect(validate([bet("b", 375)], [bet("a", 600)])).toMatchObject({
      accepted: true,
      allocatedCredits: 975,
    });
    expect(validate([bet("b", 401)], [bet("a", 600)])).toMatchObject({
      accepted: false,
      code: "OVER_ALLOCATION",
    });
    expect(cardCompliance([bet("a", 600)], pocSeason13Ruleset)).toBe(
      "COMPLIANT",
    );
    expect(cardCompliance([], pocSeason13Ruleset)).toBe("INCOMPLETE");
    expect(cardCompliance([bet("a", 600)], pocSeason1Ruleset)).toBe(
      "INCOMPLETE",
    );
  });
  it("rejects the whole proposed batch on an invalid later bet without mutating prior receipts", () => {
    const accepted = [bet("a", 300)];
    const before = structuredClone(accepted);
    expect(validate([bet("b", 200), bet("b", 100)], accepted)).toMatchObject({
      accepted: false,
      code: "DUPLICATE_OR_OPPOSING_MARKET",
      positionIndex: 1,
    });
    expect(accepted).toEqual(before);
    expect(validate([bet("a", 50)], accepted)).toMatchObject({
      accepted: false,
      code: "DUPLICATE_OR_OPPOSING_MARKET",
    });
  });
  it("retains minimum, whole credits, heavy favorite and total count boundaries", () => {
    expect(validate([bet("a", 49)])).toMatchObject({
      accepted: false,
      code: "BELOW_MINIMUM",
    });
    expect(validate([bet("a", 50.5)])).toMatchObject({
      accepted: false,
      code: "INVALID_STAKE",
    });
    expect(validate([bet("a", 751, -201)])).toMatchObject({
      accepted: false,
      code: "ABOVE_POSITION_CAP",
    });
    expect(validate([bet("a", 750, -201)])).toMatchObject({ accepted: true });
    expect(validate([bet("a", 1000, -200)])).toMatchObject({ accepted: true });
    expect(
      validate(
        [bet("last", 50)],
        Array.from({ length: 20 }, (_, index) => bet(String(index), 50)),
      ),
    ).toMatchObject({ accepted: false, code: "POSITION_LIMIT" });
  });
  it("uses each persisted cutoff and fails closed at its exact instant even without start evidence", () => {
    const event = {
      ...makeStage3CardState().slate[0],
      scheduledStartAt: "2026-09-13T17:00:00Z",
      entryClosesAt: "2026-09-13T17:00:00Z",
      entryOpen: true,
      actualStartedAt: null,
      state: "SCHEDULED" as const,
    };
    expect(eventAcceptsBets(event, "2026-09-13T16:59:59.999Z")).toBe(true);
    expect(eventAcceptsBets(event, "2026-09-13T17:00:00Z")).toBe(false);
    expect(
      eventAcceptsBets(
        { ...event, scheduledStartAt: "2026-09-13T21:00:00Z" },
        "2026-09-13T19:00:00Z",
      ),
    ).toBe(false);
    expect(
      eventAcceptsBets(
        {
          ...event,
          entryClosesAt: "2026-09-13T20:00:00Z",
          scheduledStartAt: "2026-09-13T20:00:00Z",
        },
        "2026-09-13T19:00:00Z",
      ),
    ).toBe(true);
    expect(
      eventAcceptsBets(
        { ...event, actualStartedAt: "2026-09-13T16:59:00Z" },
        "2026-09-13T16:59:30Z",
      ),
    ).toBe(false);
  });
});
