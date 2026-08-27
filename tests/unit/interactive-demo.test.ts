import { describe, expect, it } from "vitest";
import {
  getInteractiveDemoOpportunity,
  interactiveDemoEvents,
  interactiveDemoOpponentPositions,
  settleInteractiveDemoPositions,
} from "@/adapters/simulation/interactive-week";
import {
  cardCompliance,
  validateProposedPosition,
} from "@/domain/cards/validate-position";
import { weeklyScore } from "@/domain/settlement/settle";
import { simulationSeason1Ruleset } from "@/rulesets/simulation-season-1";

describe("solo interactive demo", () => {
  it("offers both sides of all three eligible markets across three games", () => {
    expect(interactiveDemoEvents).toHaveLength(3);
    expect(
      interactiveDemoEvents.every(
        (event) =>
          event.markets.length === 3 &&
          event.markets.every((market) => market.opportunities.length === 2),
      ),
    ).toBe(true);
  });

  it("uses the real heavy-favorite cap for the Kansas City moneyline", () => {
    const opportunity = getInteractiveDemoOpportunity("demo-kc-ml");
    expect(opportunity).not.toBeNull();
    if (!opportunity) return;

    const validation = validateProposedPosition({
      acceptedPositions: [],
      proposedPosition: {
        eventId: opportunity.eventId,
        marketType: opportunity.marketType,
        stakeCredits: 1_000,
        americanOdds: opportunity.americanOdds,
      },
      eligibleOpportunities: [
        {
          eventId: opportunity.eventId,
          marketType: opportunity.marketType,
          americanOdds: opportunity.americanOdds,
        },
      ],
      ruleset: simulationSeason1Ruleset,
    });

    expect(validation).toMatchObject({
      accepted: false,
      code: "ABOVE_POSITION_CAP",
      maximumStakeCredits: 750,
    });
  });

  it("settles the automated opponent through the production settlement math", () => {
    const accepted = interactiveDemoOpponentPositions.map((position) => {
      const opportunity = getInteractiveDemoOpportunity(position.opportunityId);
      if (!opportunity) throw new Error("Missing test opportunity.");
      return {
        eventId: opportunity.eventId,
        marketType: opportunity.marketType,
        stakeCredits: position.stakeCredits,
        americanOdds: opportunity.americanOdds,
      };
    });
    const settled = settleInteractiveDemoPositions(
      interactiveDemoOpponentPositions,
    );

    expect(cardCompliance(accepted, simulationSeason1Ruleset)).toBe(
      "COMPLIANT",
    );
    expect(settled.map((position) => position.settlement.outcome)).toEqual([
      "LOSS",
      "WIN",
      "LOSS",
    ]);
    expect(weeklyScore(settled.map((position) => position.settlement))).toBe(
      74_390n,
    );
  });
});
