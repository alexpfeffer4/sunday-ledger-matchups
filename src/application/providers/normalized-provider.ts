import { z } from "zod";

export const providerSourceSchema = z.enum([
  "THE_ODDS_API",
  "SIMULATION_FIXTURE",
]);

export const normalizedMainMarketSchema = z.object({
  sourceBook: z.literal("draftkings"),
  marketType: z.enum(["MONEYLINE", "SPREAD", "TOTAL"]),
  outcomeKey: z.enum(["AWAY", "HOME", "OVER", "UNDER"]),
  proposition: z.string().min(1),
  lineMilli: z.number().int().nullable(),
  americanOdds: z
    .number()
    .int()
    .refine((odds) => odds !== 0),
  observedAt: z.iso.datetime(),
});

export const normalizedProviderEventSchema = z.object({
  source: providerSourceSchema,
  externalEventId: z.string().min(1),
  sportKey: z.literal("americanfootball_nfl"),
  awayTeam: z.string().min(1),
  homeTeam: z.string().min(1),
  scheduledStartAt: z.iso.datetime(),
});

export const normalizedProviderEventWithMarketsSchema =
  normalizedProviderEventSchema.extend({
    markets: z.array(normalizedMainMarketSchema).length(6),
  });

export const normalizedEventResultSchema = normalizedProviderEventSchema
  .extend({
    version: z.number().int().positive(),
    availableAt: z.iso.datetime(),
    status: z.enum(["SCHEDULED", "LIVE", "FINAL", "VOID"]),
    completed: z.boolean(),
    awayScore: z.number().int().nonnegative().nullable(),
    homeScore: z.number().int().nonnegative().nullable(),
    reason: z.string().min(1),
  })
  .superRefine((result, context) => {
    const hasScores = result.awayScore !== null && result.homeScore !== null;
    if ((result.awayScore === null) !== (result.homeScore === null)) {
      context.addIssue({ code: "custom", message: "Scores are atomic." });
    }
    if (result.status === "FINAL" && (!result.completed || !hasScores)) {
      context.addIssue({
        code: "custom",
        message: "Final results require both scores.",
      });
    }
    if (result.status === "VOID" && (hasScores || !result.completed)) {
      context.addIssue({
        code: "custom",
        message: "Void results complete without scores.",
      });
    }
  });

export type NormalizedMainMarket = z.infer<typeof normalizedMainMarketSchema>;
export type NormalizedProviderEvent = z.infer<
  typeof normalizedProviderEventSchema
>;
export type NormalizedProviderEventWithMarkets = z.infer<
  typeof normalizedProviderEventWithMarketsSchema
>;
export type NormalizedEventResult = z.infer<typeof normalizedEventResultSchema>;

export interface NormalizedNflProvider {
  listEvents(week: number): Promise<readonly NormalizedProviderEvent[]>;
  listMainMarkets(
    week: number,
  ): Promise<readonly NormalizedProviderEventWithMarkets[]>;
  getEventResults(
    week: number,
    availableAt: string,
  ): Promise<readonly NormalizedEventResult[]>;
}
