import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { generateRegularSeasonSchedule } from "@/domain/schedule/generate";

const supportedSizes = [4, 6, 8, 10, 12, 14, 16] as const;
const hexSeed = fc.string({
  unit: fc.constantFrom(..."0123456789abcdef"),
  minLength: 32,
  maxLength: 32,
});

function pairKey(left: string, right: string): string {
  return [left, right].sort().join(":");
}

describe("regular-season schedule properties", () => {
  it("satisfies every roster-size invariant over many public seeds", () => {
    fc.assert(
      fc.property(fc.constantFrom(...supportedSizes), hexSeed, (size, seed) => {
        const entryIds = Array.from(
          { length: size },
          (_, index) => `entry-${index + 1}`,
        );
        const schedule = generateRegularSeasonSchedule({ entryIds, seed });
        const reordered = generateRegularSeasonSchedule({
          entryIds: [...entryIds].reverse(),
          seed,
        });
        expect(schedule.outputHash).toBe(reordered.outputHash);
        expect(schedule.matchups).toHaveLength((size / 2) * 14);

        const frequency = new Map<string, number>();
        for (let week = 1; week <= 14; week += 1) {
          const weekGames = schedule.matchups.filter(
            (matchup) => matchup.week === week,
          );
          const participants = weekGames.flatMap((matchup) => [
            matchup.sideAEntryId,
            matchup.sideBEntryId,
          ]);
          expect(new Set(participants).size).toBe(size);
          expect(participants).toHaveLength(size);
          for (const game of weekGames) {
            expect(game.sideAEntryId).not.toBe(game.sideBEntryId);
            const key = pairKey(game.sideAEntryId, game.sideBEntryId);
            frequency.set(key, (frequency.get(key) ?? 0) + 1);
          }
        }

        const counts = [...frequency.values()];
        expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(
          1,
        );

        for (let week = 2; week <= 14; week += 1) {
          const priorPairs = new Set(
            schedule.matchups
              .filter((matchup) => matchup.week === week - 1)
              .map((matchup) =>
                pairKey(matchup.sideAEntryId, matchup.sideBEntryId),
              ),
          );
          for (const matchup of schedule.matchups.filter(
            (game) => game.week === week,
          )) {
            expect(
              priorPairs.has(
                pairKey(matchup.sideAEntryId, matchup.sideBEntryId),
              ),
            ).toBe(false);
          }
        }
      }),
      { numRuns: 70 },
    );
  });
});
