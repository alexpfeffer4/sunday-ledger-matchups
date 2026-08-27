import { describe, expect, it } from "vitest";
import { settleReceipt, weeklyScore } from "@/domain/settlement/settle";

describe("receipt settlement", () => {
  const final = {
    eventId: "game-1",
    status: "FINAL" as const,
    homeScore: 27,
    awayScore: 24,
  };

  it("settles moneyline including overtime final score", () => {
    expect(
      settleReceipt(
        {
          id: "r1",
          eventId: "game-1",
          marketType: "MONEYLINE",
          selectedSide: "HOME",
          americanOdds: -150,
          stakeCredits: 300,
        },
        final,
      ),
    ).toEqual({
      receiptId: "r1",
      outcome: "WIN",
      returnedCenticredits: 50_000n,
    });
  });

  it("settles spreads and pushes at the accepted line", () => {
    const settlement = settleReceipt(
      {
        id: "r2",
        eventId: "game-1",
        marketType: "SPREAD",
        selectedSide: "AWAY",
        lineMilli: 3_000,
        americanOdds: -110,
        stakeCredits: 500,
      },
      final,
    );
    expect(settlement.outcome).toBe("PUSH");
    expect(settlement.returnedCenticredits).toBe(50_000n);
  });

  it("settles totals with thousandth-point lines", () => {
    expect(
      settleReceipt(
        {
          id: "r3",
          eventId: "game-1",
          marketType: "TOTAL",
          selectedSide: "OVER",
          lineMilli: 50_500,
          americanOdds: 105,
          stakeCredits: 200,
        },
        final,
      ).outcome,
    ).toBe("WIN");
  });

  it("keeps nonfinal events pending and sums only a complete card", () => {
    const pending = settleReceipt(
      {
        id: "r4",
        eventId: "game-1",
        marketType: "MONEYLINE",
        selectedSide: "HOME",
        americanOdds: -110,
        stakeCredits: 500,
      },
      { eventId: "game-1", status: "LIVE" },
    );
    expect(pending.outcome).toBe("PENDING");
    expect(weeklyScore([pending])).toBeNull();
    expect(
      weeklyScore([
        { receiptId: "a", outcome: "WIN", returnedCenticredits: 95_455n },
        { receiptId: "b", outcome: "LOSS", returnedCenticredits: 0n },
      ]),
    ).toBe(95_455n);
  });
});
