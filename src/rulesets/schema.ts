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

export const standingsTiebreakSchema = z.enum([
  "MATCHUP_WIN_PERCENTAGE",
  "POINTS_FOR",
  "ALL_PLAY_PERCENTAGE",
  "BALANCED_HEAD_TO_HEAD",
  "FEWER_ATTENDANCE_MISSES",
  "HIGHEST_SINGLE_WEEK_SCORE",
  "STORED_DETERMINISTIC_RANDOM",
]);

const phase8PlayoffRulesSchema = z.object({
  smallLeagueMaximumSize: rosterSizeSchema,
  smallLeagueQualifiers: z.literal(4),
  largeLeagueQualifiers: z.literal(6),
  minimumChampionshipField: z.literal(4),
  selectionOrder: z.literal("ELIGIBLE_BEFORE_REINSTATED"),
  reinstatementReason: z.literal("MINIMUM_FOUR_CHAMPIONSHIP_FIELD"),
  noReinstatementAtOrAboveEligibleCount: z.literal(4),
  sixSlotVacancyBehavior: z.object({
    vacantSlotsRemainVacant: z.literal(true),
    fourParticipantsVacantSeeds: z.tuple([z.literal(5), z.literal(6)]),
    fourParticipantsAutomaticAdvances: z.tuple([z.literal(3), z.literal(4)]),
    fiveParticipantsVacantSeeds: z.tuple([z.literal(6)]),
    fiveParticipantsAutomaticAdvances: z.tuple([z.literal(3)]),
  }),
  everyMemberPostseasonParticipation: z.object({
    weeks: z.tuple([z.literal(15), z.literal(16), z.literal(17)]),
    cardsPerMemberPerWeek: z.literal(1),
    matchupsPerMemberPerWeek: z.literal(1),
    remainingPairingOrder: z.literal("ADJACENT_FROZEN_WEEK_14_ORDER"),
    byeExhibitions: z.literal(true),
    rematchesAllowed: z.literal(true),
  }),
  regularSeasonAttendanceFrozenAfterWeek: z.literal(14),
  exhibitionMiss: z.object({
    marker: z.literal("EXHIBITION_MISS"),
    scoreCenticredits: z.literal(0),
    affectsOfficialCompetition: z.literal(false),
  }),
  postseasonRoles: z.tuple([
    z.literal("CHAMPIONSHIP"),
    z.literal("THIRD_PLACE"),
    z.literal("PLACEMENT"),
    z.literal("EXHIBITION"),
  ]),
  championshipAdvancement: z.object({
    advancingRole: z.literal("CHAMPIONSHIP"),
    higherSeedAdvancesExactTie: z.literal(true),
    singleIncompleteEliminated: z.literal(true),
    dualIncompleteAdvancesHigherSeed: z.literal(true),
    reseedSemifinals: z.literal("SEED_1_VS_LOWEST_REMAINING"),
  }),
});

export const seasonRulesetSchema = z.object({
  id: z.string().min(1),
  version: z.literal("1.1"),
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
    carryoverCredits: z.literal(false),
    acceptanceUnit: z.literal("WHOLE_CARD_ATOMIC"),
    irreversibleAction: z.literal("CONFIRM_AND_SEAL_CARD"),
  }),
  markets: z.object({
    eligible: z.array(marketTypeSchema).length(3),
    referenceBook: z.literal("draftkings"),
  }),
  concentration: z.object({
    status: z.literal("SETTLED_FOR_POC_V1"),
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
    revealTrigger: z.literal("EVENT_START"),
  }),
  settlement: z.object({
    precisionCenticredits: z.literal(1),
    rounding: z.literal("HALF_UP"),
    postponementWindowHours: z.number().int().positive(),
    correctionWindowHours: z.number().int().positive(),
    winReturn: z.literal("STAKE_PLUS_PROFIT"),
    lossReturn: z.literal("ZERO"),
    pushVoidReturn: z.literal("STAKE"),
  }),
  attendance: z.object({
    playoffIneligibilityAtMisses: z.number().int().positive(),
    incompleteCardDecision: z.literal("LOSS"),
    incompleteCardPointsForCenticredits: z.literal(0),
    incompleteCardMisses: z.literal(1),
    dualIncompleteDecisions: z.tuple([z.literal("LOSS"), z.literal("LOSS")]),
  }),
  standings: z.object({
    tiebreakOrder: z
      .tuple([
        z.literal("MATCHUP_WIN_PERCENTAGE"),
        z.literal("POINTS_FOR"),
        z.literal("ALL_PLAY_PERCENTAGE"),
        z.literal("BALANCED_HEAD_TO_HEAD"),
        z.literal("FEWER_ATTENDANCE_MISSES"),
        z.literal("HIGHEST_SINGLE_WEEK_SCORE"),
        z.literal("STORED_DETERMINISTIC_RANDOM"),
      ])
      .readonly(),
  }),
  playoffs: phase8PlayoffRulesSchema,
});

export type RosterSize = z.infer<typeof rosterSizeSchema>;
export type MarketType = z.infer<typeof marketTypeSchema>;
export type SeasonRuleset = z.infer<typeof seasonRulesetSchema>;

const legacySeasonRulesetV11Schema = seasonRulesetSchema.extend({
  playoffs: z.object({
    smallLeagueMaximumSize: rosterSizeSchema,
    smallLeagueQualifiers: z.number().int().positive(),
    largeLeagueQualifiers: z.number().int().positive(),
    higherSeedAdvancesExactTie: z.literal(true),
  }),
});

const historicalSeasonRulesetV1Schema = legacySeasonRulesetV11Schema.extend({
  version: z.literal("1.0"),
  card: seasonRulesetSchema.shape.card.omit({
    carryoverCredits: true,
    acceptanceUnit: true,
    irreversibleAction: true,
  }),
  concentration: seasonRulesetSchema.shape.concentration.omit({ status: true }),
  slate: seasonRulesetSchema.shape.slate.omit({ revealTrigger: true }),
  settlement: seasonRulesetSchema.shape.settlement.omit({
    winReturn: true,
    lossReturn: true,
    pushVoidReturn: true,
  }),
  attendance: seasonRulesetSchema.shape.attendance.omit({
    incompleteCardDecision: true,
    incompleteCardPointsForCenticredits: true,
    incompleteCardMisses: true,
    dualIncompleteDecisions: true,
  }),
  standings: seasonRulesetSchema.shape.standings.optional(),
});

export const persistedSeasonRulesetSchema = z.union([
  seasonRulesetSchema,
  legacySeasonRulesetV11Schema,
  historicalSeasonRulesetV1Schema,
]);

export type PersistedSeasonRuleset = z.infer<
  typeof persistedSeasonRulesetSchema
>;
