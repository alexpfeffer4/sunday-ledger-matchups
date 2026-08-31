import { z } from "zod";

const receiptSchema = z.object({
  id: z.string(),
  receiptHash: z.string().length(64),
  eventId: z.string(),
  marketType: z.enum(["MONEYLINE", "SPREAD", "TOTAL"]),
  selection: z.enum(["HOME", "AWAY", "OVER", "UNDER"]),
  americanOdds: z.number().int(),
  lineMilli: z.number().int().nullable(),
  stakeCredits: z.number().int().positive(),
  outcome: z.enum(["WIN", "LOSS", "PUSH", "VOID"]),
  returnedCenticredits: z.number().int().nonnegative(),
});

const cardSchema = z.object({
  entryId: z.string(),
  compliance: z.enum(["COMPLIANT", "INCOMPLETE"]),
  allocatedCredits: z.number().int().nonnegative(),
  scoreCenticredits: z.number().int().nonnegative(),
  receipts: z.array(receiptSchema),
});

const postseasonRoleSchema = z.enum([
  "CHAMPIONSHIP",
  "THIRD_PLACE",
  "PLACEMENT",
  "EXHIBITION",
]);

const matchupSchema = z.object({
  id: z.string(),
  week: z.number().int().min(1).max(18),
  scope: z.enum(["REGULAR", "PLAYOFF", "PLACEMENT", "EXHIBITION"]),
  postseasonRole: postseasonRoleSchema.nullable().optional(),
  label: z.string(),
  sideAEntryId: z.string(),
  sideBEntryId: z.string(),
  sideAScoreCenticredits: z.number().int().nonnegative(),
  sideBScoreCenticredits: z.number().int().nonnegative(),
  sideADecision: z.enum(["WIN", "LOSS", "TIE"]),
  sideBDecision: z.enum(["WIN", "LOSS", "TIE"]),
  winnerEntryId: z.string().nullable(),
  advancementReason: z
    .enum(["SCORE", "INCOMPLETE", "HIGHER_SEED_TIEBREAK"])
    .nullable(),
  cards: z.tuple([cardSchema, cardSchema]),
});

const standingSchema = z.object({
  seed: z.number().int().positive(),
  entryId: z.string(),
  displayName: z.string(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  ties: z.number().int().nonnegative(),
  pointsForCenticredits: z.number().int().nonnegative(),
  allPlayHalfWinUnits: z.number().int().nonnegative(),
  allPlayComparisonCount: z.number().int().nonnegative(),
  attendanceMisses: z.number().int().nonnegative(),
  highestWeekCenticredits: z.number().int().nonnegative(),
  playoffEligible: z.boolean(),
});

const archiveEnvelopeSchema = {
  archiveId: z.string().optional(),
  archiveHash: z.string().length(64).optional(),
  archiveVersion: z.number().int().positive().optional(),
  supersedesArchiveId: z.string().nullable().optional(),
  correctionId: z.string().nullable().optional(),
  publishedAt: z.string().optional(),
};

export const simulationSeasonArchiveSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.enum(["LIVE", "SIMULATION"]),
  seasonLabel: z.string(),
  nflYear: z.number().int(),
  generatedAt: z.string(),
  viewerEntryId: z.string(),
  ruleset: z.object({
    id: z.string(),
    version: z.string(),
    playoffIneligibilityAtMisses: z.number().int().positive(),
  }),
  members: z.array(
    z.object({
      entryId: z.string(),
      displayName: z.string(),
      initials: z.string(),
      deterministicTiebreak: z.string(),
    }),
  ),
  schedule: z.object({
    algorithmVersion: z.literal("circle-v1"),
    seed: z.string(),
    orderedEntryIds: z.array(z.string()),
    matchups: z.array(
      z.object({
        week: z.number().int().min(1).max(14),
        sideAEntryId: z.string(),
        sideBEntryId: z.string(),
      }),
    ),
    outputHash: z.string().length(64),
  }),
  regularSeason: z.object({
    weeks: z.array(
      z.object({
        week: z.number().int().min(1).max(14),
        matchups: z.array(matchupSchema),
        standings: z.array(standingSchema),
      }),
    ),
    finalStandings: z.array(standingSchema),
  }),
  playoffs: z.object({
    qualifierCount: z.number().int().positive(),
    qualifiers: z.array(
      z.object({
        entryId: z.string(),
        qualificationSeed: z.number().int().positive(),
      }),
    ),
    games: z.array(matchupSchema),
    championEntryId: z.string(),
    runnerUpEntryId: z.string(),
    thirdPlaceEntryId: z.string().nullable(),
    thirdPlaceTied: z.boolean().optional(),
  }),
  week18: z.array(matchupSchema),
  ...archiveEnvelopeSchema,
});

