import { seasonRulesetV15Schema } from "@/rulesets/schema";
import { pocSeason14Ruleset } from "@/rulesets/poc-season-1-4";

/** Prepared only. Progressive publication never rewrites an older package. */
export const pocSeason15Ruleset = seasonRulesetV15Schema.parse({
  ...pocSeason14Ruleset,
  version: "1.5",
  productBibleVersion: "3.4",
  markets: {
    ...pocSeason14Ruleset.markets,
    playerProps: {
      ...pocSeason14Ruleset.markets.playerProps,
      menuFreeze: "FIRST_PUBLICATION_PER_SLOT",
      emptySlotPublication: "AUTOMATIC_BEFORE_EVENT_CUTOFF",
    },
  },
});
