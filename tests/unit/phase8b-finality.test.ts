import { describe, expect, it } from "vitest";
import {
  deriveChampionFinality,
  pairWeek18Exhibitions,
  rebuildEffectiveWeek18Round,
  week18PairingsRemainReplaceable,
  type EarlierRoundElimination,
  type FinalPostseasonPlacement,
  type TerminalMatchupFact,
} from "@/domain/playoffs/finality";

function matchup(
  suffix: string,
  sideAEntryId: string,
  sideBEntryId: string,
  sideADecision: "WIN" | "LOSS" | "TIE",
  sideBDecision: "WIN" | "LOSS" | "TIE",
): TerminalMatchupFact {
  return {
    matchupId: `matchup-${suffix}`,
    resultVersionId: `result-${suffix}`,
    sideAEntryId,
    sideBEntryId,
    sideADecision,
    sideBDecision,
  };
}

function derive(rosterSize: number, tiedThird = false) {
  const order = Array.from(
    { length: rosterSize },
    (_, index) => `entry-${index + 1}`,
  );
  const qualifierCount = rosterSize > 8 ? 6 : 4;
  const eliminations: EarlierRoundElimination[] = Array.from(
    { length: qualifierCount - 4 },
    (_, index) => ({
      entryId: `entry-${index + 5}`,
      placement: 5,
      resultVersionId: `result-opening-${index + 1}`,
    }),
  );
  return {
    order,
    finality: deriveChampionFinality({
      frozenWeek14Order: order,
      qualifierEntryIds: order.slice(0, qualifierCount),
      championship: matchup("title", "entry-2", "entry-1", "WIN", "LOSS"),
      thirdPlace: matchup(
        "third",
        "entry-4",
        "entry-3",
        tiedThird ? "TIE" : "LOSS",
        tiedThird ? "TIE" : "WIN",
      ),
      earlierRoundEliminations: eliminations,
    }),
  };
}

describe("Phase 8B champion finality", () => {
  it("derives the podium and orders equal placements by frozen Week 14", () => {
    const { finality } = derive(10, true);
    expect(finality).toMatchObject({
      championEntryId: "entry-2",
      runnerUpEntryId: "entry-1",
      thirdPlaceEntryIds: ["entry-3", "entry-4"],
      thirdPlaceTied: true,
    });
    expect(
      finality.placements
        .slice(0, 6)
        .map((placement) => [placement.entryId, placement.placement]),
    ).toEqual([
      ["entry-2", 1],
      ["entry-1", 2],
      ["entry-3", 3],
      ["entry-4", 3],
      ["entry-5", 5],
      ["entry-6", 5],
    ]);
  });

  it("represents four- and five-qualifier six-slot fields without invented finishers", () => {
    const order = Array.from(
      { length: 10 },
      (_, index) => `entry-${index + 1}`,
    );
    for (const qualifierCount of [4, 5]) {
      const finality = deriveChampionFinality({
        frozenWeek14Order: order,
        qualifierEntryIds: order.slice(0, qualifierCount),
        championship: matchup("title", "entry-1", "entry-2", "WIN", "LOSS"),
        thirdPlace: matchup("third", "entry-3", "entry-4", "WIN", "LOSS"),
        earlierRoundEliminations:
          qualifierCount === 5
            ? [{ entryId: "entry-5", placement: 5, resultVersionId: "r5" }]
            : [],
      });
      expect(finality.placements).toHaveLength(10);
      expect(
        finality.placements.filter(
          (placement) => placement.role !== "NON_QUALIFIER",
        ),
      ).toHaveLength(qualifierCount);
    }
  });

  it("never accepts a tied championship or an incomplete qualifier placement", () => {
    const order = ["a", "b", "c", "d"];
    expect(() =>
      deriveChampionFinality({
        frozenWeek14Order: order,
        qualifierEntryIds: order,
        championship: matchup("title", "a", "b", "TIE", "TIE"),
        thirdPlace: matchup("third", "c", "d", "WIN", "LOSS"),
        earlierRoundEliminations: [],
      }),
    ).toThrow("deterministic winner");
  });
});

describe("Phase 8B Week 18 pairing and freeze", () => {
  for (const rosterSize of [4, 6, 8, 10, 12, 14, 16]) {
    it(`pairs every member once for a ${rosterSize}-member roster`, () => {
      const { order, finality } = derive(rosterSize);
      const pairings = pairWeek18Exhibitions({
        placements: finality.placements,
        frozenWeek14Order: order,
      });
      const appearances = pairings.flatMap((pairing) => [
        pairing.sideA.entryId,
        pairing.sideB.entryId,
      ]);
      expect(pairings).toHaveLength(rosterSize / 2);
      expect(new Set(appearances)).toHaveLength(rosterSize);
      expect(pairings[0]).toMatchObject({
        role: "EXHIBITION",
        sideA: { entryId: "entry-2" },
        sideB: { entryId: "entry-1" },
      });
    });
  }

  it("allows replacement only while planned/open and wholly untouched", () => {
    const base = {
      weekState: "OPEN" as const,
      hasSuccessfulCardSeal: false,
      hasReceipt: false,
      hasScoreVersion: false,
      hasResultVersion: false,
    };
    expect(week18PairingsRemainReplaceable(base)).toBe(true);
    for (const frozen of [
      { ...base, hasSuccessfulCardSeal: true },
      { ...base, hasReceipt: true },
      { ...base, hasScoreVersion: true },
      { ...base, hasResultVersion: true },
      { ...base, weekState: "LOCKED" as const },
    ]) {
      expect(week18PairingsRemainReplaceable(frozen)).toBe(false);
    }
  });

  it("appends a changed pre-seal round and preserves a frozen round by identity", () => {
    const order = ["a", "b", "c", "d"];
    const placements: FinalPostseasonPlacement[] = order.map(
      (entryId, index) => ({
        entryId,
        placement: index + 1,
        role:
          index === 0
            ? "CHAMPION"
            : index === 1
              ? "RUNNER_UP"
              : index === 2
                ? "THIRD_PLACE"
                : "FOURTH_PLACE",
        tied: false,
      }),
    );
    const currentRound = {
      version: 1,
      supersedesVersion: null,
      placementOrder: order,
      pairings: pairWeek18Exhibitions({ placements, frozenWeek14Order: order }),
    };
    const changed = [
      { ...placements[1]!, placement: 1, role: "CHAMPION" as const },
      { ...placements[0]!, placement: 2, role: "RUNNER_UP" as const },
      placements[2]!,
      placements[3]!,
    ];
    const openProtection = {
      weekState: "OPEN" as const,
      hasSuccessfulCardSeal: false,
      hasReceipt: false,
      hasScoreVersion: false,
      hasResultVersion: false,
    };
    expect(
      rebuildEffectiveWeek18Round({
        currentRound,
        nextPlacements: changed,
        frozenWeek14Order: order,
        protection: openProtection,
      }),
    ).toMatchObject({
      status: "SUPERSEDED",
      round: { version: 2, supersedesVersion: 1 },
    });

    const frozen = rebuildEffectiveWeek18Round({
      currentRound,
      nextPlacements: changed,
      frozenWeek14Order: order,
      protection: { ...openProtection, hasSuccessfulCardSeal: true },
    });
    expect(frozen).toEqual({ status: "FROZEN", round: currentRound });
    expect(frozen.round).toBe(currentRound);
  });
});
