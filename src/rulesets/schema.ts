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

export const mainMarketTypeSchema = z.enum(["MONEYLINE", "SPREAD", "TOTAL"]);
export const playerStatisticSchema = z.enum([
  "PASSING_YARDS",
  "RUSHING_YARDS",
  "RECEIVING_YARDS",
]);
export const marketTypeSchema = z.enum([
  "MONEYLINE",
  "SPREAD",
  "TOTAL",
  "PLAYER_PASSING_YARDS",
  "PLAYER_RUSHING_YARDS",
  "PLAYER_RECEIVING_YARDS",
]);

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

export const seasonRulesetV11Schema = z.object({
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
    eligible: z.array(mainMarketTypeSchema).length(3),
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

export const seasonRulesetSchema = seasonRulesetV11Schema.extend({
  version: z.literal("1.2"),
  standings: z.object({
    tiebreakOrder: z
      .tuple([
        z.literal("MATCHUP_WIN_PERCENTAGE"),
        z.literal("POINTS_FOR"),
        z.literal("BALANCED_HEAD_TO_HEAD"),
        z.literal("FEWER_ATTENDANCE_MISSES"),
        z.literal("HIGHEST_SINGLE_WEEK_SCORE"),
        z.literal("STORED_DETERMINISTIC_RANDOM"),
      ])
      .readonly(),
  }),
});

/** Approved rolling contract; catalog activation is a separate release operation. */
export const seasonRulesetV13Schema = seasonRulesetSchema.extend({
  version: z.literal("1.3"),
  productBibleVersion: z.literal("3.2"),
  card: seasonRulesetSchema.shape.card.extend({
    acceptanceUnit: z.literal("BATCH_ATOMIC"),
    irreversibleAction: z.literal("SUBMIT_BETS"),
    requireFullAllocation: z.literal(false),
    unusedCredits: z.literal("EXPIRE_AT_WEEK_ENTRY_CLOSE"),
  }),
  slate: seasonRulesetSchema.shape.slate.extend({
    entryCutoff: z.literal("EVENT_SCHEDULED_KICKOFF"),
    gameVisibility: z.literal("ACCEPTED_SUBMISSION"),
    aggregateVisibility: z.literal("COMMON_LOCK"),
  }),
  attendance: seasonRulesetSchema.shape.attendance.extend({
    incompleteDefinition: z.literal("ZERO_ACCEPTED_POSITIONS"),
  }),
});
/** Prospective player props; no catalog is activated by importing this package. */
export const playerPropRulesSchema = z
  .object({
    period: z.literal("FULL_GAME"),
    includesOvertime: z.literal(true),
    slotsPerTeam: z.tuple([
      z.literal("QB_PASS"),
      z.literal("RB_RUSH"),
      z.literal("RECEIVER"),
    ]),
    menuFreeze: z.literal("FIRST_ACCEPTED_SUBMISSION"),
    identity: z.literal("EVENT_PLAYER_STATISTIC_PERIOD"),
    participation: z.literal("OFFENSIVE_PARTICIPATION_REQUIRED"),
    zeroOffensiveSnaps: z.literal("VOID"),
    unknownEvidence: z.literal("PENDING"),
    injuryAfterParticipation: z.literal("GRADE_FINAL_STATISTIC"),
  })
  .strict();
export const seasonRulesetV14Schema = seasonRulesetV13Schema.extend({
  version: z.literal("1.4"),
  productBibleVersion: z.literal("3.3"),
  markets: z
    .object({
      eligible: z.tuple([
        z.literal("MONEYLINE"),
        z.literal("SPREAD"),
        z.literal("TOTAL"),
        z.literal("PLAYER_PASSING_YARDS"),
        z.literal("PLAYER_RUSHING_YARDS"),
        z.literal("PLAYER_RECEIVING_YARDS"),
      ]),
      referenceBook: z.literal("draftkings"),
      playerProps: playerPropRulesSchema,
    })
    .strict(),
});
/** Empty slots may acquire their first player before that game's entry cutoff.
 * Published players stay fixed. The V1.4 package and its schema remain intact. */
export const progressivePlayerPropRulesSchema = playerPropRulesSchema.extend({
  menuFreeze: z.literal("FIRST_PUBLICATION_PER_SLOT"),
  emptySlotPublication: z.literal("AUTOMATIC_BEFORE_EVENT_CUTOFF"),
});
export const seasonRulesetV15Schema = seasonRulesetV14Schema.extend({
  version: z.literal("1.5"),
  productBibleVersion: z.literal("3.4"),
  markets: seasonRulesetV14Schema.shape.markets.extend({
    playerProps: progressivePlayerPropRulesSchema,
  }),
});
export type PlayerPropsSeasonRuleset =
  | z.infer<typeof seasonRulesetV14Schema>
  | z.infer<typeof seasonRulesetV15Schema>;
export type ProgressivePlayerPropsSeasonRuleset = z.infer<
  typeof seasonRulesetV15Schema
>;
export type RollingSeasonRuleset = z.infer<typeof seasonRulesetV13Schema>;

export type RosterSize = z.infer<typeof rosterSizeSchema>;
export type MarketType = z.infer<typeof marketTypeSchema>;
export type StandingsTiebreak = z.infer<typeof standingsTiebreakSchema>;
export type SeasonRuleset = z.infer<typeof seasonRulesetSchema>;

const legacySeasonRulesetV11Schema = seasonRulesetV11Schema.extend({
  playoffs: z.object({
    smallLeagueMaximumSize: rosterSizeSchema,
    smallLeagueQualifiers: z.number().int().positive(),
    largeLeagueQualifiers: z.number().int().positive(),
    higherSeedAdvancesExactTie: z.literal(true),
  }),
});

const historicalSeasonRulesetV1Schema = legacySeasonRulesetV11Schema.extend({
  version: z.literal("1.0"),
  card: seasonRulesetV11Schema.shape.card.omit({
    carryoverCredits: true,
    acceptanceUnit: true,
    irreversibleAction: true,
  }),
  concentration: seasonRulesetV11Schema.shape.concentration.omit({
    status: true,
  }),
  slate: seasonRulesetV11Schema.shape.slate.omit({ revealTrigger: true }),
  settlement: seasonRulesetV11Schema.shape.settlement.omit({
    winReturn: true,
    lossReturn: true,
    pushVoidReturn: true,
  }),
  attendance: seasonRulesetV11Schema.shape.attendance.omit({
    incompleteCardDecision: true,
    incompleteCardPointsForCenticredits: true,
    incompleteCardMisses: true,
    dualIncompleteDecisions: true,
  }),
  standings: seasonRulesetV11Schema.shape.standings.optional(),
});

export const persistedSeasonRulesetSchema = z.union([
  seasonRulesetV15Schema,
  seasonRulesetV14Schema,
  seasonRulesetV13Schema,
  seasonRulesetSchema,
  seasonRulesetV11Schema,
  legacySeasonRulesetV11Schema,
  historicalSeasonRulesetV1Schema,
]);

export type PersistedSeasonRuleset = z.infer<
  typeof persistedSeasonRulesetSchema
>;
