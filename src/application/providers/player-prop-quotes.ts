import { z } from "zod";

export const propMarketFamilies = [
  "player_pass_yds",
  "player_rush_yds",
  "player_reception_yds",
] as const;
export type PropMarketFamily = (typeof propMarketFamilies)[number];
export const propFamilySchema = z.enum(propMarketFamilies);
export const propQuoteImportSchema = z.object({
  source: z.literal("THE_ODDS_API"),
  fetchedAt: z.iso.datetime(),
  events: z
    .array(
      z.object({
        source: z.literal("THE_ODDS_API"),
        externalEventId: z.string().min(1),
        sportKey: z.literal("americanfootball_nfl"),
        awayTeam: z.string().min(1),
        homeTeam: z.string().min(1),
        scheduledStartAt: z.iso.datetime(),
        requestedFamilies: z.array(propFamilySchema).min(1).max(3),
        markets: z.array(
          z.object({
            sourceBook: z.literal("draftkings"),
            marketType: z.enum([
              "PLAYER_PASSING_YARDS",
              "PLAYER_RUSHING_YARDS",
              "PLAYER_RECEIVING_YARDS",
            ]),
            statistic: z.enum([
              "PASSING_YARDS",
              "RUSHING_YARDS",
              "RECEIVING_YARDS",
            ]),
            period: z.literal("FULL_GAME"),
            externalPlayerId: z.string().min(1),
            outcomeKey: z.enum(["OVER", "UNDER"]),
            proposition: z.string().min(1),
            lineMilli: z.number().int(),
            americanOdds: z
              .number()
              .int()
              .refine((n) => n !== 0),
            observedAt: z.iso.datetime(),
          }),
        ),
      }),
    )
    .length(1),
});
export type PropQuoteImport = z.infer<typeof propQuoteImportSchema>;
