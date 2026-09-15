import { z } from "zod";
import { marketTypeSchema } from "@/rulesets/schema";
import { playerPropSlotSchema, playerSubjectFields } from "./player-prop-dtos";

// Public game identity is deliberately separate from a receipt. Zod strips
// unrecognized fields so no per-game allocation/market metadata is forwarded.
export const selectedGameSchema = z.object({
  eventId: z.uuid(),
  eventLabel: z.string(),
  scheduledStartAt: z.string(),
});

const settlementSchema = z
  .object({
    outcome: z.enum(["WIN", "LOSS", "PUSH", "VOID"]),
    returnedCenticredits: z.number().int().nonnegative(),
    finalYards: z.number().nullable().optional(),
    playerEvidenceVersion: z.number().int().positive().nullable().optional(),
    playerCorrectionReason: z.string().nullable().optional(),
  })
  .nullable();

const positionSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  eventLabel: z.string(),
  marketType: marketTypeSchema,
  ...playerSubjectFields,
  proposition: z.string(),
  americanOdds: z.number().int(),
  stakeCredits: z.number().int().positive(),
  settlement: settlementSchema.optional(),
});

export const stage1MarketSchema = z.object({
  id: z.uuid(),
  marketType: marketTypeSchema,
  ...playerSubjectFields,
  outcomeKey: z.enum(["AWAY", "HOME", "OVER", "UNDER"]),
  proposition: z.string(),
  lineMilli: z.number().int().nullable(),
  americanOdds: z.number().int(),
  qualityStatus: z.enum([
    "HEALTHY",
    "STALE",
    "OUTLIER",
    "SUSPENDED",
    "PROVIDER_DEGRADED",
  ]),
  observedAt: z.string(),
  payloadHash: z.string().length(64),
  maximumStakeCredits: z.number().int().positive(),
});

export const liveQuoteHeadsSchema = z.array(
  z.object({
    eventId: z.uuid(),
    // Main import enforces its exact six outcomes in SQL. A prop-only refresh
    // may truthfully return a subset, and a full head includes extra subjects.
    markets: z.array(stage1MarketSchema),
  }),
);

