import { beforeEach, describe, expect, it, vi } from "vitest";
import { exampleSeasonSlug } from "@/adapters/example/example-season";

const queryMocks = vi.hoisted(() => ({
  getAuthoritativeLeagueState: vi.fn(),
  getSeasonRuleset: vi.fn(),
  getSeasonArchive: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/application/queries/get-live-stage1-league", () => ({
  getAuthoritativeLeagueState: queryMocks.getAuthoritativeLeagueState,
}));
vi.mock("@/application/queries/get-season-ruleset", () => ({
  getSeasonRuleset: queryMocks.getSeasonRuleset,
}));
vi.mock("@/application/queries/get-season-archive", () => ({
  getSeasonArchive: queryMocks.getSeasonArchive,
}));

import { getRulesAndStandingsContext } from "@/application/queries/get-rules-and-standings-context";

describe("Rules and Standings query boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads only the bundled archive for the Example Season", async () => {
    const archive = { season: { id: "example" } };
    queryMocks.getSeasonArchive.mockResolvedValueOnce(archive);

    const context = await getRulesAndStandingsContext(exampleSeasonSlug);

    expect(context.isExample).toBe(true);
    expect(context.archive).toBe(archive);
    expect(queryMocks.getAuthoritativeLeagueState).not.toHaveBeenCalled();
    expect(queryMocks.getSeasonRuleset).not.toHaveBeenCalled();
    expect(queryMocks.getSeasonArchive).toHaveBeenCalledOnce();
  });

  it("loads all persisted sources for a member league", async () => {
    queryMocks.getAuthoritativeLeagueState.mockResolvedValueOnce(null);
    queryMocks.getSeasonArchive.mockResolvedValueOnce(null);
    queryMocks.getSeasonRuleset.mockResolvedValueOnce(null);

    const context = await getRulesAndStandingsContext("member-league");

    expect(context.isExample).toBe(false);
    expect(queryMocks.getAuthoritativeLeagueState).toHaveBeenCalledWith(
      "member-league",
    );
    expect(queryMocks.getSeasonArchive).toHaveBeenCalledWith("member-league");
    expect(queryMocks.getSeasonRuleset).toHaveBeenCalledWith("member-league");
  });
});
