import { seasonRulesetV11Schema } from "@/rulesets/schema";
import { pocSeason1Ruleset } from "@/rulesets/poc-season-1";

/** Frozen compatibility rules for seasons created under Ruleset V1.1. */
export const pocSeason11Ruleset = seasonRulesetV11Schema.parse({
  ...pocSeason1Ruleset,
  version: "1.1",
  productBibleVersion: "3.0",
  standings: {
    tiebreakOrder: [
      "MATCHUP_WIN_PERCENTAGE",
      "POINTS_FOR",
      "ALL_PLAY_PERCENTAGE",
      "BALANCED_HEAD_TO_HEAD",
      "FEWER_ATTENDANCE_MISSES",
      "HIGHEST_SINGLE_WEEK_SCORE",
      "STORED_DETERMINISTIC_RANDOM",
    ],
  },
});
