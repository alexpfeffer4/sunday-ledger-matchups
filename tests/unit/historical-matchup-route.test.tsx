// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { historicalFixture } from "../fixtures/historical-matchup";

const queries = vi.hoisted(() => ({
  live: vi.fn(),
  current: vi.fn(),
  archive: vi.fn(),
  history: vi.fn(),
  cards: vi.fn(),
  operations: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
}));
vi.mock("@/application/queries/get-live-stage1-league", () => ({
  getLeagueState: queries.live,
  getAuthoritativeLeagueState: queries.current,
}));
vi.mock("@/application/queries/get-season-archive", () => ({
  getSeasonArchive: queries.archive,
}));
vi.mock("@/application/queries/get-weekly-close-state", () => ({
  getWeeklyCloseState: queries.history,
}));
vi.mock("@/application/queries/get-league-matchup-cards", () => ({
  getLeagueMatchupCards: queries.cards,
}));
vi.mock("@/application/queries/get-live-week-operations", () => ({
  getLiveWeekOperations: queries.operations,
}));
import MatchupPage from "@/app/l/[leagueSlug]/matchup/page";

afterEach(cleanup);
beforeEach(() => vi.resetAllMocks());
function page(query: {
  week?: string | string[];
  matchup?: string | string[];
}) {
  return MatchupPage({
    params: Promise.resolve({ leagueSlug: "sunday-ledger" }),
    searchParams: Promise.resolve(query),
  });
}
describe("historical matchup route", () => {
  it("loads the requested final week even when the league is archived", async () => {
    const { history, cards } = historicalFixture();
    history.league.lifecycle = "FINAL";
    queries.history.mockResolvedValue(history);
    queries.cards.mockResolvedValue(cards);
    queries.live.mockResolvedValue(null);
    queries.archive.mockResolvedValue({ archiveId: "archive-present" });
    render(await page({ week: "1" }));
    expect(
      screen.getByRole("heading", { name: "Week 1 matchup" }),
    ).toBeVisible();
    expect(queries.cards).toHaveBeenCalledWith("sunday-ledger", cards.weekId);
    expect(queries.operations).not.toHaveBeenCalled();
    expect(queries.current).not.toHaveBeenCalled();
  });
  it.each(["0", "19", "-1", "1.5", "01", "1oops", ["1", "2"]])(
    "rejects invalid or repeated week parameter %s",
    async (week) => {
      await expect(page({ week })).rejects.toThrow("not found");
      expect(queries.cards).not.toHaveBeenCalled();
    },
  );
  it("rejects a matchup from another week before requesting cards", async () => {
    const { history } = historicalFixture();
    queries.history.mockResolvedValue(history);
    await expect(
      page({ week: "1", matchup: history.matchups[0]!.id }),
    ).rejects.toThrow("not found");
    expect(queries.cards).not.toHaveBeenCalled();
  });
  it("does not turn missing card evidence into an empty matchup or an invented zero", async () => {
    const { history } = historicalFixture();
    queries.history.mockResolvedValue(history);
    queries.cards.mockResolvedValue(null);
    await expect(page({ week: "1" })).rejects.toThrow(
      "Historical bets could not be loaded",
    );
  });
});
