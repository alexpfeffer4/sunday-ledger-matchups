import { z } from "zod";

export const liveMarketSnapshotSchema = z.object({
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

export const liveProviderEventSchema = z.object({
  source: z.literal("THE_ODDS_API"),
  externalEventId: z.string().min(1),
  sportKey: z.literal("americanfootball_nfl"),
  awayTeam: z.string().min(1),
  homeTeam: z.string().min(1),
  scheduledStartAt: z.iso.datetime(),
  markets: z.array(liveMarketSnapshotSchema).length(6),
});

export const liveOddsImportSchema = z.object({
  source: z.literal("THE_ODDS_API"),
  fetchedAt: z.iso.datetime(),
  events: z.array(liveProviderEventSchema).min(1),
});

export type LiveOddsImport = z.infer<typeof liveOddsImportSchema>;
export type LiveProviderEvent = z.infer<typeof liveProviderEventSchema>;
