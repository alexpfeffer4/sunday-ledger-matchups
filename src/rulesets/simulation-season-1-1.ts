import { seasonRulesetV11Schema } from "@/rulesets/schema";
import { pocSeason11Ruleset } from "@/rulesets/poc-season-1-1";

/** Frozen compatibility rules for Simulation seasons created under V1.1. */
export const simulationSeason11Ruleset = seasonRulesetV11Schema.parse({
  ...pocSeason11Ruleset,
  id: "SUNDAY-LEDGER-SIMULATION-SEASON-RULESET-V1",
  mode: "SIMULATION",
  seasonLabel: "POC Season 1 · Simulation",
});
