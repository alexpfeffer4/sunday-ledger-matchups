import { z } from "zod";

export const playerStatisticSchema = z.enum([
  "PASSING_YARDS",
  "RUSHING_YARDS",
  "RECEIVING_YARDS",
]);

/** Only trusted, public catalog identity. Never acceptance counts or stakes. */
export const playerSubjectFields = {
  subjectId: z.uuid().nullable().optional(),
  subjectLabel: z.string().nullable().optional(),
  subjectTeam: z.string().nullable().optional(),
  subjectPosition: z.enum(["QB", "RB", "WR", "TE"]).nullable().optional(),
  statistic: playerStatisticSchema.nullable().optional(),
  period: z.literal("FULL_GAME").nullable().optional(),
};

export const playerPropSlotSchema = z.object({
  eventId: z.uuid(),
  team: z.string(),
  slot: z.enum(["QB_PASS", "RB_RUSH", "RECEIVER"]),
  subjectId: z.uuid().nullable(),
  subjectLabel: z.string().nullable(),
  position: z.enum(["QB", "RB", "WR", "TE"]).nullable(),
  statistic: playerStatisticSchema,
  period: z.literal("FULL_GAME"),
  confirmed: z.boolean(),
  frozen: z.boolean(),
  unavailableReason: z.string().nullable(),
  candidates: z
    .array(
      z.object({
        subjectId: z.uuid(),
        subjectLabel: z.string(),
        position: z.enum(["QB", "RB", "WR", "TE"]),
        roleEvidence: z.string(),
        roleRank: z.number().int(),
      }),
    )
    .optional(),
});

export const playerPropMenuSchema = z.object({
  weekId: z.uuid().nullable(),
  enabled: z.boolean(),
  frozen: z.boolean(),
  slots: z.array(playerPropSlotSchema),
  canOpen: z.boolean().optional(),
  amendmentPending: z.boolean().optional(),
  amendmentApplied: z.boolean().optional(),
});
export type PlayerPropMenu = z.infer<typeof playerPropMenuSchema>;
