import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/adapters/supabase/config", () => ({
  isSupabaseConfigured: () => true,
}));
vi.mock("@/adapters/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getClaims: async () => ({ data: { claims: { sub: "fixture-member" } } }),
    },
    schema: () => ({ rpc: mocks.rpc }),
  }),
}));
import { getWeeklyCloseState } from "@/application/queries/get-weekly-close-state";
import { getCardReviewContext } from "@/application/queries/get-card-review-context";
import { queryFailure } from "@/application/queries/query-failure";

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

it.each(["57014", "53300", "55000"])(
  "an injected %s failure logs a distinct safe cause and keeps the existing message",
  async (code) => {
    mocks.rpc.mockResolvedValue({
      error: {
        code,
        message: "secret SQL private picks",
        details: "token=secret",
        hint: "private payload",
      },
    });
    const error = await getWeeklyCloseState("private-league").catch(
      (e: Error) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      code === "55000"
        ? "Season memory stopped because official competitive lineage is ambiguous."
        : "The active-season ledger could not be loaded.",
    );
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      "league_query_failed",
      {
        operation: "get_weekly_close_state",
        code,
        durationMs: expect.any(Number),
        correlationId: expect.any(String),
      },
    );
    const diagnostic = vi.mocked(console.error).mock.calls[0][1];
    expect((error as Error).cause).toEqual({
      correlationId: diagnostic.correlationId,
    });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(
      /secret|private-league|fixture-member|payload|picks/,
    );
  },
);
it("untrusted codes are not used as log labels or error causes", () => {
  const error = queryFailure(
    "get_stage1_state",
    performance.now(),
    { code: "secret\nSQL" },
    "The league could not be loaded.",
  );
  expect(console.error).toHaveBeenCalledWith(
    "league_query_failed",
    expect.objectContaining({ code: "UNCLASSIFIED" }),
  );
  expect(JSON.stringify(error.cause)).not.toContain("secret");
});
it.each(["42501", "P0002", "PGRST202"])(
  "expected ledger absence %s preserves its null path",
  async (code) => {
    mocks.rpc.mockResolvedValue({ error: { code } });
    expect(await getWeeklyCloseState("fixture")).toBeNull();
    expect(console.error).not.toHaveBeenCalled();
  },
);
it("review failure retains the narrow read and safe user message", async () => {
  mocks.rpc.mockResolvedValue({ error: { code: "XX000", message: "secret" } });
  await expect(getCardReviewContext("fixture")).rejects.toThrow(
    "Your card could not be loaded for review.",
  );
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(console.error).toHaveBeenCalledWith(
    "league_query_failed",
    expect.objectContaining({
      operation: "get_card_review_context",
      code: "XX000",
    }),
  );
});
