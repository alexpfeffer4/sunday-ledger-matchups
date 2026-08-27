import { z } from "zod";
import {
  liveOddsImportSchema,
  type LiveOddsImport,
} from "@/application/providers/live-odds";

const outcomeSchema = z.object({
  name: z.string().min(1),
  price: z
    .number()
    .int()
    .refine((price) => price !== 0),
  point: z.number().finite().optional(),
});

const marketSchema = z.object({
  key: z.enum(["h2h", "spreads", "totals"]),
  last_update: z.iso.datetime(),
  outcomes: z.array(outcomeSchema).min(2),
});

const bookmakerSchema = z.object({
  key: z.string().min(1),
  markets: z.array(marketSchema),
});

const eventSchema = z.object({
  id: z.string().min(1),
  sport_key: z.literal("americanfootball_nfl"),
  commence_time: z.iso.datetime(),
  home_team: z.string().min(1),
  away_team: z.string().min(1),
  bookmakers: z.array(bookmakerSchema),
});

const responseSchema = z.array(eventSchema).min(1);

export class OddsProviderPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OddsProviderPayloadError";
  }
}

function exactlyOneOutcome(
  outcomes: z.infer<typeof outcomeSchema>[],
  predicate: (outcome: z.infer<typeof outcomeSchema>) => boolean,
  description: string,
) {
  const matches = outcomes.filter(predicate);
  if (matches.length !== 1) {
    throw new OddsProviderPayloadError(
      `DraftKings ${description} requires exactly one matching outcome.`,
    );
  }
  return matches[0];
}

function marketByKey(
  markets: z.infer<typeof marketSchema>[],
  key: z.infer<typeof marketSchema>["key"],
) {
  const matches = markets.filter((market) => market.key === key);
  if (matches.length !== 1) {
    throw new OddsProviderPayloadError(
      `DraftKings requires exactly one ${key} market per event.`,
    );
  }
  return matches[0];
}

function lineMilli(point: number | undefined, description: string): number {
  if (point === undefined) {
    throw new OddsProviderPayloadError(`${description} requires a line.`);
  }
  return Math.round(point * 1_000);
}

function signedLine(point: number): string {
  return `${point > 0 ? "+" : ""}${point}`;
}

