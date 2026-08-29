// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeagueSettings } from "@/components/commissioner/league-settings";
import { LeagueListActions } from "@/components/league/league-list-actions";
import { AuditDetails } from "@/components/ui/audit-details";

vi.mock("@/app/leagues/actions", () => ({
  deleteLeagueAction: vi.fn(),
  leaveLeagueAction: vi.fn(),
  removeLeagueMemberAction: vi.fn(),
  renameLeagueAction: vi.fn(),
  setLeagueArchivedAction: vi.fn(),
  transferLeagueCommissionerAction: vi.fn(),
}));

afterEach(cleanup);

function settings() {
  return (
    <LeagueSettings
      archived={false}
      canDelete
      leagueName="Sunday League"
      leagueSlug="sunday-league"
      lifecycle="DRAFT"
      members={[
        {
          displayName: "Alex",
          role: "COMMISSIONER",
          userId: "commissioner-id",
        },
        { displayName: "Jordan", role: "MEMBER", userId: "member-id" },
      ]}
    />
  );
}

describe("Phase 5 safety and trust presentation", () => {
  it("names removal impact, reversibility, and destination before submission", () => {
    render(settings());

    const trigger = screen.getByRole("button", { name: "Remove Jordan" });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", {
      name: "Remove Jordan from Sunday League?",
    });
    expect(within(dialog).getByText("Jordan in Sunday League")).toBeVisible();
    expect(within(dialog).getByText(/immediately lose access/)).toBeVisible();
    expect(within(dialog).getByText(/There is no undo button/)).toBeVisible();
    expect(
      within(dialog).getByText(/stay on the Commissioner page/),
    ).toBeVisible();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Keep things as they are" }),
    );
    expect(trigger).toHaveFocus();
  });

  it("makes commissioner transfer consequences and actual reversal authority explicit", () => {
    render(settings());

    fireEvent.click(
      screen.getByRole("button", { name: "Make Jordan commissioner" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Make Jordan commissioner of Sunday League?",
    });

    expect(within(dialog).getByText(/remain a member/)).toBeVisible();
    expect(within(dialog).getByText(/Only Jordan can transfer/)).toBeVisible();
    expect(within(dialog).getByText(/matchup page/)).toBeVisible();
  });

  it("names the leave target and pre-lock re-entry behavior", () => {
    render(
      <LeagueListActions
        archived={false}
        leagueName="Sunday League"
        lifecycle="DRAFT"
        role="MEMBER"
        slug="sunday-league"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Leave league" }));
    const dialog = screen.getByRole("dialog", {
      name: "Leave Sunday League?",
    });

    expect(within(dialog).getByText("Sunday League")).toBeVisible();
    expect(within(dialog).getByText(/valid invitation/)).toBeVisible();
    expect(within(dialog).getByText(/Return to Your leagues/i)).toBeVisible();
  });

  it("keeps archive visibly reversible and separate from permanent deletion", () => {
    render(settings());

    expect(screen.getByText("Archive, don’t delete")).toBeVisible();
    expect(screen.getByText(/can be restored at any time/)).toBeVisible();
    expect(screen.getByText(/It cannot be undone/)).toBeVisible();
  });

  it("uses one human-first audit disclosure label", () => {
    render(
      <AuditDetails context="This explains what the evidence verifies.">
        <p>sha256-value</p>
      </AuditDetails>,
    );

    const details = screen.getByText("Audit details").closest("details");
    expect(details).not.toBeNull();
    expect(
      within(details as HTMLElement).getByText(
        "This explains what the evidence verifies.",
      ),
    ).toBeInTheDocument();
    expect(
      within(details as HTMLElement).getByText("sha256-value"),
    ).toBeInTheDocument();
  });
});
