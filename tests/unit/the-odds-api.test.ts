import { describe, expect, it, vi } from "vitest";
import {
  fetchNflOdds,
  fetchNflScores,
} from "@/adapters/providers/the-odds-api/client";
import { normalizeTheOddsApiScores } from "@/adapters/providers/the-odds-api/normalize-scores";
import {
  normalizeTheOddsApiOdds,
  OddsProviderPayloadError,
  selectNearestNflSlateEventIds,
} from "@/adapters/providers/the-odds-api/normalize";

vi.mock("server-only", () => ({}));

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

function discoveredEvent(id: string, commenceTime: string) {
  return {
    id,
    sport_key: "americanfootball_nfl",
    commence_time: commenceTime,
    home_team: `${id} Home`,
    away_team: `${id} Away`,
  };
}

describe("The Odds API normalization", () => {
  it("discovers the nearest weekly event ids before requesting odds", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            discoveredEvent("event-buf-nyj", "2026-09-13T17:00:00.000Z"),
            discoveredEvent("next-thursday", "2026-09-17T00:20:00.000Z"),
          ]),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([event()])));

    const result = await fetchNflOdds({
      apiKey: "test-key",
      fetchedAt: observedAt,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const discoveryUrl = new URL(String(fetchImpl.mock.calls[0][0]));
    const oddsUrl = new URL(String(fetchImpl.mock.calls[1][0]));
    expect(
      discoveryUrl.pathname.endsWith("/sports/americanfootball_nfl/events"),
    ).toBe(true);
    expect(oddsUrl.searchParams.get("eventIds")).toBe("event-buf-nyj");
    expect(oddsUrl.searchParams.get("bookmakers")).toBe("draftkings");
    expect(result.events).toHaveLength(1);
  });

  it("refreshes only explicit published event ids without rediscovery", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify([event()])));

    const result = await fetchNflOdds({
      apiKey: "test-key",
      eventIds: ["event-buf-nyj"],
      fetchedAt: observedAt,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const oddsUrl = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(oddsUrl.pathname.endsWith("/sports/americanfootball_nfl/odds")).toBe(
      true,
    );
    expect(oddsUrl.searchParams.get("eventIds")).toBe("event-buf-nyj");
    expect(result.events.map((item) => item.externalEventId)).toEqual([
      "event-buf-nyj",
    ]);
  });

  it("fails closed when a published event is missing from refresh", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify([event()])));

    await expect(
      fetchNflOdds({
        apiKey: "test-key",
        eventIds: ["event-buf-nyj", "event-missing"],
        fetchedAt: observedAt,
        fetchImpl,
      }),
    ).rejects.toThrow("complete published NFL slate");
  });

  it("selects only the nearest Thursday-through-Monday NFL slate", () => {
    const result = selectNearestNflSlateEventIds([
      discoveredEvent("next-thursday", "2026-09-17T00:20:00.000Z"),
      discoveredEvent("monday-night", "2026-09-15T00:15:00.000Z"),
      discoveredEvent("opening-thursday", "2026-09-10T00:20:00.000Z"),
      discoveredEvent("sunday", "2026-09-13T17:00:00.000Z"),
    ]);

    expect(result).toEqual(["opening-thursday", "sunday", "monday-night"]);
  });

  it("fails closed if the nearest weekly slate exceeds its storage bound", () => {
    const events = Array.from({ length: 33 }, (_, index) =>
      discoveredEvent(
        `event-${String(index).padStart(2, "0")}`,
        "2026-09-13T17:00:00.000Z",
      ),
    );

    expect(() => selectNearestNflSlateEventIds(events)).toThrow(
      "more than 32 events",
    );
  });

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

  it("normalizes live and completed NFL score responses", () => {
    const result = normalizeTheOddsApiScores(
      [
        {
          id: "event-buf-nyj",
          sport_key: "americanfootball_nfl",
          commence_time: "2026-09-13T17:00:00.000Z",
          home_team: "New York Jets",
          away_team: "Buffalo Bills",
          completed: true,
          scores: [
            { name: "New York Jets", score: "20" },
            { name: "Buffalo Bills", score: "27" },
          ],
          last_update: "2026-09-13T20:12:30.000Z",
        },
      ],
      "2026-09-13T20:13:00.000Z",
    );

    expect(result.events[0]).toEqual(
      expect.objectContaining({
        externalEventId: "event-buf-nyj",
        awayScore: 27,
        homeScore: 20,
        completed: true,
        lastUpdate: "2026-09-13T20:12:30.000Z",
      }),
    );
  });

  it("requests scores only for the exact published event set", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: "event-buf-nyj",
            sport_key: "americanfootball_nfl",
            commence_time: "2026-09-13T17:00:00.000Z",
            home_team: "New York Jets",
            away_team: "Buffalo Bills",
            completed: false,
            scores: null,
            last_update: null,
          },
        ]),
      ),
    );

    const result = await fetchNflScores({
      apiKey: "test-key",
      eventIds: ["event-buf-nyj"],
      fetchedAt: observedAt,
      fetchImpl,
    });

    const scoresUrl = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(scoresUrl.pathname.endsWith("/americanfootball_nfl/scores")).toBe(
      true,
    );
    expect(scoresUrl.searchParams.get("daysFrom")).toBe("3");
    expect(scoresUrl.searchParams.get("eventIds")).toBe("event-buf-nyj");
    expect(result.events[0].awayScore).toBeNull();
  });

  it("fails closed on partial scores and incomplete score slates", async () => {
    expect(() =>
      normalizeTheOddsApiScores(
        [
          {
            id: "event-buf-nyj",
            sport_key: "americanfootball_nfl",
            commence_time: "2026-09-13T17:00:00.000Z",
            home_team: "New York Jets",
            away_team: "Buffalo Bills",
            completed: true,
            scores: [{ name: "New York Jets", score: "20" }],
            last_update: "2026-09-13T20:12:30.000Z",
          },
        ],
        observedAt,
      ),
    ).toThrow("exactly two team scores");

    await expect(
      fetchNflScores({
        apiKey: "test-key",
        eventIds: ["event-buf-nyj", "event-missing"],
        fetchedAt: observedAt,
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              {
                id: "event-buf-nyj",
                sport_key: "americanfootball_nfl",
                commence_time: "2026-09-13T17:00:00.000Z",
                home_team: "New York Jets",
                away_team: "Buffalo Bills",
                completed: false,
                scores: null,
                last_update: null,
              },
            ]),
          ),
        ),
      }),
    ).rejects.toThrow("complete published NFL score slate");
  });
});
