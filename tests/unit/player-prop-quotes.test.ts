import { describe, expect, it, vi } from "vitest";
import {
  fetchNflPlayerProps,
  fetchOddsEntitlementUsage,
} from "@/adapters/providers/the-odds-api/client";
import { normalizeTheOddsApiProps } from "@/adapters/providers/the-odds-api/normalize-props";
vi.mock("server-only", () => ({}));
const time = "2026-09-14T12:00:00Z";
function payload(
  outcomes = [
    { name: "Over", description: "Verified QB Jr.", point: 250.5, price: -110 },
    {
      name: "Under",
      description: "Verified QB Jr.",
      point: 250.5,
      price: -110,
    },
  ],
) {
  return {
    id: "game-a",
    sport_key: "americanfootball_nfl",
    commence_time: "2026-09-14T20:00:00Z",
    away_team: "Away Team",
    home_team: "Home Team",
    bookmakers: [
      {
        key: "draftkings",
        markets: [{ key: "player_pass_yds", last_update: time, outcomes }],
      },
    ],
  };
}
describe("selected player quote provider boundary", () => {
  it("obtains fresh quota headers from the documented uncharged sports endpoint", async () => {
    const fake = vi.fn<typeof fetch>(
      async () =>
        new Response("[]", {
          headers: {
            "x-requests-remaining": "19990",
            "x-requests-used": "10",
            "x-requests-last": "0",
          },
        }),
    );
    expect(
      await fetchOddsEntitlementUsage({
        apiKey: "fixture-only",
        fetchImpl: fake,
      }),
    ).toEqual({ remaining: 19990, used: 10, last: 0 });
    const url = new URL(String(fake.mock.calls[0][0]));
    expect(url.pathname).toBe("/v4/sports/");
    expect(url.searchParams.has("markets")).toBe(false);
    expect(fake).toHaveBeenCalledTimes(1);
  });
  it("uses one event-specific request and only the selected statistic family", async () => {
    const fake = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify(payload()), {
          headers: {
            "x-requests-remaining": "499",
            "x-requests-used": "1",
            "x-requests-last": "1",
          },
        }),
    );
    const usage = vi.fn();
    const result = await fetchNflPlayerProps({
      externalEventId: "game-a",
      families: ["player_pass_yds"],
      apiKey: "fixture-only",
      fetchImpl: fake,
      fetchedAt: time,
      onUsageDetail: usage,
    });
    expect(fake).toHaveBeenCalledTimes(1);
    const url = new URL(String(fake.mock.calls[0][0]));
    expect(url.pathname).toBe(
      "/v4/sports/americanfootball_nfl/events/game-a/odds",
    );
    expect(url.searchParams.get("markets")).toBe("player_pass_yds");
    expect(url.searchParams.get("bookmakers")).toBe("draftkings");
    expect(usage).toHaveBeenCalledWith({ remaining: 499, used: 1, last: 1 });
    expect(result.events[0].markets[0]).toMatchObject({
      externalPlayerId: "Verified QB Jr.",
      statistic: "PASSING_YARDS",
      period: "FULL_GAME",
      lineMilli: 250500,
    });
    expect(result.events[0].markets[0]).not.toHaveProperty("subjectId");
  });
  it("records charged error headers before rejecting a failed HTTP request", async () => {
    const usage = vi.fn();
    await expect(
      fetchNflPlayerProps({
        externalEventId: "game-a",
        families: ["player_pass_yds"],
        apiKey: "fixture-only",
        onUsageDetail: usage,
        fetchImpl: async () =>
          new Response("denied", {
            status: 429,
            headers: { "x-requests-remaining": "498", "x-requests-last": "1" },
          }),
      }),
    ).rejects.toThrow("429");
    expect(usage).toHaveBeenCalledWith({ remaining: 498, used: null, last: 1 });
  });
  it("retains exact requested coverage when a family disappears", () => {
    const result = normalizeTheOddsApiProps(
      { ...payload(), bookmakers: [] },
      time,
      "game-a",
      ["player_pass_yds"],
    );
    expect(result.events[0].requestedFamilies).toEqual(["player_pass_yds"]);
    expect(result.events[0].markets).toEqual([]);
  });
  it("fails closed on alternate lines or an incomplete pair", () => {
    const base = payload();
    const outcomes = base.bookmakers[0].markets[0].outcomes;
    expect(() =>
      normalizeTheOddsApiProps(payload(outcomes.slice(0, 1)), time, "game-a", [
        "player_pass_yds",
      ]),
    ).toThrow("pair");
    expect(() =>
      normalizeTheOddsApiProps(
        payload([
          ...outcomes,
          ...outcomes.map((o) => ({ ...o, point: 260.5 })),
        ]),
        time,
        "game-a",
        ["player_pass_yds"],
      ),
    ).toThrow("pair");
  });
  it("rejects an event mismatch and keeps same-name source labels distinct", () => {
    expect(() =>
      normalizeTheOddsApiProps(payload(), time, "another-game", [
        "player_pass_yds",
      ]),
    ).toThrow();
    const outcomes = payload().bookmakers[0].markets[0].outcomes;
    const normalized = normalizeTheOddsApiProps(
      payload([
        ...outcomes,
        ...outcomes.map((o) => ({ ...o, description: "Verified QB" })),
      ]),
      time,
      "game-a",
      ["player_pass_yds"],
    );
    expect(
      new Set(normalized.events[0].markets.map((m) => m.externalPlayerId)).size,
    ).toBe(2);
  });
});
