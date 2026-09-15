import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/adapters/providers/the-odds-api/refresh-card-quotes", () => ({
  refreshCardQuotes: refresh,
}));
import { submitCardIntent } from "@/application/actions/submit-card-intent";

const id = "d0000000-0000-4000-8000-000000000001";
const snapshot = "d0000000-0000-4000-8000-000000000002";
const reviewId = "d0000000-0000-4000-8000-000000000003";
const input = {
  leagueSlug: "intent-test",
  submissionId: id,
  positions: [
    {
      marketSnapshotId: snapshot,
      payloadHash: "a".repeat(64),
      stakeCredits: 300,
      reviewId,
    },
  ],
};
const binding = {
  intentId: id,
  leagueId: id,
  mode: "LIVE",
  operationKey: `intent:${id}`,
  committed: false,
};
const review = {
  reviewId,
  reviewedAt: "2026-09-14T16:00:00Z",
  expiresAt: "2026-09-14T16:00:30Z",
  fetchedAt: "2026-09-14T16:00:00Z",
  quotes: [],
};
function client(
  responses: Array<{ data?: unknown; error?: { message: string } | null }>,
) {
  const rpc = vi.fn();
  for (const response of responses)
    rpc.mockResolvedValueOnce({ data: null, error: null, ...response });
  const value = { schema: vi.fn(() => ({ rpc })) } as unknown as Parameters<
    typeof submitCardIntent
  >[0];
  return { value, rpc };
}
beforeEach(() => {
  refresh.mockReset();
  refresh.mockResolvedValue("REFRESHED");
});

describe("explicit Submit consent orchestration", () => {
  it("shows an already sealed legacy card from another device without accepting new terms or fetching", async () => {
    const c = client([{ data: { ...binding, cardSealed: true } }]);
    expect(await submitCardIntent(c.value, input)).toEqual({
      status: "already-sealed",
    });
    expect(c.rpc).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });
  it("recovers a legacy card sealed on another device during the first attempt", async () => {
    const c = client([
      { data: binding },
      { error: { message: "The card has already been sealed." } },
      { data: { ...binding, cardSealed: true } },
    ]);
    expect(await submitCardIntent(c.value, input)).toEqual({
      status: "already-sealed",
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(
      c.rpc.mock.calls.filter(([name]) => name === "accept_stage1_card"),
    ).toHaveLength(1);
  });
  it("recovers a committed intent before quote freshness or provider work", async () => {
    const c = client([{ data: { ...binding, committed: true } }]);
    expect(await submitCardIntent(c.value, input)).toEqual({
      status: "accepted",
      replayed: true,
    });
    expect(c.rpc.mock.calls.map(([name]) => name)).toEqual([
      "bind_card_submission_intent",
    ]);
    expect(refresh).not.toHaveBeenCalled();
  });
  it("renews expired proof once and accepts identical economics in the same call", async () => {
    const newPositions = [
      {
        ...input.positions[0],
        marketSnapshotId: "d0000000-0000-4000-8000-000000000004",
        intentId: id,
      },
    ];
    const c = client([
      { data: binding },
      { error: { message: "QUOTE_REVIEW_EXPIRED" } },
      { data: binding },
      { data: review },
      { data: { status: "UNCHANGED", positions: newPositions } },
      { data: { receipts: [id] } },
    ]);
    expect(await submitCardIntent(c.value, input)).toEqual({
      status: "accepted",
      replayed: false,
    });
    expect(refresh).toHaveBeenCalledExactlyOnceWith(id, input.positions);
    expect(c.rpc.mock.calls.at(-1)).toEqual([
      "accept_stage1_card",
      {
        p_league_slug: input.leagueSlug,
        p_positions: newPositions,
        p_idempotency_key: `intent:${id}`,
      },
    ]);
  });
  it("returns precise favorable changes without accepting their new terms", async () => {
    const changes = [
      {
        selectionKey: "event:player:stat",
        label: "Player",
        before: { lineMilli: 250500, americanOdds: -110 },
        after: { lineMilli: 250500, americanOdds: 110 },
      },
    ];
    const c = client([
      { data: binding },
      { error: { message: "QUOTE_CHANGED" } },
      { data: binding },
      { data: review },
      { data: { status: "CHANGED", changes } },
    ]);
    expect(await submitCardIntent(c.value, input)).toEqual({
      status: "changed",
      quoteReview: review,
      quoteChanges: changes,
    });
    expect(
      c.rpc.mock.calls.filter(([name]) => name === "accept_stage1_card"),
    ).toHaveLength(1);
  });
  it("recovers a timeout after commit without any provider request", async () => {
    const c = client([
      { data: binding },
      { error: { message: "Response timeout" } },
      { data: { ...binding, committed: true } },
    ]);
    expect(await submitCardIntent(c.value, input)).toEqual({
      status: "accepted",
      replayed: true,
    });
    expect(refresh).not.toHaveBeenCalled();
  });
  it("returns a cutoff race after renewal without another fetch or submission loop", async () => {
    const c = client([
      { data: binding },
      { error: { message: "QUOTE_REVIEW_EXPIRED" } },
      { data: binding },
      { data: review },
      { data: { status: "UNCHANGED", positions: input.positions } },
      { error: { message: "This game is closed for new bets." } },
      { data: binding },
    ]);
    expect(await submitCardIntent(c.value, input)).toEqual({
      status: "error",
      code: "This game is closed for new bets.",
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(
      c.rpc.mock.calls.filter(([name]) => name === "accept_stage1_card"),
    ).toHaveLength(2);
  });
  it("does no quote work after access revocation or a same-key changed request", async () => {
    for (const message of [
      "League membership required.",
      "Idempotency key was reused with a different request.",
    ]) {
      const c = client([{ error: { message } }]);
      expect(await submitCardIntent(c.value, input)).toEqual({
        status: "error",
        code: message,
      });
      expect(c.rpc).toHaveBeenCalledTimes(1);
    }
    expect(refresh).not.toHaveBeenCalled();
  });
});
