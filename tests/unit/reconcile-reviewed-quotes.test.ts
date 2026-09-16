import { describe, expect, it } from "vitest";
import { makePhase6State } from "../fixtures/phase6-paired-matchup";
import { restoreCardDrafts } from "@/components/card/card-draft-storage";
import { reconcileReviewedQuotes } from "@/components/card/reconcile-reviewed-quotes";

function fixture() {
  const { state } = makePhase6State("PREGAME");
  const slate = structuredClone(state.slate);
  const event = slate[0];
  const market = {
    id: "10000000-0000-4000-8000-000000000010",
    marketType: "MONEYLINE" as const,
    outcomeKey: "HOME" as const,
    proposition: "Home to win",
    lineMilli: null as number | null,
    americanOdds: -110,
    qualityStatus: "HEALTHY" as const,
    observedAt: "2026-09-13T16:00:00.000Z",
    payloadHash: "a".repeat(64),
    maximumStakeCredits: 1000,
  };
  event.markets = [market, { ...market, id: "away", outcomeKey: "AWAY" }];
  const drafts = restoreCardDrafts(
    JSON.stringify({
      version: 1,
      drafts: [
        {
          eventId: event.id,
          ...market,
          marketSnapshotId: market.id,
          reviewedAmericanOdds: market.americanOdds,
          reviewedLineMilli: market.lineMilli,
          reviewedPayloadHash: market.payloadHash,
          reviewedProposition: market.proposition,
          stakeCredits: 750,
        },
      ],
    }),
    slate,
  );
  return { slate, event, market, drafts };
}

describe("partial reviewed quotes", () => {
  it("replaces only the covered outcome, preserves uncovered events/markets and inputs", () => {
    const { slate, event, market, drafts } = fixture();
    const before = structuredClone({ slate, drafts });
    const fresh: (typeof event.markets)[number] = {
      ...market,
      id: "fresh-snapshot",
      payloadHash: "fresh-hash",
    };
    const result = reconcileReviewedQuotes(slate, drafts, [
      { eventId: event.id, markets: [fresh] },
    ]);
    expect({ slate, drafts }).toEqual(before);
    expect(result.slate[0].markets).toEqual([...event.markets.slice(1), fresh]);
    expect(result.slate.slice(1)).toEqual(slate.slice(1));
    expect(result.drafts[0]).toMatchObject({
      marketSnapshotId: fresh.id,
      stakeCredits: 750,
      quoteReviewRequired: false,
      reviewedPayloadHash: fresh.payloadHash,
    });
    expect(result.allDraftsRetained).toBe(true);
  });
  it.each(["improved", "worsened", "line", "suspended"])(
    "%s retains the amount and prior economic consent",
    (change) => {
      const { slate, event, market, drafts } = fixture();
      const fresh: (typeof event.markets)[number] = {
        ...market,
        id: "fresh-snapshot",
        payloadHash: "fresh-hash",
      };
      if (change === "improved") fresh.americanOdds = 200;
      if (change === "worsened") fresh.americanOdds = -300;
      if (change === "line") fresh.lineMilli = (market.lineMilli ?? 0) + 1000;
      if (change === "suspended") fresh.qualityStatus = "SUSPENDED";
      const result = reconcileReviewedQuotes(slate, drafts, [
        { eventId: event.id, markets: [fresh] },
      ]);
      expect(result.drafts[0]).toMatchObject({
        stakeCredits: 750,
        quoteReviewRequired: true,
        reviewedAmericanOdds: market.americanOdds,
        reviewedLineMilli: market.lineMilli,
        reviewedPayloadHash: market.payloadHash,
      });
    },
  );
  it("empty partial coverage does not remove outcomes; absent selections stay recoverable", () => {
    const { slate, event, drafts } = fixture();
    expect(
      reconcileReviewedQuotes(slate, drafts, [
        { eventId: event.id, markets: [] },
      ]).slate,
    ).toEqual(slate);
    const missing = reconcileReviewedQuotes([], drafts, []);
    expect(missing.drafts[0]).toMatchObject({
      stakeCredits: 750,
      quoteReviewRequired: true,
    });
    expect(missing.allDraftsRetained).toBe(true);
  });
  it("does not match a different player or the opposite outcome", () => {
    const { slate, event, market, drafts } = fixture();
    const other = {
      ...market,
      id: "other",
      outcomeKey:
        market.outcomeKey === "HOME" ? ("AWAY" as const) : ("HOME" as const),
    };
    const result = reconcileReviewedQuotes(slate, drafts, [
      { eventId: event.id, markets: [other] },
    ]);
    expect(result.slate[0].markets).toContainEqual(market);
    const prop = {
      ...market,
      id: "prop",
      marketType: "PLAYER_PASSING_YARDS" as const,
      subjectId: "10000000-0000-4000-8000-000000000001",
      statistic: "PASSING_YARDS" as const,
      period: "FULL_GAME" as const,
      outcomeKey: "OVER" as const,
    };
    const propSlate = [{ ...event, markets: [prop] }];
    const next = reconcileReviewedQuotes(
      propSlate,
      [],
      [
        {
          eventId: event.id,
          markets: [
            {
              ...prop,
              id: "other-player",
              subjectId: "10000000-0000-4000-8000-000000000002",
            },
          ],
        },
      ],
    );
    expect(next.slate[0].markets).toContainEqual(prop);
    expect(next.slate[0].markets).toHaveLength(2);
  });
});
