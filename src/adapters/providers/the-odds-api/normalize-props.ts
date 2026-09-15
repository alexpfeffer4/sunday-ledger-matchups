import { z } from "zod";
import {
  propQuoteImportSchema,
  type PropMarketFamily,
  type PropQuoteImport,
} from "@/application/providers/player-prop-quotes";
import { OddsProviderPayloadError } from "./normalize";

const eventSchema = z.object({
  id: z.string().min(1),
  sport_key: z.literal("americanfootball_nfl"),
  commence_time: z.iso.datetime(),
  away_team: z.string().min(1),
  home_team: z.string().min(1),
  bookmakers: z.array(
    z.object({
      key: z.string(),
      markets: z.array(
        z.object({
          key: z.string(),
          last_update: z.iso.datetime(),
          outcomes: z.array(
            z.object({
              name: z.enum(["Over", "Under"]),
              description: z.string().min(1),
              price: z
                .number()
                .int()
                .refine((n) => n !== 0),
              point: z.number().finite(),
            }),
          ),
        }),
      ),
    }),
  ),
});
const statistics = {
  player_pass_yds: "PASSING_YARDS",
  player_rush_yds: "RUSHING_YARDS",
  player_reception_yds: "RECEIVING_YARDS",
} as const;

/** Description is a source identity requiring an exact verified mapping in SQL.
 * It is never treated as a canonical player ID or fuzzy-matched here. */
export function normalizeTheOddsApiProps(
  payload: unknown,
  fetchedAt: string,
  eventId: string,
  families: readonly PropMarketFamily[],
): PropQuoteImport {
  const parsed = eventSchema.safeParse(payload);
  if (!parsed.success || parsed.data.id !== eventId)
    throw new OddsProviderPayloadError(
      "The Odds API returned an invalid player-market event.",
    );
  const event = parsed.data;
  const books = event.bookmakers.filter((b) => b.key === "draftkings");
  if (books.length > 1)
    throw new OddsProviderPayloadError("Duplicate nominated bookmaker.");
  const markets: PropQuoteImport["events"][number]["markets"] = [];
  for (const family of families) {
    const matches = books[0]?.markets.filter((m) => m.key === family) ?? [];
    if (matches.length > 1)
      throw new OddsProviderPayloadError("Duplicate standard player market.");
    const market = matches[0];
    // A successful response lacking a requested family is a known suspension,
    // not permission to retain its previous offers as current.
    if (!market) continue;
    const grouped = new Map<string, typeof market.outcomes>();
    for (const outcome of market.outcomes) {
      const group = grouped.get(outcome.description) ?? [];
      group.push(outcome);
      grouped.set(outcome.description, group);
    }
    for (const [player, outcomes] of grouped) {
      if (
        outcomes.length !== 2 ||
        new Set(outcomes.map((o) => o.name)).size !== 2 ||
        outcomes[0].point !== outcomes[1].point
      ) {
        throw new OddsProviderPayloadError(
          "Player markets require one matching standard Over and Under pair.",
        );
      }
      for (const outcome of outcomes) {
        const milli = outcome.point * 1000;
        if (!Number.isSafeInteger(milli))
          throw new OddsProviderPayloadError(
            "Player line exceeds supported precision.",
          );
        markets.push({
          sourceBook: "draftkings",
          marketType: `PLAYER_${statistics[family]}`,
          statistic: statistics[family],
          period: "FULL_GAME",
          externalPlayerId: player,
          outcomeKey: outcome.name === "Over" ? "OVER" : "UNDER",
          proposition: `${player} ${outcome.name} ${outcome.point}`,
          lineMilli: milli,
          americanOdds: outcome.price,
          observedAt: market.last_update,
        });
      }
    }
  }
  return propQuoteImportSchema.parse({
    source: "THE_ODDS_API",
    fetchedAt,
    events: [
      {
        source: "THE_ODDS_API",
        externalEventId: event.id,
        sportKey: event.sport_key,
        awayTeam: event.away_team,
        homeTeam: event.home_team,
        scheduledStartAt: event.commence_time,
        requestedFamilies: [...families].sort(),
        markets,
      },
    ],
  });
}
