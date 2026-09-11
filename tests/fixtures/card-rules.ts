import { pocSeason1Ruleset } from "@/rulesets/poc-season-1";
import { simulationSeason1Ruleset } from "@/rulesets/simulation-season-1";
import type { PersistedSeasonRuleset } from "@/rulesets/schema";

export function frozenCardRulesFixture(
  mode: "LIVE" | "SIMULATION" = "LIVE",
  canonical: PersistedSeasonRuleset = mode === "LIVE"
    ? pocSeason1Ruleset
    : simulationSeason1Ruleset,
) {
  return {
    rulesetId: canonical.id,
    rulesetVersion: canonical.version,
    productBibleId: canonical.productBibleId,
    productBibleVersion: canonical.productBibleVersion,
    mode,
    canonicalJson: structuredClone(canonical),
    sha256Hash: "a".repeat(64),
    publishedAt: "2026-09-01T00:00:00.000Z",
    frozenAt: "2026-09-02T00:00:00.000Z",
  };
}
