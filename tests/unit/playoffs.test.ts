import { describe, expect, it } from "vitest";
import {
  createInitialBracket,
  qualifyPlayoffs,
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

  it("removes attendance-ineligible entries before assigning playoff seeds", () => {
    const standings = Array.from({ length: 10 }, (_, index) => ({
      entryId: `entry-${index + 1}`,
      wins: 10 - index,
      losses: index,
      ties: 0,
      pointsForCenticredits: BigInt(100_000 - index),
      allPlayHalfWinUnits: 0,
      allPlayComparisonCount: 0,
      attendanceMisses: index === 2 ? 3 : 0,
      highestWeekCenticredits: 100_000n,
      deterministicTiebreak: index.toString(),
    }));

    expect(
      qualifyPlayoffs({
        orderedStandings: standings,
        playoffIneligibilityAtMisses: 3,
      }),
    ).toEqual([
      { entryId: "entry-1", qualificationSeed: 1 },
      { entryId: "entry-2", qualificationSeed: 2 },
      { entryId: "entry-4", qualificationSeed: 3 },
      { entryId: "entry-5", qualificationSeed: 4 },
      { entryId: "entry-6", qualificationSeed: 5 },
      { entryId: "entry-7", qualificationSeed: 6 },
    ]);
  });
});
