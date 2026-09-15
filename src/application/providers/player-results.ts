import { z } from "zod";

export const playerStatisticSchema = z.enum([
  "PASSING_YARDS",
  "RUSHING_YARDS",
  "RECEIVING_YARDS",
]);
export const playerObservationSchema = z
  .object({
    provider: z.enum(["API_SPORTS", "NFLVERSE"]),
    externalEventId: z.string().min(1),
    sourceEventId: z.string().min(1),
    externalPlayerId: z.string().min(1),
    subjectId: z.uuid(),
    team: z.string().min(1),
    gameDate: z.iso.date(),
    statistic: playerStatisticSchema,
    period: z.literal("FULL_GAME"),
    value: z.number().int().min(-1000).max(2000).nullable(),
    complete: z.boolean(),
    participation: z.enum(["UNKNOWN", "OFFENSE", "NO_OFFENSE"]),
    participationComplete: z.boolean(),
    sourceUpdatedAt: z.iso.datetime().nullable(),
    participationSourceUpdatedAt: z.iso.datetime().nullable().optional(),
    fetchedAt: z.iso.datetime(),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .superRefine((observation, context) => {
    if (observation.complete && observation.value === null) {
      context.addIssue({
        code: "custom",
        message: "Complete statistics require a value.",
      });
    }
    if (
      observation.participationComplete ===
      (observation.participation === "UNKNOWN")
    ) {
      context.addIssue({
        code: "custom",
        message: "Participation requires explicit evidence.",
      });
    }
    if (
      [
        observation.sourceUpdatedAt,
        observation.participationSourceUpdatedAt,
      ].some(
        (revision) =>
          revision != null &&
          Date.parse(revision) > Date.parse(observation.fetchedAt),
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Source evidence cannot be newer than its fetch.",
      });
    }
    if (
      observation.participation === "NO_OFFENSE" &&
      observation.value !== null &&
      observation.value !== 0
    ) {
      context.addIssue({
        code: "custom",
        message: "Nonzero offensive yardage contradicts zero offensive snaps.",
      });
    }
  });

export type PlayerObservation = z.infer<typeof playerObservationSchema>;
export type PlayerStatistic = z.infer<typeof playerStatisticSchema>;

export const resultPlayerMappingSchema = z.object({
  subjectId: z.uuid(),
  externalPlayerId: z.string().min(1),
  team: z.string().min(1),
  statistic: playerStatisticSchema,
  sourceTeam: z.string().min(1).optional(),
});
export type ResultPlayerMapping = z.infer<typeof resultPlayerMappingSchema>;

/** Offsets from first reliable final detection, never from kickoff or last retry. */
export const PLAYER_RESULT_RETRY_MINUTES = [0, 5, 15, 30, 60] as const;
export function nextPlayerResultAttempt(
  finalObservedAt: Date,
  attempts: number,
): Date | null {
  const minutes = PLAYER_RESULT_RETRY_MINUTES[attempts];
  return minutes === undefined
    ? null
    : new Date(finalObservedAt.getTime() + minutes * 60_000);
}
