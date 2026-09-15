import { seasonRulesetV14Schema } from "@/rulesets/schema";
import { pocSeason13Ruleset } from "@/rulesets/poc-season-1-3";

/** Prepared only. Open/completed weeks retain their exact original package. */
export const pocSeason14Ruleset = seasonRulesetV14Schema.parse({
  ...pocSeason13Ruleset,
  version: "1.4",
  productBibleVersion: "3.3",
  markets: {
    eligible: [
      "MONEYLINE",
      "SPREAD",
      "TOTAL",
      "PLAYER_PASSING_YARDS",
      "PLAYER_RUSHING_YARDS",
      "PLAYER_RECEIVING_YARDS",
    ],
    referenceBook: "draftkings",
    playerProps: {
      period: "FULL_GAME",
      includesOvertime: true,
      slotsPerTeam: ["QB_PASS", "RB_RUSH", "RECEIVER"],
      menuFreeze: "FIRST_ACCEPTED_SUBMISSION",
      identity: "EVENT_PLAYER_STATISTIC_PERIOD",
      participation: "OFFENSIVE_PARTICIPATION_REQUIRED",
      zeroOffensiveSnaps: "VOID",
      unknownEvidence: "PENDING",
      injuryAfterParticipation: "GRADE_FINAL_STATISTIC",
    },
  },
});
