import { describe, expect, it } from "vitest";
import {
  calculateStandings,
  type WeeklyStandingInput,
} from "@/domain/standings/rank";

describe("standings", () => {
  it("keeps record primary, excludes incomplete cards from all-play, and counts misses", () => {
    const results: WeeklyStandingInput[] = [
      {
        week: 1,
        entryId: "a",
        opponentEntryId: "b",
        compliance: "COMPLIANT",
        decision: "WIN",
        pointsForCenticredits: 90_000n,
      },
      {
        week: 1,
        entryId: "b",
        opponentEntryId: "a",
        compliance: "COMPLIANT",
        decision: "LOSS",
        pointsForCenticredits: 110_000n,
      },
      {
        week: 1,
        entryId: "c",
        opponentEntryId: "d",
        compliance: "INCOMPLETE",
        decision: "LOSS",
        pointsForCenticredits: 0n,
      },
      {
        week: 1,
        entryId: "d",
        opponentEntryId: "c",
        compliance: "COMPLIANT",
        decision: "WIN",
        pointsForCenticredits: 80_000n,
      },
    ];
    const rows = calculateStandings({
      entryIds: ["a", "b", "c", "d"],
      weeklyResults: results,
      deterministicTiebreaks: { a: "a", b: "b", c: "c", d: "d" },
    });
    expect(rows.map((row) => row.entryId)).toEqual(["a", "d", "b", "c"]);
    expect(rows.find((row) => row.entryId === "c")).toMatchObject({
      attendanceMisses: 1,
      allPlayComparisonCount: 0,
    });
  });
});
