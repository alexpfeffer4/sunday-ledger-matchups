import { afterEach, expect, it, vi } from "vitest";
import { importLiveScoresAction } from "@/app/l/[leagueSlug]/actions";
import { makePhase6State } from "../fixtures/phase6-paired-matchup";
import { initialAppActionState } from "@/application/actions/action-state";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  league: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/adapters/providers/the-odds-api/provider-requests", () => ({
  refreshLiveScores: mocks.refresh,
}));
vi.mock("@/application/queries/get-live-stage1-league", () => ({
  getAuthoritativeLeagueState: mocks.league,
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function form() {
  const { state } = makePhase6State("LOCKED");
  state.commissioner.isCommissioner = true;
  state.league.mode = "LIVE";
  state.week!.state = "LOCKED";
  mocks.league.mockResolvedValue(state);
  const data = new FormData();
  data.set("leagueId", state.league.id);
  data.set("leagueSlug", state.league.slug);
  return data;
}
it.each([
  ["BUSY", "already running", "error"],
  ["FAILED", "No game updates could be verified", "error"],
  ["DISABLED", "disabled", "error"],
  ["IDLE", "No eligible games", "success"],
  ["PARTIAL", "some games are still unavailable", "success"],
  ["SUCCEEDED", "3 NFL game updates captured", "success"],
])(
  "preserves the specific %s explanation through the real action",
  async (status, message, expectedStatus) => {
    mocks.refresh.mockResolvedValue({ status, eventCount: 3 });
    const result = await importLiveScoresAction(initialAppActionState, form());
    expect(result.status).toBe(expectedStatus);
    expect(result.message).toContain(message);
    expect(result.message).not.toContain("No safe change");
    expect(mocks.revalidate).toHaveBeenCalled();
  },
);
it("explains the shared request budget without exposing an internal exception", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.refresh.mockRejectedValue(new Error("QUOTE_REFRESH_BUDGET"));
  expect(
    (await importLiveScoresAction(initialAppActionState, form())).message,
  ).toContain("request limit has been reached");
  expect(mocks.revalidate).toHaveBeenCalled();
});
it("rejects members before any provider request", async () => {
  const data = form();
  const { state } = makePhase6State("LOCKED");
  state.commissioner.isCommissioner = false;
  mocks.league.mockResolvedValue(state);
  expect(
    (await importLiveScoresAction(initialAppActionState, data)).status,
  ).toBe("error");
  expect(mocks.refresh).not.toHaveBeenCalled();
});

it.each([
  ["EVENT_IDENTITY_CHANGED", "differ from the published slate"],
  ["INVALID_SCORE_EVIDENCE", "update times could not be verified"],
  ["DATABASE_23502", "Score processing failed on the server"],
])(
  "shows the verified %s category without exposing database details",
  async (code, message) => {
    mocks.refresh.mockResolvedValue({
      status: "FAILED",
      eventCount: 0,
      failureCodes: [code],
    });
    const result = await importLiveScoresAction(initialAppActionState, form());
    expect(result.message).toContain(message);
    expect(result.message).not.toContain(code);
  },
);
