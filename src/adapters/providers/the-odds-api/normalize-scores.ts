import { z } from "zod";
import {
  liveScoreImportSchema,
  type LiveScoreImport,
} from "@/application/providers/live-scores";
import { OddsProviderPayloadError } from "@/adapters/providers/the-odds-api/normalize";

const scoreSchema = z.object({
  name: z.string().min(1),
  score: z.string().regex(/^\d{1,3}$/),
});

const providerScoreEventSchema = z.object({
  id: z.string().min(1),
  sport_key: z.literal("americanfootball_nfl"),
  commence_time: z.iso.datetime(),
  home_team: z.string().min(1),
  away_team: z.string().min(1),
  completed: z.boolean(),
  scores: z.array(scoreSchema).nullable(),
  last_update: z.iso.datetime().nullable(),
});

const responseSchema = z.array(providerScoreEventSchema).min(1).max(32);

function teamScore(
  scores: z.infer<typeof scoreSchema>[],
  team: string,
  eventId: string,
): number {
  const matches = scores.filter((score) => score.name === team);
  if (matches.length !== 1) {
    throw new OddsProviderPayloadError(
      `Score event ${eventId} requires exactly one result for ${team}.`,
    );
  }
  return Number(matches[0].score);
}

function normalizeScoreEvent(event: z.infer<typeof providerScoreEventSchema>) {
  if (event.scores !== null && event.scores.length !== 2) {
    throw new OddsProviderPayloadError(
      `Score event ${event.id} requires exactly two team scores.`,
    );
  }

  const awayScore =
    event.scores === null
      ? null
      : teamScore(event.scores, event.away_team, event.id);
  const homeScore =
    event.scores === null
      ? null
      : teamScore(event.scores, event.home_team, event.id);

  return {
    source: "THE_ODDS_API" as const,
    externalEventId: event.id,
    sportKey: event.sport_key,
    awayTeam: event.away_team,
    homeTeam: event.home_team,
    scheduledStartAt: event.commence_time,
    completed: event.completed,
    awayScore,
    homeScore,
    lastUpdate: event.last_update,
  };
}

export function normalizeTheOddsApiScores(
  payload: unknown,
  fetchedAt: string,
): LiveScoreImport {
  const parsedFetchedAt = z.iso.datetime().safeParse(fetchedAt);
  if (!parsedFetchedAt.success) {
    throw new OddsProviderPayloadError("Fetch time must be an ISO timestamp.");
  }

  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new OddsProviderPayloadError(
      "The Odds API returned an invalid NFL scores payload.",
    );
  }

  const eventIds = new Set<string>();
  for (const event of parsed.data) {
    if (eventIds.has(event.id)) {
      throw new OddsProviderPayloadError(
        `The Odds API returned duplicate score event ${event.id}.`,
      );
    }
    eventIds.add(event.id);
  }

  try {
    return liveScoreImportSchema.parse({
      source: "THE_ODDS_API",
      fetchedAt: parsedFetchedAt.data,
      events: parsed.data
        .map(normalizeScoreEvent)
        .sort((left, right) =>
          left.scheduledStartAt === right.scheduledStartAt
            ? left.externalEventId.localeCompare(right.externalEventId)
            : left.scheduledStartAt.localeCompare(right.scheduledStartAt),
        ),
    });
  } catch (error) {
    if (error instanceof OddsProviderPayloadError) throw error;
    throw new OddsProviderPayloadError(
      "The Odds API returned an inconsistent NFL scores payload.",
    );
  }
}
