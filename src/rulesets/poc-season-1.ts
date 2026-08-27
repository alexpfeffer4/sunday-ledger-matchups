import { seasonRulesetSchema } from "@/rulesets/schema";

export const pocSeason1Ruleset = seasonRulesetSchema.parse({
  id: "SUNDAY-LEDGER-POC-SEASON-RULESET-V1",
  version: "1.0",
  productBibleId: "SUNDAY-LEDGER-PRODUCT-BIBLE-V3",
  productBibleVersion: "3.0",
  format: "SUNDAY_LEDGER_MATCHUPS",
  mode: "LIVE",
  sport: "NFL",
  seasonLabel: "POC Season 1",
  roster: {
    supportedSizes: [4, 6, 8, 10, 12, 14, 16],
    creationPreselection: 10,
  },
  schedule: {
    regularSeasonWeeks: 14,
    postseasonStartWeek: 15,
    championshipWeek: 17,
    exhibitionWeek: 18,
  },
  card: {
    weeklyAllocationCredits: 1_000,
    minimumStakeCredits: 50,
    minimumPositions: 1,
    maximumPositions: 20,
    stakePrecision: "WHOLE_CREDITS",
  },
  markets: {
    eligible: ["MONEYLINE", "SPREAD", "TOTAL"],
    referenceBook: "draftkings",
  },
  concentration: {
    // Approved by the controlling architecture: shorter than −200 is capped.
    heavyFavoriteThresholdAmerican: -200,
    heavyFavoriteSinglePositionCapCredits: 750,
    standardSinglePositionCapCredits: 1_000,
    eligibleOddsMinimum: null,
    eligibleOddsMaximum: null,
    aggregateFavoriteExposureCapCredits: null,
  },
  slate: {
    commonLockOffsetMinutes: 5,
    standardSundayStartHourEastern: 13,
    includesMondayNight: true,
    earlyGamesRequireCommissionerSelection: true,
  },
  settlement: {
    precisionCenticredits: 1,
    rounding: "HALF_UP",
    postponementWindowHours: 48,
    correctionWindowHours: 24,
  },
  attendance: {
    playoffIneligibilityAtMisses: 3,
  },
  playoffs: {
    smallLeagueMaximumSize: 8,
    smallLeagueQualifiers: 4,
    largeLeagueQualifiers: 6,
    higherSeedAdvancesExactTie: true,
  },
});
