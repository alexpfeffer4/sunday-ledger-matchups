// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { exampleSeasonSlug } from "@/adapters/example/example-season";

const queryMocks = vi.hoisted(() => ({
  getAuthoritativeLeagueState: vi.fn(),
  getSeasonArchive: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
}));
vi.mock("@/application/queries/get-live-stage1-league", () => ({
  getAuthoritativeLeagueState: queryMocks.getAuthoritativeLeagueState,
}));
vi.mock("@/application/queries/get-season-archive", () => ({
  getSeasonArchive: queryMocks.getSeasonArchive,
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

  it("loads only the bundled archive for the Example Season", async () => {
    queryMocks.getSeasonArchive.mockResolvedValueOnce({
      members: [{ entryId: "viewer", displayName: "North Club" }],
      viewerEntryId: "viewer",
      mode: "SIMULATION",
      nflYear: 2026,
    });

    const layout = await LeagueLayout({
      children: <p>Archive content</p>,
      params: Promise.resolve({ leagueSlug: exampleSeasonSlug }),
    });

    render(layout);

    expect(screen.getByText("Example Season")).toBeVisible();
    expect(queryMocks.getAuthoritativeLeagueState).not.toHaveBeenCalled();
    expect(queryMocks.getSeasonArchive).toHaveBeenCalledOnce();
    expect(queryMocks.getSeasonArchive).toHaveBeenCalledWith(exampleSeasonSlug);
  });

  it("retains persisted lookups for a member league", async () => {
    queryMocks.getAuthoritativeLeagueState.mockResolvedValueOnce({
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
    queryMocks.getSeasonArchive.mockResolvedValueOnce(null);

    const layout = await LeagueLayout({
      children: <p>Member content</p>,
      params: Promise.resolve({ leagueSlug: "member-league" }),
    });

    render(layout);

    expect(screen.getByText("Member League")).toBeVisible();
    expect(queryMocks.getAuthoritativeLeagueState).toHaveBeenCalledWith(
      "member-league",
    );
    expect(queryMocks.getSeasonArchive).toHaveBeenCalledWith("member-league");
  });
});
