import { beforeEach, describe, expect, it, vi } from "vitest";
import { fullSeasonSimulationSlug } from "@/adapters/simulation/full-season";
import { simulationLeagueSlug } from "@/adapters/simulation/poc-week-six";

const queryMocks = vi.hoisted(() => ({
  getLiveStage1League: vi.fn(),
  getSeasonRuleset: vi.fn(),
  getSimulationSeasonArchive: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/application/queries/get-live-stage1-league", () => ({
  getLiveStage1League: queryMocks.getLiveStage1League,
}));
vi.mock("@/application/queries/get-season-ruleset", () => ({
  getSeasonRuleset: queryMocks.getSeasonRuleset,
}));
vi.mock("@/application/queries/get-simulation-season-archive", () => ({
  getSimulationSeasonArchive: queryMocks.getSimulationSeasonArchive,
}));

import { getRulesAndStandingsContext } from "@/application/queries/get-rules-and-standings-context";

describe("Rules and Standings query boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not query member-only RPCs for the Week 6 Example", async () => {
    const context = await getRulesAndStandingsContext(simulationLeagueSlug);

    expect(context.isExample).toBe(true);
    expect(context.exampleLeague).not.toBeNull();
    expect(queryMocks.getLiveStage1League).not.toHaveBeenCalled();
    expect(queryMocks.getSeasonRuleset).not.toHaveBeenCalled();
    expect(queryMocks.getSimulationSeasonArchive).not.toHaveBeenCalled();
  });

  it("loads only the bundled archive for the full-season Example", async () => {
    const archive = { season: { id: "example" } };
    queryMocks.getSimulationSeasonArchive.mockResolvedValueOnce(archive);

    const context = await getRulesAndStandingsContext(fullSeasonSimulationSlug);

    expect(context.isExample).toBe(true);
    expect(context.archive).toBe(archive);
    expect(queryMocks.getLiveStage1League).not.toHaveBeenCalled();
    expect(queryMocks.getSeasonRuleset).not.toHaveBeenCalled();
    expect(queryMocks.getSimulationSeasonArchive).toHaveBeenCalledOnce();
  });

  it("loads all persisted sources for a member league", async () => {
    queryMocks.getLiveStage1League.mockResolvedValueOnce(null);
    queryMocks.getSimulationSeasonArchive.mockResolvedValueOnce(null);
    queryMocks.getSeasonRuleset.mockResolvedValueOnce(null);

    const context = await getRulesAndStandingsContext("member-league");

    expect(context.isExample).toBe(false);
    expect(queryMocks.getLiveStage1League).toHaveBeenCalledWith(
      "member-league",
    );
    expect(queryMocks.getSimulationSeasonArchive).toHaveBeenCalledWith(
      "member-league",
    );
    expect(queryMocks.getSeasonRuleset).toHaveBeenCalledWith("member-league");
  });
});
