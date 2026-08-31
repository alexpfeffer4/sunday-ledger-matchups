import { z } from "zod";

export const matchupScopeSchema = z.enum([
  "REGULAR",
  "PLAYOFF",
  "PLACEMENT",
  "EXHIBITION",
]);

export const postseasonRoleSchema = z.enum([
  "CHAMPIONSHIP",
  "THIRD_PLACE",
  "PLACEMENT",
  "EXHIBITION",
]);

const decisionSchema = z.enum(["WIN", "LOSS", "TIE"]);

const standingsRowSchema = z.object({
  seed: z.number().int().positive(),
  entryId: z.uuid(),
  displayName: z.string(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  ties: z.number().int().nonnegative(),
  pointsForCenticredits: z.number().int().nonnegative(),
  allPlayHalfWinUnits: z.number().int().nonnegative(),
  allPlayComparisonCount: z.number().int().nonnegative(),
  attendanceMisses: z.number().int().nonnegative(),
  highestWeekCenticredits: z.number().int().nonnegative(),
  deterministicTiebreak: z.string(),
  headToHeadApplied: z.boolean().optional(),
  headToHeadHalfWinUnits: z.number().int().nonnegative().optional(),
  headToHeadComparisonCount: z.number().int().nonnegative().optional(),
});

const resultEffectSchema = z.object({
  versionId: z.uuid(),
  sideADecision: decisionSchema,
  sideBDecision: decisionSchema,
  sideAPointsForCenticredits: z.number().int().nonnegative(),
  sideBPointsForCenticredits: z.number().int().nonnegative(),
});

export const weeklyCloseStateSchema = z.object({
  league: z.object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    mode: z.enum(["LIVE", "SIMULATION"]),
    nflYear: z.number().int(),
    lifecycle: z.enum([
      "DRAFT",
      "ROSTER_LOCKED",
      "REGULAR",
      "PLAYOFFS",
      "CHAMPION_FINAL",
      "WEEK_18_EXHIBITION",
      "FINAL",
    ]),
  }),
  season: z.object({
    id: z.uuid(),
    regularSeasonWeeks: z.number().int().positive().nullable(),
    correctionWindowHours: z.number().int().positive().nullable(),
    qualifierCount: z.number().int().positive().nullable(),
  }),
  viewer: z.object({
    entryId: z.uuid(),
    displayName: z.string(),
  }),
  members: z.array(
    z.object({
      entryId: z.uuid(),
      userId: z.uuid(),
      displayName: z.string(),
    }),
  ),
  weeks: z.array(
    z.object({
      id: z.uuid(),
      nflWeek: z.number().int().min(1).max(18),
      scope: matchupScopeSchema,
      state: z.enum(["PLANNED", "OPEN", "LOCKED", "PROVISIONAL", "FINAL"]),
      correctionWindowClosesAt: z.string().nullable(),
    }),
  ),
  matchups: z.array(
    z.object({
      id: z.uuid(),
      seasonId: z.uuid(),
      nflYear: z.number().int(),
      weekId: z.uuid(),
      nflWeek: z.number().int().min(1).max(18),
      scope: matchupScopeSchema,
      postseasonRole: postseasonRoleSchema.nullable().optional(),
      displayOrder: z.number().int().positive(),
      sideAEntryId: z.uuid(),
      sideAUserId: z.uuid(),
      sideBEntryId: z.uuid(),
      sideBUserId: z.uuid(),
      result: z
        .object({
          versionId: z.uuid(),
          supersedesVersionId: z.uuid().nullable(),
          sideADecision: decisionSchema,
          sideBDecision: decisionSchema,
          sideAParticipation: z
            .enum(["COMPLETED", "EXHIBITION_MISS"])
            .optional(),
          sideBParticipation: z
            .enum(["COMPLETED", "EXHIBITION_MISS"])
            .optional(),
          sideAPointsForCenticredits: z.number().int().nonnegative(),
          sideBPointsForCenticredits: z.number().int().nonnegative(),
          status: z.enum(["PROVISIONAL", "FINAL"]),
          recordedAt: z.string(),
        })
        .nullable(),
    }),
  ),
  standings: z.array(
    z.object({
      snapshotId: z.uuid(),
      supersedesSnapshotId: z.uuid().nullable(),
      weekId: z.uuid(),
      throughWeek: z.number().int().min(1).max(18),
      status: z.enum(["PROVISIONAL", "FINAL"]),
      rows: z.array(standingsRowSchema),
      recordedAt: z.string(),
    }),
  ),
  corrections: z.array(
    z.object({
      id: z.uuid(),
      weekId: z.uuid(),
      nflWeek: z.number().int().min(1).max(18),
      eventLabel: z.string(),
      reason: z.string(),
      actorName: z.string(),
      correctedAt: z.string(),
      beforeStandingsSnapshotId: z.uuid().nullable(),
      afterStandingsSnapshotId: z.uuid().nullable(),
      originalEvent: z.object({
        versionId: z.uuid(),
        status: z.enum(["FINAL", "VOID"]),
        awayScore: z.number().int().nonnegative().nullable(),
        homeScore: z.number().int().nonnegative().nullable(),
      }),
      correctedEvent: z.object({
        versionId: z.uuid(),
        status: z.enum(["FINAL", "VOID"]),
        awayScore: z.number().int().nonnegative().nullable(),
        homeScore: z.number().int().nonnegative().nullable(),
      }),
      effects: z.array(
        z.object({
          matchupId: z.uuid(),
          before: resultEffectSchema.nullable(),
          after: resultEffectSchema,
        }),
      ),
    }),
  ),
  playoffField: z
    .object({
      publicationId: z.uuid(),
      qualifierCount: z.number().int().positive(),
      qualifiers: z.array(
        z
          .object({
            entryId: z.uuid(),
            qualificationSeed: z.number().int().positive(),
          })
          .passthrough(),
      ),
      publishedAt: z.string(),
    })
    .nullable(),
});

export type MatchupScope = z.infer<typeof matchupScopeSchema>;
export type PostseasonRole = z.infer<typeof postseasonRoleSchema>;
export type WeeklyCloseStateDto = z.infer<typeof weeklyCloseStateSchema>;
export type WeeklyCloseStandingsRow = z.infer<typeof standingsRowSchema>;
