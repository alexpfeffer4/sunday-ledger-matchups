import { describe, expect, it, vi } from "vitest";
import { liveOddsImportReviewSchema } from "@/application/queries/get-live-odds-import";

vi.mock("server-only", () => ({}));

const observedAt = "2026-08-27T22:56:18.649Z";

describe("live odds import review", () => {
  it("accepts Supabase timestamptz offsets and canonicalizes them", () => {
    const result = liveOddsImportReviewSchema.parse({
      importId: "10000000-0000-4000-8000-000000000001",
      source: "THE_ODDS_API",
      fetchedAt: "2026-08-27T22:56:18.649+00:00",
      importedAt: "2026-08-27T22:56:18.740389+00:00",
      eventCount: 1,
      payloadHash: "a".repeat(64),
      events: [
        {
          source: "THE_ODDS_API",
          externalEventId: "event-buf-nyj",
          sportKey: "americanfootball_nfl",
          awayTeam: "Buffalo Bills",
          homeTeam: "New York Jets",
          scheduledStartAt: "2026-09-13T17:00:00.000Z",
          markets: [
            ["MONEYLINE", "AWAY", null, -160],
            ["MONEYLINE", "HOME", null, 140],
            ["SPREAD", "AWAY", -3500, -108],
            ["SPREAD", "HOME", 3500, -112],
            ["TOTAL", "OVER", 44500, -105],
            ["TOTAL", "UNDER", 44500, -115],
          ].map(([marketType, outcomeKey, lineMilli, americanOdds]) => ({
            sourceBook: "draftkings",
            marketType,
            outcomeKey,
            proposition: `${marketType} ${outcomeKey}`,
            lineMilli,
            americanOdds,
            observedAt,
          })),
        },
      ],
    });

    expect(result.fetchedAt).toBe("2026-08-27T22:56:18.649Z");
    expect(result.importedAt).toBe("2026-08-27T22:56:18.740Z");
  });
});
