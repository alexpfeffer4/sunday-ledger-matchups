import { describe, expect, it } from "vitest";
import {
  calculateStandings,
  type WeeklyStandingInput,
} from "@/domain/standings/rank";

type Decision = WeeklyStandingInput["decision"];
type Compliance = WeeklyStandingInput["compliance"];

function matchup(
  week: number,
  first: string,
  second: string,
  firstDecision: Decision,
  secondDecision: Decision,
  options: {
    firstCompliance?: Compliance;
    secondCompliance?: Compliance;
    firstPoints?: bigint;
    secondPoints?: bigint;
  } = {},
): WeeklyStandingInput[] {
  return [
    {
      week,
      entryId: first,
      opponentEntryId: second,
      compliance: options.firstCompliance ?? "COMPLIANT",
      decision: firstDecision,
      pointsForCenticredits: options.firstPoints ?? 100_000n,
    },
    {
      week,
      entryId: second,
      opponentEntryId: first,
      compliance: options.secondCompliance ?? "COMPLIANT",
      decision: secondDecision,
      pointsForCenticredits: options.secondPoints ?? 100_000n,
    },
  ];
}

function rankedEntries(
  weeklyResults: WeeklyStandingInput[],
  deterministicTiebreaks: Record<string, string> = {},
): string[] {
  const entryIds = [...new Set(weeklyResults.map((result) => result.entryId))];
  return calculateStandings({
    entryIds,
    weeklyResults,
    deterministicTiebreaks,
  }).map((row) => row.entryId);
}

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

  it("preserves both losses when both head-to-head cards are incomplete", () => {
    const results = matchup(1, "a", "b", "LOSS", "LOSS", {
      firstCompliance: "INCOMPLETE",
      secondCompliance: "INCOMPLETE",
      firstPoints: 0n,
      secondPoints: 0n,
    });
    const rows = calculateStandings({
      entryIds: ["a", "b"],
      weeklyResults: results,
      deterministicTiebreaks: { a: "1", b: "2" },
    });

    expect(rows.map((row) => row.entryId)).toEqual(["a", "b"]);
    expect(
      rows.map(({ wins, losses, ties }) => ({ wins, losses, ties })),
    ).toEqual([
      { wins: 0, losses: 1, ties: 0 },
      { wins: 0, losses: 1, ties: 0 },
    ]);
  });

  it("rejects a mini-table when equal member totals hide unequal pair counts", () => {
    const results = [
      ...matchup(1, "a", "b", "LOSS", "WIN"),
      ...matchup(1, "c", "d", "LOSS", "WIN"),
      ...matchup(2, "a", "b", "LOSS", "WIN"),
      ...matchup(2, "c", "d", "LOSS", "WIN"),
      ...matchup(3, "b", "c", "LOSS", "WIN"),
      ...matchup(3, "a", "d", "LOSS", "WIN"),
      ...matchup(4, "b", "c", "LOSS", "WIN"),
      ...matchup(4, "a", "d", "LOSS", "WIN"),
      ...matchup(5, "a", "c", "LOSS", "WIN"),
      ...matchup(5, "b", "d", "LOSS", "WIN"),
    ];
    const externalWins = { a: 5, b: 3, c: 2, d: 0 } as const;
    for (const entryId of ["a", "b", "c", "d"] as const) {
      for (let game = 0; game < 5; game += 1) {
        const opponent = `${entryId}-external-${game}`;
        const entryWins = game < externalWins[entryId];
        results.push(
          ...matchup(
            6 + game,
            entryId,
            opponent,
            entryWins ? "WIN" : "LOSS",
            entryWins ? "LOSS" : "WIN",
          ),
        );
      }
    }

    const order = rankedEntries(results, {
      a: "1",
      b: "2",
      c: "3",
      d: "4",
    }).filter((entryId) => ["a", "b", "c", "d"].includes(entryId));

    // Every tied member has five group meetings, but pair counts are 2 or 1.
    // A member-total check would incorrectly rank d-c-b-a by H2H.
    expect(order).toEqual(["a", "b", "c", "d"]);
  });

  it("applies the complete tiebreak chain in its published order", () => {
    const winPercentage = [
      ...matchup(1, "record", "record-opponent", "WIN", "LOSS", {
        firstPoints: 1n,
        secondPoints: 1_000_000n,
      }),
      ...matchup(2, "points", "points-opponent", "LOSS", "WIN", {
        firstPoints: 1_000_000n,
        secondPoints: 1n,
      }),
    ];
    expect(
      rankedEntries(winPercentage).filter((entry) =>
        ["record", "points"].includes(entry),
      ),
    ).toEqual(["record", "points"]);

    const pointsFor = [
      ...matchup(1, "a", "b", "WIN", "LOSS"),
      ...matchup(2, "a", "x", "LOSS", "WIN", {
        firstPoints: 200_000n,
        secondPoints: 200_000n,
      }),
      ...matchup(2, "b", "y", "WIN", "LOSS"),
    ];
    expect(
      rankedEntries(pointsFor, { a: "9", b: "1" }).filter((entry) =>
        ["a", "b"].includes(entry),
      ),
    ).toEqual(["a", "b"]);

    const allPlay = [
      ...matchup(1, "a", "x", "WIN", "LOSS", {
        firstPoints: 200_000n,
        secondPoints: 100_000n,
      }),
      ...matchup(1, "b", "y", "WIN", "LOSS", {
        firstPoints: 0n,
        secondPoints: 100_000n,
      }),
      ...matchup(2, "a", "x", "LOSS", "WIN", {
        firstPoints: 0n,
        secondPoints: 0n,
      }),
      ...matchup(2, "b", "y", "LOSS", "WIN", {
        firstPoints: 200_000n,
        secondPoints: 0n,
      }),
    ];
    expect(
      rankedEntries(allPlay, { a: "9", b: "1" }).filter((entry) =>
        ["a", "b"].includes(entry),
      ),
    ).toEqual(["a", "b"]);

    const balancedHeadToHead = [
      ...matchup(1, "a", "b", "WIN", "LOSS"),
      ...matchup(2, "a", "x", "LOSS", "WIN"),
      ...matchup(2, "b", "y", "WIN", "LOSS"),
    ];
    expect(
      rankedEntries(balancedHeadToHead, { a: "9", b: "1" }).filter((entry) =>
        ["a", "b"].includes(entry),
      ),
    ).toEqual(["a", "b"]);

    const attendance = [
      ...matchup(1, "a", "x", "LOSS", "WIN", {
        firstPoints: 0n,
        secondCompliance: "INCOMPLETE",
        secondPoints: 0n,
      }),
      ...matchup(2, "b", "y", "LOSS", "WIN", {
        firstCompliance: "INCOMPLETE",
        firstPoints: 0n,
        secondPoints: 0n,
      }),
    ];
    expect(
      rankedEntries(attendance, { a: "9", b: "1" }).filter((entry) =>
        ["a", "b"].includes(entry),
      ),
    ).toEqual(["a", "b"]);

    const highestWeek = [
      ...matchup(1, "a", "x1", "LOSS", "WIN", {
        firstPoints: 150_000n,
        secondCompliance: "INCOMPLETE",
        secondPoints: 0n,
      }),
      ...matchup(2, "a", "x2", "LOSS", "WIN", {
        firstPoints: 50_000n,
        secondCompliance: "INCOMPLETE",
        secondPoints: 0n,
      }),
      ...matchup(3, "b", "y1", "LOSS", "WIN", {
        secondCompliance: "INCOMPLETE",
        secondPoints: 0n,
      }),
      ...matchup(4, "b", "y2", "LOSS", "WIN", {
        secondCompliance: "INCOMPLETE",
        secondPoints: 0n,
      }),
    ];
    expect(
      rankedEntries(highestWeek, { a: "9", b: "1" }).filter((entry) =>
        ["a", "b"].includes(entry),
      ),
    ).toEqual(["a", "b"]);

    const storedRandom = [
      ...matchup(1, "a", "x", "LOSS", "WIN", {
        secondCompliance: "INCOMPLETE",
        secondPoints: 0n,
      }),
      ...matchup(2, "b", "y", "LOSS", "WIN", {
        secondCompliance: "INCOMPLETE",
        secondPoints: 0n,
      }),
    ];
    expect(
      rankedEntries(storedRandom, { a: "2", b: "1" }).filter((entry) =>
        ["a", "b"].includes(entry),
      ),
    ).toEqual(["b", "a"]);
  });
});
