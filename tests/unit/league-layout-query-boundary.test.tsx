// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fullSeasonSimulationSlug } from "@/adapters/simulation/full-season";
import { simulationLeagueSlug } from "@/adapters/simulation/poc-week-six";

const queryMocks = vi.hoisted(() => ({
  getLiveStage1League: vi.fn(),
  getSimulationSeasonArchive: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
}));
vi.mock("@/application/queries/get-live-stage1-league", () => ({
  getLiveStage1League: queryMocks.getLiveStage1League,
}));
vi.mock("@/application/queries/get-simulation-season-archive", () => ({
  getSimulationSeasonArchive: queryMocks.getSimulationSeasonArchive,
}));
vi.mock("@/components/league/league-shell", () => ({
  LeagueShell: ({
    children,
    leagueName,
  }: {
    children: ReactNode;
    leagueName: string;
  }) => (
    <section>
      <h1>{leagueName}</h1>
      {children}
    </section>
  ),
}));

import LeagueLayout from "@/app/l/[leagueSlug]/layout";

describe("league layout query boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Week 6 Example without member RPCs", async () => {
    const layout = await LeagueLayout({
      children: <p>Example content</p>,
      params: Promise.resolve({ leagueSlug: simulationLeagueSlug }),
    });

    render(layout);

    expect(screen.getByText("Sample League")).toBeVisible();
    expect(screen.getByText("Example content")).toBeVisible();
    expect(queryMocks.getLiveStage1League).not.toHaveBeenCalled();
    expect(queryMocks.getSimulationSeasonArchive).not.toHaveBeenCalled();
  });

  it("loads only the bundled archive for the full-season Example", async () => {
    queryMocks.getSimulationSeasonArchive.mockResolvedValueOnce({
      members: [{ entryId: "viewer", displayName: "Pfeff" }],
      viewerEntryId: "viewer",
      mode: "SIMULATION",
      nflYear: 2026,
    });

    const layout = await LeagueLayout({
      children: <p>Archive content</p>,
      params: Promise.resolve({ leagueSlug: fullSeasonSimulationSlug }),
    });

    render(layout);

    expect(screen.getByText("Sample Season")).toBeVisible();
    expect(queryMocks.getLiveStage1League).not.toHaveBeenCalled();
    expect(queryMocks.getSimulationSeasonArchive).toHaveBeenCalledOnce();
    expect(queryMocks.getSimulationSeasonArchive).toHaveBeenCalledWith(
      fullSeasonSimulationSlug,
    );
  });

  it("retains persisted lookups for a member league", async () => {
    queryMocks.getLiveStage1League.mockResolvedValueOnce({
      league: {
        name: "Member League",
        nflYear: 2026,
        mode: "LIVE",
        role: "MEMBER",
        lifecycle: "REGULAR_SEASON",
      },
      week: { nflWeek: 6 },
      viewer: { displayName: "Member" },
      ownerCard: null,
    });
    queryMocks.getSimulationSeasonArchive.mockResolvedValueOnce(null);

    const layout = await LeagueLayout({
      children: <p>Member content</p>,
      params: Promise.resolve({ leagueSlug: "member-league" }),
    });

    render(layout);

    expect(screen.getByText("Member League")).toBeVisible();
    expect(queryMocks.getLiveStage1League).toHaveBeenCalledWith(
      "member-league",
    );
    expect(queryMocks.getSimulationSeasonArchive).toHaveBeenCalledWith(
      "member-league",
    );
  });
});
