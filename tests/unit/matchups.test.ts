import { describe, expect, it } from "vitest";
import {
  advancePlayoffMatchup,
  decideNonChampionshipMatchup,
  decideRegularSeasonMatchup,
} from "@/domain/matchups/decide";

describe("matchup decisions", () => {
  it("gives both incomplete cards a loss and zero Points For", () => {
    expect(
      decideRegularSeasonMatchup(
        { entryId: "a", compliance: "INCOMPLETE", scoreCenticredits: 90_000n },
        { entryId: "b", compliance: "INCOMPLETE", scoreCenticredits: 80_000n },
      ),
    ).toEqual({
      decisions: { a: "LOSS", b: "LOSS" },
      pointsForCenticredits: { a: 0n, b: 0n },
    });
  });

  it("records exact compliant-score equality as a tie", () => {
    expect(
      decideRegularSeasonMatchup(
        { entryId: "a", compliance: "COMPLIANT", scoreCenticredits: 100_000n },
        { entryId: "b", compliance: "COMPLIANT", scoreCenticredits: 100_000n },
      ).decisions,
    ).toEqual({ a: "TIE", b: "TIE" });
  });

  it("advances the higher qualification seed on a playoff tie or both-incomplete game", () => {
    expect(
      advancePlayoffMatchup({
        sideA: {
          entryId: "seed-2",
          qualificationSeed: 2,
          compliance: "INCOMPLETE",
          scoreCenticredits: 0n,
        },
        sideB: {
          entryId: "seed-5",
          qualificationSeed: 5,
          compliance: "INCOMPLETE",
          scoreCenticredits: 0n,
        },
      }),
    ).toEqual({
      advancingEntryId: "seed-2",
      eliminatedEntryId: "seed-5",
      reason: "HIGHER_SEED_TIEBREAK",
    });
  });

  it("advances the higher qualification seed on an exact compliant championship tie", () => {
    expect(
      advancePlayoffMatchup({
        sideA: {
          entryId: "seed-3",
          qualificationSeed: 3,
          compliance: "COMPLIANT",
          scoreCenticredits: 100_000n,
        },
        sideB: {
          entryId: "seed-6",
          qualificationSeed: 6,
          compliance: "COMPLIANT",
          scoreCenticredits: 100_000n,
        },
      }),
    ).toMatchObject({
      advancingEntryId: "seed-3",
      reason: "HIGHER_SEED_TIEBREAK",
    });
  });

  it("eliminates the only incomplete championship participant", () => {
    expect(
      advancePlayoffMatchup({
        sideA: {
          entryId: "seed-1",
          qualificationSeed: 1,
          compliance: "INCOMPLETE",
          scoreCenticredits: 0n,
        },
        sideB: {
          entryId: "seed-4",
          qualificationSeed: 4,
          compliance: "COMPLIANT",
          scoreCenticredits: 1n,
        },
      }),
    ).toMatchObject({
      advancingEntryId: "seed-4",
      eliminatedEntryId: "seed-1",
      reason: "INCOMPLETE",
    });
  });

  it("keeps a compliant third-place tie and never invents advancement", () => {
    expect(
      decideNonChampionshipMatchup({
        role: "THIRD_PLACE",
        sideA: {
          entryId: "a",
          compliance: "COMPLIANT",
          scoreCenticredits: 10n,
        },
        sideB: {
          entryId: "b",
          compliance: "COMPLIANT",
          scoreCenticredits: 10n,
        },
      }),
    ).toMatchObject({
      decisions: { a: "TIE", b: "TIE" },
      advancingEntryId: null,
      affectsOfficialCompetition: false,
    });
  });

  for (const role of ["THIRD_PLACE", "PLACEMENT", "EXHIBITION"] as const) {
    it(`isolates an incomplete ${role.toLowerCase()} card as an Exhibition miss`, () => {
      expect(
        decideNonChampionshipMatchup({
          role,
          sideA: {
            entryId: "a",
            compliance: "INCOMPLETE",
            scoreCenticredits: 999n,
          },
          sideB: {
            entryId: "b",
            compliance: "COMPLIANT",
            scoreCenticredits: 40n,
          },
        }),
      ).toEqual({
        role,
        decisions: { a: "NONE", b: "NONE" },
        exhibitionScoresCenticredits: { a: 0n, b: 40n },
        participationMarkers: { a: "EXHIBITION_MISS", b: "COMPLETED" },
        advancingEntryId: null,
        affectsOfficialCompetition: false,
      });
    });
  }
});
