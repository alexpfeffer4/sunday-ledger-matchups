import { describe, expect, it } from "vitest";
import type { Stage1StateDto } from "@/application/queries/stage1-dtos";
import { restoreCardDrafts } from "@/components/card/card-draft-storage";

const slate: Stage1StateDto["slate"] = [
  {
    actualStartedAt: null,
    awayTeam: "BUF",
    homeTeam: "NYJ",
    id: "00000000-0000-4000-8000-000000000001",
    key: "buf-nyj",
    markets: [
      {
        americanOdds: -125,
        id: "00000000-0000-4000-8000-000000000002",
        lineMilli: null,
        marketType: "MONEYLINE",
        maximumStakeCredits: 1_000,
        observedAt: "2026-09-13T16:00:00.000Z",
        outcomeKey: "HOME",
        payloadHash: "b".repeat(64),
        proposition: "NYJ to win",
        qualityStatus: "HEALTHY",
      },
    ],
    providerHealth: "HEALTHY",
    scheduledStartAt: "2026-09-13T17:00:00.000Z",
    state: "SCHEDULED",
  },
];

describe("unfinished card persistence", () => {
  it("restores the current quote and requires review after its terms change", () => {
    const restored = restoreCardDrafts(
      JSON.stringify({
        version: 1,
        drafts: [
          {
            eventId: slate[0].id,
            marketType: "MONEYLINE",
            outcomeKey: "HOME",
            reviewedAmericanOdds: -110,
            reviewedPayloadHash: "a".repeat(64),
            reviewedProposition: "NYJ to win",
            stakeCredits: 500,
          },
        ],
      }),
      slate,
    );

    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({
      americanOdds: -125,
      marketSnapshotId: "00000000-0000-4000-8000-000000000002",
      payloadHash: "b".repeat(64),
      quoteReviewRequired: true,
      reviewedAmericanOdds: -110,
      stakeCredits: 500,
    });
  });

  it("ignores corrupt or unavailable saved selections", () => {
    expect(restoreCardDrafts("not-json", slate)).toEqual([]);
    expect(
      restoreCardDrafts(JSON.stringify({ version: 1, drafts: [] }), slate),
    ).toEqual([]);
  });
});
