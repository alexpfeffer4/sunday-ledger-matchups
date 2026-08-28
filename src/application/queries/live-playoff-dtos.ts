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
});

const bracketEntrySchema = z.object({
  entryId: z.uuid(),
  displayName: z.string(),
  regularSeasonSeed: z.number().int().positive(),
  qualificationSeed: z.number().int().positive().optional(),
});

const bracketGameSchema = z.object({
  game: z.number().int().positive(),
  label: z.string(),
  scope: z.enum(["PLAYOFF", "EXHIBITION"]).optional(),
  sideA: bracketEntrySchema.nullable(),
  sideB: bracketEntrySchema.nullable(),
});

const bracketStageSchema = z.object({
  week: z.union([z.literal(15), z.literal(16), z.literal(17)]),
  label: z.string(),
  scope: z.enum(["PLAYOFF", "EXHIBITION"]),
  byes: z.array(bracketEntrySchema.nullable()).optional(),
  reseedRule: z.literal("NO_1_FACES_LOWEST_REMAINING_SEED").optional(),
  games: z.array(bracketGameSchema),
});

const publishedRoundEntrySchema = z.object({
  entryId: z.uuid(),
  displayName: z.string(),
  qualificationSeed: z.number().int().positive().nullable(),
});

const publishedRoundSchema = z.object({
  id: z.uuid(),
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
      scope: z.enum(["PLAYOFF", "PLACEMENT", "EXHIBITION"]),
      label: z.string(),
      sideA: publishedRoundEntrySchema,
      sideB: publishedRoundEntrySchema,
      result: z
        .object({
          id: z.uuid(),
          status: z.enum(["PROVISIONAL", "FINAL"]),
          sideADecision: z.enum(["WIN", "LOSS", "TIE"]),
          sideBDecision: z.enum(["WIN", "LOSS", "TIE"]),
          sideAScoreCenticredits: z.number().int().nonnegative(),
          sideBScoreCenticredits: z.number().int().nonnegative(),
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
    lifecycle: z.literal("PLAYOFFS"),
  }),
  publication: z.object({
    id: z.uuid(),
    publishedAt: z.string(),
    inputHash: z.string().length(64),
    rosterSize: z.number().int().positive(),
    expectedQualifierCount: z.union([z.literal(4), z.literal(6)]),
    actualQualifierCount: z.number().int().nonnegative(),
    standings: z.array(playoffStandingSchema),
    qualifiers: z.array(qualifiedEntrySchema),
    bracket: z.object({
      format: z.enum(["SMALL_FOUR", "LARGE_SIX"]),
      tieRule: z.literal("HIGHER_QUALIFICATION_SEED_ADVANCES"),
      stages: z.array(bracketStageSchema).length(3),
    }),
    tieRule: z.literal("HIGHER_QUALIFICATION_SEED_ADVANCES"),
    attendanceMissLimit: z.literal(3),
  }),
  rounds: z.array(publishedRoundSchema),
  viewer: z.object({
    userId: z.uuid(),
    isCommissioner: z.boolean(),
  }),
});

export type LivePlayoffState = z.infer<typeof livePlayoffStateSchema>;
