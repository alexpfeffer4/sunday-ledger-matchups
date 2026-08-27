import { describe, expect, it } from "vitest";
import { validateDraftCard } from "@/domain/cards/validate-card-draft";
import { simulationSeason1Ruleset } from "@/rulesets/simulation-season-1";

const eligibleOpportunities = [
  { eventId: "event-1", marketType: "MONEYLINE" as const, americanOdds: -205 },
  { eventId: "event-2", marketType: "SPREAD" as const, americanOdds: -110 },
  { eventId: "event-3", marketType: "TOTAL" as const, americanOdds: -110 },
];

describe("draft card validation", () => {
  it("accepts a complete multi-position card as one unit", () => {
    const result = validateDraftCard({
      draftPositions: [
        {
          eventId: "event-1",
          marketType: "MONEYLINE",
          stakeCredits: 500,
          americanOdds: -205,
        },
        {
          eventId: "event-2",
          marketType: "SPREAD",
          stakeCredits: 250,
          americanOdds: -110,
        },
        {
          eventId: "event-3",
          marketType: "TOTAL",
          stakeCredits: 250,
          americanOdds: -110,
        },
      ],
      eligibleOpportunities,
      ruleset: simulationSeason1Ruleset,
    });

    expect(result).toMatchObject({
      accepted: true,
      allocatedCredits: 1_000,
      positionCount: 3,
    });
  });

  it("rejects the entire draft when one position exceeds its odds cap", () => {
    const result = validateDraftCard({
      draftPositions: [
        {
          eventId: "event-1",
          marketType: "MONEYLINE",
          stakeCredits: 1_000,
          americanOdds: -205,
        },
      ],
      eligibleOpportunities,
      ruleset: simulationSeason1Ruleset,
    });

    expect(result).toMatchObject({
      accepted: false,
      code: "ABOVE_POSITION_CAP",
      positionIndex: 0,
    });
  });

  it("does not accept a partially allocated draft", () => {
    const result = validateDraftCard({
      draftPositions: [
        {
          eventId: "event-2",
          marketType: "SPREAD",
          stakeCredits: 950,
          americanOdds: -110,
        },
      ],
      eligibleOpportunities,
      ruleset: simulationSeason1Ruleset,
    });

    expect(result).toMatchObject({
      accepted: false,
      code: "INCOMPLETE_CARD",
    });
  });

  it("rejects duplicate or opposing sides in the same event market", () => {
    const result = validateDraftCard({
      draftPositions: [
        {
          eventId: "event-2",
          marketType: "SPREAD",
          stakeCredits: 500,
          americanOdds: -110,
        },
        {
          eventId: "event-2",
          marketType: "SPREAD",
          stakeCredits: 500,
          americanOdds: -110,
        },
      ],
      eligibleOpportunities,
      ruleset: simulationSeason1Ruleset,
    });

    expect(result).toMatchObject({
      accepted: false,
      code: "DUPLICATE_OR_OPPOSING_MARKET",
      positionIndex: 1,
    });
  });
});
