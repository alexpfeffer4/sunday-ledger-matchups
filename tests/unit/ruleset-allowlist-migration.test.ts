import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hashRuleset } from "@/rulesets/canonicalize";
import { pocSeason11Ruleset } from "@/rulesets/poc-season-1-1";
import { pocSeason1Ruleset } from "@/rulesets/poc-season-1";
import { simulationSeason11Ruleset } from "@/rulesets/simulation-season-1-1";
import { simulationSeason1Ruleset } from "@/rulesets/simulation-season-1";

describe("authoritative Ruleset migration constants", () => {
  it("match the compiled mode-specific Rulesets and their digests", async () => {
    const phase2Migration = readFileSync(
      new URL(
        "../../supabase/migrations/20260829023327_phase2_official_rules_and_standings_integrity.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const phase8Migration = readFileSync(
      new URL(
        "../../supabase/migrations/20260831040524_phase8a_sparse_qualification_every_member_postseason.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const v12Migration = readFileSync(
      new URL(
        "../../supabase/migrations/20260904173852_ruleset_v1_2_remove_all_play.sql",
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
    const historicalConstants = [
      {
        ruleset: JSON.parse(live?.[1] ?? "null") as unknown,
        hash: "047550e7661915d3ba4d8e4046f85ab9474eac7b857fbba398cb4d9b91a5766c",
      },
      {
        ruleset: JSON.parse(simulation?.[1] ?? "null") as unknown,
        hash: "64772aad744ed8d5ec12b9e43e1303a610fc92051c250204bffb20c00f5e7a7d",
      },
    ];

    expect(historicalConstants).toHaveLength(2);
    expect(historicalConstants[0]?.ruleset).toEqual(pocSeason11Ruleset);
    expect(historicalConstants[0]?.hash).toBe(
      await hashRuleset(pocSeason11Ruleset),
    );
    expect(historicalConstants[1]?.ruleset).toEqual(simulationSeason11Ruleset);
    expect(historicalConstants[1]?.hash).toBe(
      await hashRuleset(simulationSeason11Ruleset),
    );
    expect(v12Migration).toContain(await hashRuleset(pocSeason1Ruleset));
    expect(v12Migration).toContain(await hashRuleset(simulationSeason1Ruleset));
    expect(v12Migration).toContain(
      '["MATCHUP_WIN_PERCENTAGE", "POINTS_FOR", "BALANCED_HEAD_TO_HEAD", "FEWER_ATTENDANCE_MISSES", "HIGHEST_SINGLE_WEEK_SCORE", "STORED_DETERMINISTIC_RANDOM"]',
    );
    expect(v12Migration).toContain(
      "snapshot.canonical_json #> '{standings,tiebreakOrder}'",
    );
  });
});
