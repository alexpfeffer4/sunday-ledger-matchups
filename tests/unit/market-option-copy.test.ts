import { describe, expect, it } from "vitest";
import { formatMarketProposition } from "@/components/card/market-option-copy";

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
