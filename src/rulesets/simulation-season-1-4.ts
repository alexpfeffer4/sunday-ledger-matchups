import { seasonRulesetV14Schema } from "@/rulesets/schema";
import { pocSeason14Ruleset } from "@/rulesets/poc-season-1-4";

export const simulationSeason14Ruleset = seasonRulesetV14Schema.parse({
  ...pocSeason14Ruleset,
  id: "SUNDAY-LEDGER-SIMULATION-SEASON-RULESET-V1",
  mode: "SIMULATION",
  seasonLabel: "POC Season 1 · Simulation",
});
