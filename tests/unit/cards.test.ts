import { describe, expect, it } from "vitest";
import { canCompleteCard } from "@/domain/cards/completion";
import {
  cardCompliance,
  maximumStakeForOdds,
  validateProposedPosition,
} from "@/domain/cards/validate-position";
import { pocSeason1Ruleset } from "@/rulesets/poc-season-1";

const opportunities = [
  { eventId: "one", marketType: "MONEYLINE" as const, americanOdds: -201 },
  { eventId: "two", marketType: "SPREAD" as const, americanOdds: -110 },
  { eventId: "three", marketType: "TOTAL" as const, americanOdds: 100 },
];

describe("card validation", () => {
  it("uses the approved shorter-than-minus-200 cliff exactly", () => {
    expect(maximumStakeForOdds(-201, pocSeason1Ruleset)).toBe(750);
    expect(maximumStakeForOdds(-200, pocSeason1Ruleset)).toBe(1_000);
    expect(maximumStakeForOdds(450, pocSeason1Ruleset)).toBe(1_000);
  });

  it("blocks a heavy-favorite all-in and permits a 750-credit concentration", () => {
    const blocked = validateProposedPosition({
      acceptedPositions: [],
      proposedPosition: {
        eventId: "one",
        marketType: "MONEYLINE",
        americanOdds: -201,
        stakeCredits: 1_000,
      },
      eligibleOpportunities: opportunities,
      ruleset: pocSeason1Ruleset,
    });
    expect(blocked).toMatchObject({
      accepted: false,
      code: "ABOVE_POSITION_CAP",
    });

    const accepted = validateProposedPosition({
      acceptedPositions: [],
      proposedPosition: {
        eventId: "one",
        marketType: "MONEYLINE",
        americanOdds: -201,
        stakeCredits: 750,
      },
      eligibleOpportunities: opportunities,
      ruleset: pocSeason1Ruleset,
    });
    expect(accepted).toMatchObject({ accepted: true, remainingCredits: 250 });
  });

  it("rejects stranded 1–49 credit remainders", () => {
    const result = validateProposedPosition({
      acceptedPositions: [],
      proposedPosition: {
        eventId: "two",
        marketType: "SPREAD",
        americanOdds: -110,
        stakeCredits: 975,
      },
      eligibleOpportunities: opportunities,
      ruleset: pocSeason1Ruleset,
    });
    expect(result).toMatchObject({
      accepted: false,
      code: "NO_LEGAL_COMPLETION",
    });
  });

  it("solves exact completion against slots and opportunity caps", () => {
    expect(
      canCompleteCard({
        remainderCredits: 800,
        minimumStakeCredits: 50,
        remainingPositionSlots: 2,
        opportunities: [
          { eventId: "a", marketType: "MONEYLINE", maximumStakeCredits: 750 },
          { eventId: "b", marketType: "SPREAD", maximumStakeCredits: 750 },
        ],
      }),
    ).toEqual({ possible: true, positionsNeeded: 2 });

    expect(
      canCompleteCard({
        remainderCredits: 800,
        minimumStakeCredits: 50,
        remainingPositionSlots: 1,
        opportunities: [
          { eventId: "a", marketType: "MONEYLINE", maximumStakeCredits: 750 },
        ],
      }),
    ).toEqual({ possible: false, reason: "INSUFFICIENT_CAPACITY" });
  });

  it("marks only exactly allocated cards compliant", () => {
    expect(
      cardCompliance(
        [
          {
            eventId: "one",
            marketType: "MONEYLINE",
            stakeCredits: 750,
            americanOdds: -201,
          },
          {
            eventId: "two",
            marketType: "SPREAD",
            stakeCredits: 250,
            americanOdds: -110,
          },
        ],
        pocSeason1Ruleset,
      ),
    ).toBe("COMPLIANT");
  });
});
