import { describe, expect, it } from "vitest";
import {
  advancePlayoffMatchup,
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
    ).toEqual({ advancingEntryId: "seed-2", reason: "HIGHER_SEED_TIEBREAK" });
  });
});
