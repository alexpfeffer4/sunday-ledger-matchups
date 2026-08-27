import { describe, expect, it } from "vitest";
import {
  normalizeTheOddsApiOdds,
  OddsProviderPayloadError,
} from "@/adapters/providers/the-odds-api/normalize";

const observedAt = "2026-09-10T16:00:00.000Z";

function event(overrides?: Record<string, unknown>) {
  return {
    id: "event-buf-nyj",
    sport_key: "americanfootball_nfl",
    commence_time: "2026-09-13T17:00:00.000Z",
    home_team: "New York Jets",
    away_team: "Buffalo Bills",
    bookmakers: [
      {
        key: "fanduel",
        markets: [],
      },
      {
        key: "draftkings",
        markets: [
          {
            key: "h2h",
            last_update: observedAt,
            outcomes: [
              { name: "Buffalo Bills", price: -160 },
              { name: "New York Jets", price: 140 },
            ],
          },
          {
            key: "spreads",
            last_update: observedAt,
            outcomes: [
              { name: "Buffalo Bills", price: -108, point: -3.5 },
              { name: "New York Jets", price: -112, point: 3.5 },
            ],
          },
          {
            key: "totals",
            last_update: observedAt,
            outcomes: [
              { name: "Over", price: -105, point: 44.5 },
              { name: "Under", price: -115, point: 44.5 },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("The Odds API normalization", () => {
  it("normalizes the complete DraftKings main-market set", () => {
    const result = normalizeTheOddsApiOdds([event()], observedAt);

    expect(result).toEqual({
      source: "THE_ODDS_API",
      fetchedAt: observedAt,
      events: [
        expect.objectContaining({
          source: "THE_ODDS_API",
          externalEventId: "event-buf-nyj",
          sportKey: "americanfootball_nfl",
          awayTeam: "Buffalo Bills",
          homeTeam: "New York Jets",
          scheduledStartAt: "2026-09-13T17:00:00.000Z",
          markets: [
            expect.objectContaining({
              marketType: "MONEYLINE",
              outcomeKey: "AWAY",
              lineMilli: null,
              americanOdds: -160,
            }),
            expect.objectContaining({
              marketType: "MONEYLINE",
              outcomeKey: "HOME",
              lineMilli: null,
              americanOdds: 140,
            }),
            expect.objectContaining({
              marketType: "SPREAD",
              outcomeKey: "AWAY",
              proposition: "Buffalo Bills -3.5",
              lineMilli: -3500,
            }),
            expect.objectContaining({
              marketType: "SPREAD",
              outcomeKey: "HOME",
              proposition: "New York Jets +3.5",
              lineMilli: 3500,
            }),
            expect.objectContaining({
              marketType: "TOTAL",
              outcomeKey: "OVER",
              lineMilli: 44500,
            }),
            expect.objectContaining({
              marketType: "TOTAL",
              outcomeKey: "UNDER",
              lineMilli: 44500,
            }),
          ],
        }),
      ],
    });
  });

  it("sorts events deterministically by kickoff and provider id", () => {
    const later = event({
      id: "event-later",
      commence_time: "2026-09-13T20:25:00.000Z",
    });
    const earlier = event({ id: "event-earlier" });

    const result = normalizeTheOddsApiOdds([later, earlier], observedAt);

    expect(result.events.map((item) => item.externalEventId)).toEqual([
      "event-earlier",
      "event-later",
    ]);
  });

  it("fails closed when a main market is missing", () => {
    const incomplete = event();
    const draftKings = incomplete.bookmakers[1];
    draftKings.markets = draftKings.markets.filter(
      (market) => market.key !== "totals",
    );

    expect(() =>
      normalizeTheOddsApiOdds([incomplete], observedAt),
    ).toThrowError(OddsProviderPayloadError);
  });

  it("fails closed on mismatched lines and duplicate events", () => {
    const mismatched = event();
    const spreads = mismatched.bookmakers[1].markets[1];
    spreads.outcomes[1] = { ...spreads.outcomes[1], point: 4 };

    expect(() => normalizeTheOddsApiOdds([mismatched], observedAt)).toThrow(
      "inconsistent spread lines",
    );
    expect(() =>
      normalizeTheOddsApiOdds([event(), event()], observedAt),
    ).toThrow("duplicate event event-buf-nyj");
  });
});
