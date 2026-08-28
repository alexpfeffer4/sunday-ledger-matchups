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

const matchupSchema = z.object({
  id: z.string(),
  week: z.number().int().min(1).max(18),
  scope: z.enum(["REGULAR", "PLAYOFF", "PLACEMENT", "EXHIBITION"]),
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
});

export type SeasonArchiveDto = z.infer<typeof simulationSeasonArchiveSchema>;

export type SimulationSeasonArchiveDto = z.infer<
  typeof simulationSeasonArchiveSchema
>;
