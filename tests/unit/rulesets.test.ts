import { describe, expect, it } from "vitest";
import { canonicalizeRuleset, hashRuleset } from "@/rulesets/canonicalize";
import { pocSeason1Ruleset } from "@/rulesets/poc-season-1";
import { simulationSeason1Ruleset } from "@/rulesets/simulation-season-1";

describe("season rulesets", () => {
  it("encodes the approved POC concentration package", () => {
    expect(pocSeason1Ruleset.concentration).toEqual({
      status: "SETTLED_FOR_POC_V1",
      heavyFavoriteThresholdAmerican: -200,
      heavyFavoriteSinglePositionCapCredits: 750,
      standardSinglePositionCapCredits: 1_000,
      eligibleOddsMinimum: null,
      eligibleOddsMaximum: null,
      aggregateFavoriteExposureCapCredits: null,
    });
    expect(pocSeason1Ruleset.version).toBe("1.1");
  });

  it("keeps simulation visibly distinct without changing participant rules", () => {
    expect(simulationSeason1Ruleset.mode).toBe("SIMULATION");
    expect(simulationSeason1Ruleset.id).not.toBe(pocSeason1Ruleset.id);
    expect(simulationSeason1Ruleset.card).toEqual(pocSeason1Ruleset.card);
    expect(simulationSeason1Ruleset.standings).toEqual(
      pocSeason1Ruleset.standings,
    );
  });

  it("freezes sparse qualification and every-member Week 15–17 policy", () => {
    expect(pocSeason1Ruleset.playoffs).toMatchObject({
      minimumChampionshipField: 4,
      selectionOrder: "ELIGIBLE_BEFORE_REINSTATED",
      reinstatementReason: "MINIMUM_FOUR_CHAMPIONSHIP_FIELD",
      noReinstatementAtOrAboveEligibleCount: 4,
      regularSeasonAttendanceFrozenAfterWeek: 14,
      postseasonRoles: [
        "CHAMPIONSHIP",
        "THIRD_PLACE",
        "PLACEMENT",
        "EXHIBITION",
      ],
      exhibitionMiss: {
        marker: "EXHIBITION_MISS",
        scoreCenticredits: 0,
        affectsOfficialCompetition: false,
      },
      everyMemberPostseasonParticipation: {
        weeks: [15, 16, 17],
        cardsPerMemberPerWeek: 1,
        matchupsPerMemberPerWeek: 1,
        byeExhibitions: true,
      },
    });
  });

  it("canonicalizes object keys and produces a stable SHA-256 hash", async () => {
    expect(canonicalizeRuleset({ b: 2, a: { d: 4, c: 3 } })).toBe(
      '{"a":{"c":3,"d":4},"b":2}',
    );
    await expect(hashRuleset({ b: 2, a: 1 })).resolves.toBe(
      await hashRuleset({ a: 1, b: 2 }),
    );
    await expect(hashRuleset(pocSeason1Ruleset)).resolves.toBe(
      "047550e7661915d3ba4d8e4046f85ab9474eac7b857fbba398cb4d9b91a5766c",
    );
    await expect(hashRuleset(simulationSeason1Ruleset)).resolves.toBe(
      "64772aad744ed8d5ec12b9e43e1303a610fc92051c250204bffb20c00f5e7a7d",
    );
  });
});
