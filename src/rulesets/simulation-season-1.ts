import { seasonRulesetSchema } from "@/rulesets/schema";
import { pocSeason1Ruleset } from "@/rulesets/poc-season-1";

export const simulationSeason1Ruleset = seasonRulesetSchema.parse({
  ...pocSeason1Ruleset,
  id: "SUNDAY-LEDGER-SIMULATION-SEASON-RULESET-V1",
  mode: "SIMULATION",
  seasonLabel: "POC Season 1 · Simulation",
});