const finalPlacementSchema = z.object({
  entryId: z.string(),
  placement: z.number().int().positive(),
  role: z.enum([
    "CHAMPION",
    "RUNNER_UP",
    "THIRD_PLACE",
    "FOURTH_PLACE",
    "EARLIER_ROUND",
    "NON_QUALIFIER",
  ]),
  tied: z.boolean(),
});

const championLineageSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  supersedesId: z.string().nullable(),
  championEntryId: z.string(),
  runnerUpEntryId: z.string(),
  thirdPlaceEntryIds: z.array(z.string()).min(1).max(2),
  thirdPlaceTied: z.boolean(),
  terminalResultVersionIds: z.array(z.string()),
  correctionId: z.string().nullable(),
  finalizedAt: z.string(),
});

const finalMatchupSchema = matchupSchema.extend({
  postseasonRole: postseasonRoleSchema.nullable(),
});

export const finalSeasonArchiveSchema = simulationSeasonArchiveSchema.extend({
  schemaVersion: z.literal(2),
  mode: z.literal("LIVE"),
  qualification: z.object({
    expectedQualifierCount: z.number().int().positive(),
    actualQualifierCount: z.number().int().positive(),
    qualifiers: z.array(
      z.object({
        entryId: z.string(),
        qualificationSeed: z.number().int().positive(),
      }),
    ),
    frozenWeek14Standings: z.array(standingSchema),
    lineage: z.array(
      z.object({
        id: z.string(),
        version: z.number().int().positive(),
        supersedesId: z.string().nullable(),
        publishedAt: z.string(),
        sourceResultVersionIds: z.array(z.string()),
      }),
    ),
  }),
  regularSeason: simulationSeasonArchiveSchema.shape.regularSeason.extend({
    weeks: z.array(
      z.object({
        week: z.number().int().min(1).max(14),
        matchups: z.array(finalMatchupSchema),
        standings: z.array(standingSchema),
      }),
    ),
  }),
  playoffs: simulationSeasonArchiveSchema.shape.playoffs.extend({
    games: z.array(finalMatchupSchema),
    thirdPlaceEntryIds: z.array(z.string()).min(1).max(2),
    finalPlacement: z.array(finalPlacementSchema),
    championLineage: z.array(championLineageSchema).min(1),
  }),
  week18: z.array(finalMatchupSchema),
  corrections: z.array(
    z.object({
      id: z.string(),
      week: z.number().int().min(1).max(18),
      eventId: z.string(),
      originalResultVersionId: z.string(),
      correctedResultVersionId: z.string(),
      reason: z.string(),
      recordedAt: z.string(),
    }),
  ),
  integrity: z.object({
    rulesetSnapshotId: z.string(),
    schedulePublicationId: z.string(),
    terminalBracketPublicationId: z.string(),
    terminalW17ResultVersionIds: z.array(z.string()).min(1),
    effectiveW18RoundPublicationId: z.string(),
    effectiveW18RoundVersion: z.number().int().positive(),
    terminalW18ResultVersionIds: z.array(z.string()).min(1),
    archiveVersion: z.number().int().positive(),
    supersedesArchiveId: z.string().nullable(),
    correctionId: z.string().nullable(),
    positionReceiptCount: z.number().int().nonnegative(),
    correctionCount: z.number().int().nonnegative(),
  }),
});

export const seasonArchiveSchema = z.discriminatedUnion("schemaVersion", [
  simulationSeasonArchiveSchema,
  finalSeasonArchiveSchema,
]);

export type SeasonArchiveDto = z.infer<typeof seasonArchiveSchema>;

export type SimulationSeasonArchiveDto = z.infer<
  typeof simulationSeasonArchiveSchema
>;

export type FinalSeasonArchiveDto = z.infer<typeof finalSeasonArchiveSchema>;