export const stage1StateSchema = z.object({
  league: z.object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    role: z.enum(["MEMBER", "COMMISSIONER"]),
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
    memberCount: z.number().int().nonnegative(),
  }),
  season: z.object({
    id: z.uuid(),
    scheduleSeed: z.string(),
    rosterLockedAt: z.string().nullable(),
    simulatedNow: z.string().nullable(),
    rulesetSnapshotId: z.uuid(),
    // Missing context disables writes; historical receipt reads still work.
    rulesetSnapshot: z.unknown().optional(),
  }),
  viewer: z.object({
    userId: z.uuid(),
    entryId: z.uuid(),
    displayName: z.string(),
    avatarUrl: z.string().nullable(),
  }),
  members: z.array(
    z.object({
      userId: z.uuid(),
      entryId: z.uuid().nullable(),
      displayName: z.string(),
      role: z.enum(["MEMBER", "COMMISSIONER"]),
      joinedAt: z.string(),
    }),
  ),
  week: z
    .object({
      id: z.uuid(),
      nflWeek: z.number().int(),
      scope: z.enum(["REGULAR", "PLAYOFF", "PLACEMENT", "EXHIBITION"]),
      state: z.enum(["PLANNED", "OPEN", "LOCKED", "PROVISIONAL", "FINAL"]),
      opensAt: z.string(),
      commonLockAt: z.string(),
      lockedAt: z.string().nullable(),
      correctionWindowClosesAt: z.string().nullable(),
      finalizationMode: z.enum(["MANUAL_24H", "AFTER_RESULTS"]).optional(),
      rollingSubmissionsEnabled: z.boolean().optional(),
      propsEnabled: z.boolean().optional(),
      entryClosesAt: z.string().nullable().optional(),
      entryClosed: z.boolean().optional(),
    })
    .nullable(),
  schedule: z.array(
    z.object({
      id: z.uuid(),
      displayOrder: z.number().int(),
      scope: z.enum(["REGULAR", "PLAYOFF", "PLACEMENT", "EXHIBITION"]),
      postseasonRole: z
        .enum(["CHAMPIONSHIP", "THIRD_PLACE", "PLACEMENT", "EXHIBITION"])
        .nullable()
        .optional(),
      sideAEntryId: z.uuid(),
      sideAName: z.string(),
      sideBEntryId: z.uuid(),
      sideBName: z.string(),
      result: z
        .object({
          sideADecision: z.enum(["WIN", "LOSS", "TIE"]),
          sideBDecision: z.enum(["WIN", "LOSS", "TIE"]),
          sideAPointsForCenticredits: z.number().int().nonnegative(),
          sideBPointsForCenticredits: z.number().int().nonnegative(),
          status: z.enum(["PROVISIONAL", "FINAL"]),
        })
        .nullable(),
    }),
  ),
  slate: z.array(
    z.object({
      id: z.uuid(),
      key: z.string(),
      awayTeam: z.string(),
      homeTeam: z.string(),
      scheduledStartAt: z.string(),
      actualStartedAt: z.string().nullable(),
      entryClosesAt: z.string().nullable().optional(),
      entryOpen: z.boolean().optional(),
      state: z.enum(["SCHEDULED", "LIVE", "FINAL", "VOID", "CORRECTED"]),
      providerHealth: z.enum(["HEALTHY", "DEGRADED"]),
      markets: z.array(stage1MarketSchema),
      playerProps: z.array(playerPropSlotSchema).optional(),
    }),
  ),
  ownerCard: z
    .object({
      id: z.uuid(),
      entryId: z.uuid(),
      grantedCredits: z.literal(1000),
      grantedAt: z.string(),
      compliance: z.enum(["PENDING", "COMPLIANT", "INCOMPLETE"]),
      lockedAt: z.string().nullable(),
      allocatedCredits: z.number().int().nonnegative(),
      remainingCredits: z.number().int().nonnegative(),
      rollingSubmissionsEnabled: z.boolean().optional(),
      canSubmit: z.boolean().optional(),
      positions: z.array(
        positionSchema.extend({
          eventKey: z.string(),
          scheduledStartAt: z.string(),
          outcomeKey: z.string(),
          lineMilli: z.number().int().nullable(),
          quoteObservedAt: z.string(),
          acceptedAt: z.string(),
          receiptHash: z.string().length(64),
        }),
      ),
    })
    .nullable(),
  matchup: z
    .object({
      id: z.uuid(),
      postseasonRole: z
        .enum(["CHAMPIONSHIP", "THIRD_PLACE", "PLACEMENT", "EXHIBITION"])
        .nullable()
        .optional(),
      selfEntryId: z.uuid(),
      opponentEntryId: z.uuid(),
      opponentName: z.string(),
      // A single submission fact; never draft progress or sealed pick metadata.
      // Missing on an older database during rollout means unknown, not unsealed.
      opponentSealed: z.boolean().nullable().optional(),
      opponentSubmitted: z.boolean().nullable().optional(),
      opponentSelectedGames: z.array(selectedGameSchema).optional(),
      opponentAvailableCredits: z
        .number()
        .int()
        .nonnegative()
        .nullable()
        .optional(),
      opponentExpiredCredits: z
        .number()
        .int()
        .nonnegative()
        .nullable()
        .optional(),
      opponentCanSubmit: z.boolean().nullable().optional(),
      opponentReadiness: z
        .enum(["PENDING", "COMPLIANT", "INCOMPLETE"])
        .nullable(),
      opponentRevealedPositions: z.array(positionSchema),
      futureSealed: z.boolean(),
      result: z
        .object({
          selfDecision: z.enum(["WIN", "LOSS", "TIE"]),
          opponentDecision: z.enum(["WIN", "LOSS", "TIE"]),
          selfPointsForCenticredits: z.number().int().nonnegative(),
          opponentPointsForCenticredits: z.number().int().nonnegative(),
          status: z.enum(["PROVISIONAL", "FINAL"]),
        })
        .nullable(),
    })
    .nullable(),
  standingsThroughWeek: z.number().int().min(1).max(18).nullable().optional(),
  standings: z.array(
    z.object({
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
      deterministicTiebreak: z.string(),
    }),
  ),
  commissioner: z.object({
    isCommissioner: z.boolean(),
    readyCount: z.number().int().nonnegative().nullable(),
    cardCount: z.number().int().nonnegative(),
    correctionCount: z.number().int().nonnegative(),
  }),
});

export type Stage1StateDto = z.infer<typeof stage1StateSchema>;
