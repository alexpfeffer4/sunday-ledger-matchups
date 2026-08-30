import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hashRuleset } from "@/rulesets/canonicalize";
import { pocSeason1Ruleset } from "@/rulesets/poc-season-1";
import { simulationSeason1Ruleset } from "@/rulesets/simulation-season-1";

describe("authoritative Ruleset migration constants", () => {
  it("match the compiled mode-specific Rulesets and their digests", async () => {
    const phase2Migration = readFileSync(
      new URL(
        "../../supabase/migrations/20260829000000_phase2_official_rules_and_standings_integrity.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const phase8Migration = readFileSync(
      new URL(
        "../../supabase/migrations/20260830171706_phase8a_sparse_qualification_every_member_postseason.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(phase2Migration).toContain("private.authoritative_season_rulesets");
    const live = phase8Migration.match(
      /\$phase8_live\$(.*?)\$phase8_live\$::jsonb/s,
    );
    const simulation = phase8Migration.match(
      /\$phase8_simulation\$(.*?)\$phase8_simulation\$::jsonb/s,
    );
    const constants = [
      {
        ruleset: JSON.parse(live?.[1] ?? "null") as unknown,
        hash: "047550e7661915d3ba4d8e4046f85ab9474eac7b857fbba398cb4d9b91a5766c",
      },
      {
        ruleset: JSON.parse(simulation?.[1] ?? "null") as unknown,
        hash: "64772aad744ed8d5ec12b9e43e1303a610fc92051c250204bffb20c00f5e7a7d",
      },
    ];

    expect(constants).toHaveLength(2);
    expect(constants[0]?.ruleset).toEqual(pocSeason1Ruleset);
    expect(constants[0]?.hash).toBe(await hashRuleset(pocSeason1Ruleset));
    expect(constants[1]?.ruleset).toEqual(simulationSeason1Ruleset);
    expect(constants[1]?.hash).toBe(
      await hashRuleset(simulationSeason1Ruleset),
    );
  });
});
