import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hashRuleset } from "@/rulesets/canonicalize";
import { pocSeason1Ruleset } from "@/rulesets/poc-season-1";
import { simulationSeason1Ruleset } from "@/rulesets/simulation-season-1";

describe("authoritative Ruleset migration constants", () => {
  it("match the compiled mode-specific Rulesets and their digests", async () => {
    const migration = readFileSync(
      new URL(
        "../../supabase/migrations/20260829000000_phase2_official_rules_and_standings_integrity.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const constants = [
      ...migration.matchAll(
        /\$ruleset\$(.*?)\$ruleset\$::jsonb,\s*'([0-9a-f]{64})'/gs,
      ),
    ].map((match) => ({
      ruleset: JSON.parse(match[1] ?? "null") as unknown,
      hash: match[2],
    }));

    expect(constants).toHaveLength(2);
    expect(constants[0]?.ruleset).toEqual(pocSeason1Ruleset);
    expect(constants[0]?.hash).toBe(await hashRuleset(pocSeason1Ruleset));
    expect(constants[1]?.ruleset).toEqual(simulationSeason1Ruleset);
    expect(constants[1]?.hash).toBe(
      await hashRuleset(simulationSeason1Ruleset),
    );
  });
});
