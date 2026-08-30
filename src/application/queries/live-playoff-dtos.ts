import { z } from "zod";

const playoffStandingSchema = z.object({
  seed: z.number().int().positive(),
  entryId: z.uuid(),
  displayName: z.string(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  ties: z.number().int().nonnegative(),
  pointsForCenticredits: z.number().int().nonnegative(),
  allPlayHalfWinUnits: z.number().int().nonnegative(),
  allPlayComparisonCount: z.number().int().nonnegative(),
  headToHeadApplied: z.boolean().optional(),
  headToHeadHalfWinUnits: z.number().int().nonnegative().optional(),
  headToHeadComparisonCount: z.number().int().nonnegative().optional(),
  attendanceMisses: z.number().int().nonnegative(),
  highestWeekCenticredits: z.number().int().nonnegative(),
  deterministicTiebreak: z.string().length(64),
});

const qualifiedEntrySchema = playoffStandingSchema.extend({
  qualificationSeed: z.number().int().positive(),
  regularSeasonSeed: z.number().int().positive(),
  eligibilityStatus: z.enum(["ELIGIBLE", "INELIGIBLE"]).optional(),
  selectionReason: z
    .enum(["ELIGIBLE_STANDINGS", "MINIMUM_FOUR_CHAMPIONSHIP_FIELD"])
    .optional(),
  attendanceMissesUsedByQualification: z
    .number()
    .int()
    .nonnegative()
    .optional(),
});

const legacyBracketSchema = z.object({
  format: z.enum(["SMALL_FOUR", "LARGE_SIX"]),
  tieRule: z.string(),
  stages: z.array(z.unknown()),
});

const phase8BracketSchema = z.object({
  format: z.enum(["FOUR_SLOT", "SIX_SLOT"]),
  minimumFieldSize: z.literal(4),
  maximumFieldSize: z.union([z.literal(4), z.literal(6)]),
  slots: z.array(
    z.object({
      slot: z.number().int().positive(),
      state: z.enum(["OCCUPIED", "VACANT"]),
      entry: qualifiedEntrySchema.nullable(),
    }),
  ),
  automaticWeek15Advancements: z.array(
    z.object({
      entry: qualifiedEntrySchema,
      fromWeek: z.literal(15),
      toWeek: z.literal(16),
      reason: z.enum(["TOP_TWO_SEED_BYE", "VACANT_OPPONENT"]),
    }),
  ),
  championshipAdvancementRule: z.string(),
});

const publishedRoundEntrySchema = z.object({
  entryId: z.uuid(),
  displayName: z.string(),
  qualificationSeed: z.number().int().positive().nullable(),
});

const publishedRoundSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  supersedesId: z.uuid().nullable(),
  week: z.union([z.literal(15), z.literal(16), z.literal(17)]),
  scope: z.enum(["PLAYOFF", "EXHIBITION"]),
  state: z.enum(["PLANNED", "OPEN", "LOCKED", "PROVISIONAL", "FINAL"]),
  commonLockAt: z.string(),
  publishedAt: z.string(),
  inputHash: z.string().length(64),
  sourceResultVersionIds: z.array(z.uuid()),
  matchups: z.array(
    z.object({
      id: z.uuid(),
      game: z.number().int().positive(),
      role: z
        .enum(["CHAMPIONSHIP", "THIRD_PLACE", "PLACEMENT", "EXHIBITION"])
        .nullable(),
      scope: z.enum(["PLAYOFF", "PLACEMENT", "EXHIBITION"]),
      label: z.string(),
      byeExhibition: z.boolean(),
      sideA: publishedRoundEntrySchema,
      sideB: publishedRoundEntrySchema,
      result: z
        .object({
          id: z.uuid(),
          status: z.enum(["PROVISIONAL", "FINAL"]),
          sideADecision: z.enum(["WIN", "LOSS", "TIE"]).nullable(),
          sideBDecision: z.enum(["WIN", "LOSS", "TIE"]).nullable(),
          sideAScoreCenticredits: z.number().int().nonnegative(),
          sideBScoreCenticredits: z.number().int().nonnegative(),
          sideAParticipation: z.enum(["COMPLETED", "EXHIBITION_MISS"]),
          sideBParticipation: z.enum(["COMPLETED", "EXHIBITION_MISS"]),
          advancingEntryId: z.uuid().nullable(),
        })
        .nullable(),
    }),
  ),
});

export const livePlayoffStateSchema = z.object({
  league: z.object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    nflYear: z.number().int(),
    lifecycle: z.enum(["PLAYOFFS", "FINAL"]),
  }),
  publication: z.object({
    id: z.uuid(),
    version: z.number().int().positive(),
    supersedesId: z.uuid().nullable(),
    publishedAt: z.string(),
    inputHash: z.string().length(64),
    sourceResultVersionIds: z.array(z.uuid()),
    rosterSize: z.number().int().positive(),
    expectedQualifierCount: z.union([z.literal(4), z.literal(6)]),
    actualQualifierCount: z.number().int().nonnegative(),
    standings: z.array(playoffStandingSchema),
    qualifiers: z.array(qualifiedEntrySchema),
    bracket: z.union([phase8BracketSchema, legacyBracketSchema]),
    legacy: z.boolean(),
    tieRule: z.string(),
    attendanceMissLimit: z.literal(3),
    correctionEvidence: z.object({
      effectiveVersion: z.number().int().positive(),
      supersedesVersionId: z.uuid().nullable(),
      priorVersionCount: z.number().int().nonnegative(),
      sourceResultVersionIds: z.array(z.uuid()),
    }),
  }),
  rounds: z.array(publishedRoundSchema),
  viewer: z.object({ userId: z.uuid(), isCommissioner: z.boolean() }),
});

export type LivePlayoffState = z.infer<typeof livePlayoffStateSchema>;
export type Phase8Bracket = z.infer<typeof phase8BracketSchema>;
