import { beforeEach, expect, it, vi } from "vitest";
import { makePhase6State } from "../fixtures/phase6-paired-matchup";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  claims: vi.fn(),
  base: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/adapters/supabase/config", () => ({
  isSupabaseConfigured: () => true,
}));
vi.mock("@/adapters/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: mocks.claims },
    schema: () => ({ rpc: mocks.rpc }),
  }),
}));
vi.mock("@/application/queries/get-live-stage1-league", () => ({
  getLeagueState: mocks.base,
}));
import { getCardReviewContext } from "@/application/queries/get-card-review-context";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.claims.mockResolvedValue({ data: { claims: { sub: "member" } } });
});
it("old database fallback projects only the same preflight fields", async () => {
  const { state } = makePhase6State("PREGAME");
  mocks.base.mockResolvedValue(state);
  mocks.rpc.mockResolvedValue({ error: { code: "PGRST202" } });
  const result = await getCardReviewContext("sunday-ledger");
  expect(result?.ownerCard).toEqual({
    positionCount: state.ownerCard!.positions.length,
    remainingCredits: state.ownerCard!.remainingCredits,
    allocatedCredits: state.ownerCard!.allocatedCredits,
  });
  expect(Object.keys(result!)).toEqual([
    "league",
    "season",
    "week",
    "ownerCard",
  ]);
  expect(result!.week).toEqual({ state: "OPEN", entryClosed: false });
  expect(result!.league).toEqual({
    id: state.league.id,
    mode: state.league.mode,
  });
});
it.each(["42501", "28000", "P0002"])(
  "%s does not fall back around access control",
  async (code) => {
    mocks.rpc.mockResolvedValue({ error: { code } });
    expect(await getCardReviewContext("other-league")).toBeNull();
    expect(mocks.base).not.toHaveBeenCalled();
  },
);
it("unexpected database errors do not silently broaden the read", async () => {
  mocks.rpc.mockResolvedValue({
    error: { code: "XX000", message: "private SQL" },
  });
  await expect(getCardReviewContext("sunday-ledger")).rejects.toThrow(
    "Your card could not be loaded for review.",
  );
  expect(mocks.base).not.toHaveBeenCalled();
});
