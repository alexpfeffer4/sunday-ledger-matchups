import { describe, expect, it } from "vitest";
import {
  formatMarketProposition,
  marketOptionCopy,
} from "@/components/card/market-option-copy";

describe("market proposition copy", () => {
  it("removes database-scale zeroes without changing meaningful precision", () => {
    expect(formatMarketProposition("Over 45.5000000000000000")).toBe(
      "Over 45.5",
    );
    expect(formatMarketProposition("Under 44.050000")).toBe("Under 44.05");
    expect(formatMarketProposition("Over 45.000000")).toBe("Over 45");
  });

  it("leaves ordinary proposition copy unchanged", () => {
    expect(formatMarketProposition("Arizona Firebirds to win")).toBe(
      "Arizona Firebirds to win",
    );
  });
});

it("preserves signed and zero player yardage lines in the visible and accessible terms", () => {
  for (const lineMilli of [-1500, 0, 245500]) {
    const result = marketOptionCopy({
      americanOdds: -110,
      awayTeam: "Away",
      homeTeam: "Home",
      fallbackLabel: "Player yards",
      lineMilli,
      marketType: "PLAYER_PASSING_YARDS",
      outcomeKey: "OVER",
    });
    const line = String(lineMilli / 1000).replace("-", "−");
    expect(result.secondary).toBe(`${line} · −110`);
    expect(result.accessibleLabel).toBe(`Over ${line} −110`);
  }
});
