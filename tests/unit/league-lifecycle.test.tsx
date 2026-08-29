// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeagueSettings } from "@/components/commissioner/league-settings";
import { LeagueSetupForms } from "@/components/league/league-setup-forms";
import { createLeagueSlug, leagueSlugBase } from "@/domain/leagues/league-slug";

vi.mock("@/app/leagues/actions", () => ({
  createLeagueAction: vi.fn(),
  deleteLeagueAction: vi.fn(),
  joinLeagueAction: vi.fn(),
  leaveLeagueAction: vi.fn(),
  removeLeagueMemberAction: vi.fn(),
  renameLeagueAction: vi.fn(),
  setLeagueArchivedAction: vi.fn(),
  transferLeagueCommissionerAction: vi.fn(),
}));

afterEach(cleanup);

describe("league lifecycle experience", () => {
  it("creates stable automatic league URL slugs", () => {
    expect(leagueSlugBase("  Alex's Sunday League! ")).toBe(
      "alex-s-sunday-league",
    );
    expect(createLeagueSlug("Sunday League", "A1B2C3")).toBe(
      "sunday-league-a1b2c3",
    );
  });

  it("keeps league creation Live-only and generates the URL", () => {
    render(<LeagueSetupForms />);

    expect(screen.queryByLabelText("League type")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("League URL")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("League name")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create league" }));

    expect(screen.getByLabelText("League name")).toBeVisible();
    expect(screen.getByText(/live NFL season/i)).toBeVisible();
    expect(screen.getByText(/URL is generated automatically/i)).toBeVisible();
    expect(screen.queryByText("Practice season")).not.toBeInTheDocument();
  });

  it("offers guarded commissioner lifecycle controls", () => {
    render(
      <LeagueSettings
        archived={false}
        canDelete
        leagueName="Sunday League"
        leagueSlug="sunday-league-a1b2c3"
        lifecycle="DRAFT"
        members={[
          {
            displayName: "Alex",
            role: "COMMISSIONER",
            userId: "11111111-1111-4111-8111-111111111111",
          },
          {
            displayName: "Jordan",
            role: "MEMBER",
            userId: "22222222-2222-4222-8222-222222222222",
          },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: "Save name" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Archive league" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove Jordan" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Make Jordan commissioner" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Delete league permanently" }),
    ).toBeVisible();
  });

  it("preserves history when permanent deletion is not eligible", () => {
    render(
      <LeagueSettings
        archived={false}
        canDelete={false}
        leagueName="Active League"
        leagueSlug="active-league-a1b2c3"
        lifecycle="REGULAR"
        members={[]}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Delete league permanently" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText(/Archive this league/i).length).toBeGreaterThan(
      0,
    );
  });
});
