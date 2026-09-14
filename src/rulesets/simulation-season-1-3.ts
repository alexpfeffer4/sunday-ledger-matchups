import { seasonRulesetV13Schema } from "@/rulesets/schema";
import { pocSeason13Ruleset } from "@/rulesets/poc-season-1-3";

export const simulationSeason13Ruleset = seasonRulesetV13Schema.parse({
  ...pocSeason13Ruleset,
  id: "SUNDAY-LEDGER-SIMULATION-SEASON-RULESET-V1",
  mode: "SIMULATION",
  seasonLabel: "POC Season 1 · Simulation",
});
