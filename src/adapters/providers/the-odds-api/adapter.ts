import "server-only";

import { fetchNflOdds, fetchNflScores } from "./client";
import type {
  NormalizedEventResult,
  NormalizedNflProvider,
  NormalizedProviderEvent,
  NormalizedProviderEventWithMarkets,
} from "@/application/providers/normalized-provider";

/** Live normalized-provider adapter. Week selection remains provider-driven. */
export class TheOddsApiAdapter implements NormalizedNflProvider {
  async listEvents(week: number): Promise<NormalizedProviderEvent[]> {
    void week;
    const imported = await fetchNflOdds();
    return imported.events.map((event) => ({
      source: event.source,
      externalEventId: event.externalEventId,
      sportKey: event.sportKey,
      awayTeam: event.awayTeam,
      homeTeam: event.homeTeam,
      scheduledStartAt: event.scheduledStartAt,
    }));
  }

  async listMainMarkets(
    week: number,
  ): Promise<NormalizedProviderEventWithMarkets[]> {
    void week;
    const imported = await fetchNflOdds();
    return imported.events;
  }

  async getEventResults(
    week: number,
    availableAt: string,
  ): Promise<NormalizedEventResult[]> {
    void week;
    void availableAt;
    const odds = await fetchNflOdds();
    const scores = await fetchNflScores({
      eventIds: odds.events.map((event) => event.externalEventId),
    });
    return scores.events.map((result) => ({
      ...result,
      version: 1,
      availableAt: result.lastUpdate ?? scores.fetchedAt,
      status: result.completed
        ? "FINAL"
        : result.awayScore === null
          ? "SCHEDULED"
          : "LIVE",
      reason: result.completed
        ? "The Odds API completed result."
        : "The Odds API event state.",
    }));
  }
}
