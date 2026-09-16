import { beforeEach, expect, it, vi } from "vitest";
import { frozenCardRulesFixture } from "../fixtures/card-rules";
import { pocSeason13Ruleset } from "@/rulesets/poc-season-1-3";

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  refresh: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/application/queries/get-card-review-context", () => ({
  getCardReviewContext: mocks.context,
}));
vi.mock("@/adapters/providers/the-odds-api/refresh-card-quotes", () => ({
  refreshCardQuotes: mocks.refresh,
}));
vi.mock("@/adapters/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    schema: () => ({ rpc: mocks.rpc }),
  }),
}));
import { reviewLiveCardQuotes } from "@/app/l/[leagueSlug]/card-quote-actions";

const positions = [
  {
    marketSnapshotId: "00000000-0000-4000-8000-000000000001",
    payloadHash: "a".repeat(64),
    stakeCredits: 50,
  },
];
function context() {
  return {
    league: { id: "00000000-0000-4000-8000-000000000002", mode: "LIVE" },
    season: {
      rulesetSnapshot: frozenCardRulesFixture("LIVE", pocSeason13Ruleset),
    },
    week: { state: "OPEN", entryClosed: false },
    ownerCard: {
      positionCount: 1,
      allocatedCredits: 50,
      remainingCredits: 950,
    },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue(context());
});
it.each([
  "closed",
  "full",
  "over-credits",
  "over-positions",
  "below-minimum",
  "unauthorized",
  "bad-rules",
])("%s fails before paid acquisition", async (kind) => {
  const state = context();
  const batch = structuredClone(positions);
  if (kind === "closed") state.week.entryClosed = true;
  if (kind === "full") state.ownerCard.remainingCredits = 0;
  if (kind === "over-credits") state.ownerCard.allocatedCredits = 975;
  if (kind === "over-positions") state.ownerCard.positionCount = 20;
  if (kind === "below-minimum") batch[0]!.stakeCredits = 49;
  mocks.context.mockResolvedValue(
    kind === "unauthorized"
      ? null
      : kind === "bad-rules"
        ? { ...state, season: { rulesetSnapshot: null } }
        : state,
  );
  expect((await reviewLiveCardQuotes("sunday-ledger", batch)).status).toBe(
    "error",
  );
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("a valid preflight still requests authoritative review after acquisition", async () => {
  mocks.refresh.mockResolvedValue("CACHED");
  mocks.rpc.mockResolvedValue({ error: { message: "QUOTE_CHANGED" } });
  const result = await reviewLiveCardQuotes("sunday-ledger", positions);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("review_live_card_quotes", {
    p_league_slug: "sunday-ledger",
    p_positions: positions,
  });
  expect(result).toMatchObject({
    status: "error",
    message: expect.stringContaining("Odds changed"),
  });
});
