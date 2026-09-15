import { seasonRulesetV15Schema } from "@/rulesets/schema";
import { pocSeason15Ruleset } from "@/rulesets/poc-season-1-5";

export const simulationSeason15Ruleset = seasonRulesetV15Schema.parse({
  ...pocSeason15Ruleset,
  id: "SUNDAY-LEDGER-SIMULATION-SEASON-RULESET-V1",
  mode: "SIMULATION",
  seasonLabel: "POC Season 1 · Simulation",
});
