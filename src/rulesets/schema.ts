import { z } from "zod";

export const rosterSizeSchema = z.union([
  z.literal(4),
  z.literal(6),
  z.literal(8),
  z.literal(10),
  z.literal(12),
  z.literal(14),
  z.literal(16),
]);

export const marketTypeSchema = z.enum(["MONEYLINE", "SPREAD", "TOTAL"]);

export const seasonRulesetSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  productBibleId: z.string().min(1),
  productBibleVersion: z.string().min(1),
  format: z.literal("SUNDAY_LEDGER_MATCHUPS"),
  mode: z.enum(["LIVE", "SIMULATION"]),
  sport: z.literal("NFL"),
  seasonLabel: z.string().min(1),
  roster: z.object({
    supportedSizes: z.array(rosterSizeSchema).length(7),
    creationPreselection: rosterSizeSchema,
  }),
  schedule: z.object({
    regularSeasonWeeks: z.number().int().positive(),
    postseasonStartWeek: z.number().int().positive(),
    championshipWeek: z.number().int().positive(),
    exhibitionWeek: z.number().int().positive(),
  }),
  card: z.object({
    weeklyAllocationCredits: z.number().int().positive(),
    minimumStakeCredits: z.number().int().positive(),
    minimumPositions: z.number().int().positive(),
    maximumPositions: z.number().int().positive(),
    stakePrecision: z.literal("WHOLE_CREDITS"),
  }),
  markets: z.object({
    eligible: z.array(marketTypeSchema).length(3),
    referenceBook: z.literal("draftkings"),
  }),
  concentration: z.object({
    heavyFavoriteThresholdAmerican: z.number().int().negative(),
    heavyFavoriteSinglePositionCapCredits: z.number().int().positive(),
    standardSinglePositionCapCredits: z.number().int().positive(),
    eligibleOddsMinimum: z.null(),
    eligibleOddsMaximum: z.null(),
    aggregateFavoriteExposureCapCredits: z.null(),
  }),
  slate: z.object({
    commonLockOffsetMinutes: z.number().int().positive(),
    standardSundayStartHourEastern: z.number().int().min(0).max(23),
    includesMondayNight: z.literal(true),
    earlyGamesRequireCommissionerSelection: z.literal(true),
  }),
  settlement: z.object({
    precisionCenticredits: z.literal(1),
    rounding: z.literal("HALF_UP"),
    postponementWindowHours: z.number().int().positive(),
    correctionWindowHours: z.number().int().positive(),
  }),
  attendance: z.object({
    playoffIneligibilityAtMisses: z.number().int().positive(),
  }),
  playoffs: z.object({
    smallLeagueMaximumSize: rosterSizeSchema,
    smallLeagueQualifiers: z.number().int().positive(),
    largeLeagueQualifiers: z.number().int().positive(),
    higherSeedAdvancesExactTie: z.literal(true),
  }),
});

export type RosterSize = z.infer<typeof rosterSizeSchema>;
export type MarketType = z.infer<typeof marketTypeSchema>;
export type SeasonRuleset = z.infer<typeof seasonRulesetSchema>;
