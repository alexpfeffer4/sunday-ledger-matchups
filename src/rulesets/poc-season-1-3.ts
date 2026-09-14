import { seasonRulesetV13Schema } from "@/rulesets/schema";
import { pocSeason1Ruleset } from "@/rulesets/poc-season-1";

/** Explicit V1.3 package. Importing it does not activate a Production catalog. */
export const pocSeason13Ruleset = seasonRulesetV13Schema.parse({
  ...pocSeason1Ruleset,
  version: "1.3",
  productBibleVersion: "3.2",
  card: {
    ...pocSeason1Ruleset.card,
    acceptanceUnit: "BATCH_ATOMIC",
    irreversibleAction: "SUBMIT_BETS",
    requireFullAllocation: false,
    unusedCredits: "EXPIRE_AT_WEEK_ENTRY_CLOSE",
  },
  slate: {
    ...pocSeason1Ruleset.slate,
    entryCutoff: "EVENT_SCHEDULED_KICKOFF",
    gameVisibility: "ACCEPTED_SUBMISSION",
    aggregateVisibility: "COMMON_LOCK",
  },
  attendance: {
    ...pocSeason1Ruleset.attendance,
    incompleteDefinition: "ZERO_ACCEPTED_POSITIONS",
  },
});
