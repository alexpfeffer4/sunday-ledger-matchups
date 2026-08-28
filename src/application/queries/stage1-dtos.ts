import { z } from "zod";

const settlementSchema = z
  .object({
    outcome: z.enum(["WIN", "LOSS", "PUSH", "VOID"]),
    returnedCenticredits: z.number().int().nonnegative(),
  })
  .nullable();

const positionSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  eventLabel: z.string(),
  marketType: z.enum(["MONEYLINE", "SPREAD", "TOTAL"]),
  proposition: z.string(),
  americanOdds: z.number().int(),
  stakeCredits: z.number().int().positive(),
  settlement: settlementSchema.optional(),
});

export const stage1MarketSchema = z.object({
  id: z.uuid(),
  marketType: z.enum(["MONEYLINE", "SPREAD", "TOTAL"]),
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
    markets: z.array(stage1MarketSchema).length(6),
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
    })
    .nullable(),
  schedule: z.array(
    z.object({
      id: z.uuid(),
      displayOrder: z.number().int(),
      scope: z.enum(["REGULAR", "PLAYOFF", "PLACEMENT", "EXHIBITION"]),
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
      state: z.enum(["SCHEDULED", "LIVE", "FINAL", "VOID", "CORRECTED"]),
      providerHealth: z.enum(["HEALTHY", "DEGRADED"]),
      markets: z.array(stage1MarketSchema),
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
      selfEntryId: z.uuid(),
      opponentEntryId: z.uuid(),
      opponentName: z.string(),
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