function normalizeEvent(event: z.infer<typeof eventSchema>) {
  const draftKings = event.bookmakers.filter(
    (bookmaker) => bookmaker.key === "draftkings",
  );
  if (draftKings.length !== 1) {
    throw new OddsProviderPayloadError(
      `Event ${event.id} requires exactly one DraftKings book.`,
    );
  }

  const h2h = marketByKey(draftKings[0].markets, "h2h");
  const spreads = marketByKey(draftKings[0].markets, "spreads");
  const totals = marketByKey(draftKings[0].markets, "totals");
  const awayMoneyline = exactlyOneOutcome(
    h2h.outcomes,
    (outcome) => outcome.name === event.away_team,
    "away moneyline",
  );
  const homeMoneyline = exactlyOneOutcome(
    h2h.outcomes,
    (outcome) => outcome.name === event.home_team,
    "home moneyline",
  );
  const awaySpread = exactlyOneOutcome(
    spreads.outcomes,
    (outcome) => outcome.name === event.away_team,
    "away spread",
  );
  const homeSpread = exactlyOneOutcome(
    spreads.outcomes,
    (outcome) => outcome.name === event.home_team,
    "home spread",
  );
  const over = exactlyOneOutcome(
    totals.outcomes,
    (outcome) => outcome.name.toLowerCase() === "over",
    "over total",
  );
  const under = exactlyOneOutcome(
    totals.outcomes,
    (outcome) => outcome.name.toLowerCase() === "under",
    "under total",
  );
  const awaySpreadPoint = awaySpread.point;
  const homeSpreadPoint = homeSpread.point;
  const overPoint = over.point;
  const underPoint = under.point;

  if (
    awaySpreadPoint === undefined ||
    homeSpreadPoint === undefined ||
    Math.abs(awaySpreadPoint + homeSpreadPoint) > 0.000_001
  ) {
    throw new OddsProviderPayloadError(
      `Event ${event.id} has inconsistent spread lines.`,
    );
  }
  if (
    overPoint === undefined ||
    underPoint === undefined ||
    Math.abs(overPoint - underPoint) > 0.000_001
  ) {
    throw new OddsProviderPayloadError(
      `Event ${event.id} has inconsistent total lines.`,
    );
  }

  return {
    source: "THE_ODDS_API" as const,
    externalEventId: event.id,
    sportKey: event.sport_key,
    awayTeam: event.away_team,
    homeTeam: event.home_team,
    scheduledStartAt: event.commence_time,
    markets: [
      {
        sourceBook: "draftkings" as const,
        marketType: "MONEYLINE" as const,
        outcomeKey: "AWAY" as const,
        proposition: `${event.away_team} to win`,
        lineMilli: null,
        americanOdds: awayMoneyline.price,
        observedAt: h2h.last_update,
      },
      {
        sourceBook: "draftkings" as const,
        marketType: "MONEYLINE" as const,
        outcomeKey: "HOME" as const,
        proposition: `${event.home_team} to win`,
        lineMilli: null,
        americanOdds: homeMoneyline.price,
        observedAt: h2h.last_update,
      },
      {
        sourceBook: "draftkings" as const,
        marketType: "SPREAD" as const,
        outcomeKey: "AWAY" as const,
        proposition: `${event.away_team} ${signedLine(awaySpreadPoint)}`,
        lineMilli: lineMilli(awaySpreadPoint, "Away spread"),
        americanOdds: awaySpread.price,
        observedAt: spreads.last_update,
      },
      {
        sourceBook: "draftkings" as const,
        marketType: "SPREAD" as const,
        outcomeKey: "HOME" as const,
        proposition: `${event.home_team} ${signedLine(homeSpreadPoint)}`,
        lineMilli: lineMilli(homeSpreadPoint, "Home spread"),
        americanOdds: homeSpread.price,
        observedAt: spreads.last_update,
      },
      {
        sourceBook: "draftkings" as const,
        marketType: "TOTAL" as const,
        outcomeKey: "OVER" as const,
        proposition: `Over ${overPoint}`,
        lineMilli: lineMilli(overPoint, "Over total"),
        americanOdds: over.price,
        observedAt: totals.last_update,
      },
      {
        sourceBook: "draftkings" as const,
        marketType: "TOTAL" as const,
        outcomeKey: "UNDER" as const,
        proposition: `Under ${underPoint}`,
        lineMilli: lineMilli(underPoint, "Under total"),
        americanOdds: under.price,
        observedAt: totals.last_update,
      },
    ],
  };
}

export function normalizeTheOddsApiOdds(
  payload: unknown,
  fetchedAt: string,
): LiveOddsImport {
  const parsedFetchedAt = z.iso.datetime().safeParse(fetchedAt);
  if (!parsedFetchedAt.success) {
    throw new OddsProviderPayloadError("Fetch time must be an ISO timestamp.");
  }

  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new OddsProviderPayloadError(
      "The Odds API returned an invalid NFL odds payload.",
    );
  }

  const eventIds = new Set<string>();
  for (const event of parsed.data) {
    if (eventIds.has(event.id)) {
      throw new OddsProviderPayloadError(
        `The Odds API returned duplicate event ${event.id}.`,
      );
    }
    eventIds.add(event.id);
  }

  return liveOddsImportSchema.parse({
    source: "THE_ODDS_API",
    fetchedAt: parsedFetchedAt.data,
    events: parsed.data
      .map(normalizeEvent)
      .sort((left, right) =>
        left.scheduledStartAt === right.scheduledStartAt
          ? left.externalEventId.localeCompare(right.externalEventId)
          : left.scheduledStartAt.localeCompare(right.scheduledStartAt),
      ),
  });
}
