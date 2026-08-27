import { describe, expect, it } from "vitest";
import {
  createInitialBracket,
  reseedLargeLeagueSemifinals,
} from "@/domain/playoffs/bracket";

describe("playoff bracket", () => {
  const qualifiers = Array.from({ length: 6 }, (_, index) => ({
    entryId: `seed-${index + 1}`,
    qualificationSeed: index + 1,
  }));

  it("creates the top-six opening round with explicit top-seed semifinal slots", () => {
    const bracket = createInitialBracket({
      rosterSize: 10,
      qualifiers,
      allEntriesByFinalStanding: Array.from(
        { length: 10 },
        (_, index) => `seed-${index + 1}`,
      ),
    });
    expect(bracket[0]).toMatchObject({
      week: 15,
      sideA: { qualificationSeed: 3 },
      sideB: { qualificationSeed: 6 },
    });
    expect(bracket[2]).toMatchObject({
      week: 16,
      sideA: { qualificationSeed: 1 },
    });
  });

  it("re-seeds so No. 1 receives the lowest-ranked remaining seed", () => {
    const semifinals = reseedLargeLeagueSemifinals({
      seedOne: qualifiers[0]!,
      seedTwo: qualifiers[1]!,
      openingRoundWinners: [qualifiers[2]!, qualifiers[4]!],
    });
    expect(semifinals[0].sideB?.qualificationSeed).toBe(5);
    expect(semifinals[1].sideB?.qualificationSeed).toBe(3);
  });
});
