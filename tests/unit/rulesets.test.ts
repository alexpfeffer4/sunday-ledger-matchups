import { describe, expect, it } from "vitest";
import { canonicalizeRuleset, hashRuleset } from "@/rulesets/canonicalize";
import { pocSeason1Ruleset } from "@/rulesets/poc-season-1";
import { simulationSeason1Ruleset } from "@/rulesets/simulation-season-1";

describe("season rulesets", () => {
  it("encodes the approved POC concentration package", () => {
    expect(pocSeason1Ruleset.concentration).toEqual({
      status: "SETTLED_FOR_POC_V1",
      heavyFavoriteThresholdAmerican: -200,
      heavyFavoriteSinglePositionCapCredits: 750,
      standardSinglePositionCapCredits: 1_000,
      eligibleOddsMinimum: null,
      eligibleOddsMaximum: null,
      aggregateFavoriteExposureCapCredits: null,
    });
    expect(pocSeason1Ruleset.version).toBe("1.1");
  });

  it("keeps simulation visibly distinct without changing participant rules", () => {
    expect(simulationSeason1Ruleset.mode).toBe("SIMULATION");
    expect(simulationSeason1Ruleset.id).not.toBe(pocSeason1Ruleset.id);
    expect(simulationSeason1Ruleset.card).toEqual(pocSeason1Ruleset.card);
    expect(simulationSeason1Ruleset.standings).toEqual(
      pocSeason1Ruleset.standings,
    );
  });

  it("canonicalizes object keys and produces a stable SHA-256 hash", async () => {
    expect(canonicalizeRuleset({ b: 2, a: { d: 4, c: 3 } })).toBe(
      '{"a":{"c":3,"d":4},"b":2}',
    );
    await expect(hashRuleset({ b: 2, a: 1 })).resolves.toBe(
      await hashRuleset({ a: 1, b: 2 }),
    );
    await expect(hashRuleset(pocSeason1Ruleset)).resolves.toBe(
      "4bba08222402fbe24f706cbb5c6bd7b9aa7c50da5bc8c039f7929aaf4cfcb629",
    );
    await expect(hashRuleset(simulationSeason1Ruleset)).resolves.toBe(
      "dc9a63b54eba31536518b319e5d88889dae0ac9d71e3f37630fa6e1a786e36ff",
    );
  });
});
