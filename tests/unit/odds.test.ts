import { describe, expect, it } from "vitest";
import {
  formatCenticredits,
  formatCredits,
  profitCenticredits,
  returnedCenticredits,
} from "@/domain/odds/american";

describe("American odds arithmetic", () => {
  it.each([
    { stake: 500, odds: -110, profit: 45_455n, returned: 95_455n },
    { stake: 750, odds: -201, profit: 37_313n, returned: 112_313n },
    { stake: 100, odds: 200, profit: 20_000n, returned: 30_000n },
    { stake: 50, odds: 100, profit: 5_000n, returned: 10_000n },
  ])(
    "calculates $stake credits at $odds",
    ({ stake, odds, profit, returned }) => {
      expect(profitCenticredits(stake, odds)).toBe(profit);
      expect(returnedCenticredits(stake, odds, "WIN")).toBe(returned);
    },
  );

  it("rounds half up at receipt precision", () => {
    expect(profitCenticredits(1, -128)).toBe(78n);
  });

  it("returns stake for pushes and voids and zero for losses", () => {
    expect(returnedCenticredits(500, -110, "PUSH")).toBe(50_000n);
    expect(returnedCenticredits(500, -110, "VOID")).toBe(50_000n);
    expect(returnedCenticredits(500, -110, "LOSS")).toBe(0n);
  });

  it("formats centicredits without currency language", () => {
    expect(formatCenticredits(154_000n)).toBe("1,540");
    expect(formatCenticredits(154_055n)).toBe("1,540.55");
    expect(formatCenticredits(154_000n, true)).toBe("1,540.00");
  });

  it("formats whole credits consistently", () => {
    expect(formatCredits(0)).toBe("0");
    expect(formatCredits(1_000)).toBe("1,000");
    expect(formatCredits(12_500)).toBe("12,500");
    expect(() => formatCredits(1.5)).toThrow("safe whole number");
  });
});
