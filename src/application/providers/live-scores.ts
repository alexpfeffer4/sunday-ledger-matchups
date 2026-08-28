import { z } from "zod";

export const liveEventScoreSchema = z
  .object({
    source: z.literal("THE_ODDS_API"),
    externalEventId: z.string().min(1),
    sportKey: z.literal("americanfootball_nfl"),
    awayTeam: z.string().min(1),
    homeTeam: z.string().min(1),
    scheduledStartAt: z.iso.datetime(),
    completed: z.boolean(),
    awayScore: z.number().int().nonnegative().nullable(),
    homeScore: z.number().int().nonnegative().nullable(),
    lastUpdate: z.iso.datetime().nullable(),
  })
  .superRefine((event, context) => {
    const hasAwayScore = event.awayScore !== null;
    const hasHomeScore = event.homeScore !== null;
    if (hasAwayScore !== hasHomeScore) {
      context.addIssue({
        code: "custom",
        message: "An event must include both team scores or neither score.",
      });
    }
    if ((hasAwayScore || event.completed) && event.lastUpdate === null) {
      context.addIssue({
        code: "custom",
        message: "A live or completed event requires a provider update time.",
      });
    }
    if (event.completed && !hasAwayScore) {
      context.addIssue({
        code: "custom",
        message: "A completed event requires both final scores.",
      });
    }
  });

export const liveScoreImportSchema = z.object({
  source: z.literal("THE_ODDS_API"),
  fetchedAt: z.iso.datetime(),
  events: z.array(liveEventScoreSchema).min(1).max(32),
});

export type LiveEventScore = z.infer<typeof liveEventScoreSchema>;
export type LiveScoreImport = z.infer<typeof liveScoreImportSchema>;
