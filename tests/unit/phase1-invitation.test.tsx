// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Stage1CommissionerControls } from "@/components/commissioner/stage1-controls";
import {
  InvitePreviewPanel,
  InviteUnavailable,
} from "@/components/league/invite-preview";

vi.mock("@/app/leagues/actions", () => ({
  joinLeagueAction: vi.fn(),
}));

vi.mock("@/app/l/[leagueSlug]/actions", () => ({
  advanceStage1ClockAction: vi.fn(),
  correctStage1ResultAction: vi.fn(),
  createLeagueInviteAction: vi.fn(),
  finalizeStage1WeekAction: vi.fn(),
  importLiveOddsAction: vi.fn(),
  initializeStage1WeekAction: vi.fn(),
  lockLiveRosterAndOpenWeekAction: vi.fn(),
  lockStage1WeekAction: vi.fn(),
  publishLiveWeekSlateAction: vi.fn(),
  publishSimulationSeasonArchiveAction: vi.fn(),
  recordStage1ResultAction: vi.fn(),
  refreshLiveWeekQuotesAction: vi.fn(),
  revokeLeagueInviteAction: vi.fn(),
  setStage1EventLiveAction: vi.fn(),
}));

afterEach(cleanup);

const preview = {
  commissioner_name: "Alex",
  expires_at: "2026-09-01T17:00:00.000Z",
  league_name: "Sunday Friends",
  member_count: 3,
  mode: "LIVE" as const,
  nfl_year: 2026,
};

const members = [
  {
    displayName: "Alex",
    role: "COMMISSIONER" as const,
    userId: "11111111-1111-4111-8111-111111111111",
  },
  {
    displayName: "Jordan",
    role: "MEMBER" as const,
    userId: "22222222-2222-4222-8222-222222222222",
  },
  {
    displayName: "Mia",
    role: "MEMBER" as const,
    userId: "33333333-3333-4333-8333-333333333333",
  },
];

function controlState(memberCount = 3) {
  return {
    league: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      lifecycle: "DRAFT" as const,
      memberCount,
      mode: "LIVE" as const,
      slug: "sunday-friends",
    },
    members:
      memberCount === 4
        ? [
            ...members,
            {
              displayName: "Taylor",
              role: "MEMBER" as const,
              userId: "44444444-4444-4444-8444-444444444444",
            },
          ]
        : members,
    slate: [],
    week: null,
  };
}

describe("Phase 1 invitation experience", () => {
  it("previews safe league facts before offering distinct account intents", () => {
    render(
      <InvitePreviewPanel
        authenticated={false}
        preview={preview}
        token="private-invite-token"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Sunday Friends" }),
    ).toBeVisible();
    expect(screen.getByText("Alex invited you")).toBeVisible();
    expect(screen.getByText(/3 · even roster required/i)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Create account" }),
    ).toHaveAttribute(
      "href",
      "/auth/create-account?next=%2Fjoin%2Fprivate-invite-token",
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/auth/sign-in?next=%2Fjoin%2Fprivate-invite-token",
    );
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
  });

  it("uses one generic state for expired, revoked, used, or missing links", () => {
    render(<InviteUnavailable />);

    expect(
      screen.getByRole("heading", {
        name: "This league link is no longer active",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(/expired, reached its use limit, or been revoked/i),
    ).toBeVisible();
  });

  it("keeps invitation and roster readiness ahead of provider work", () => {
    render(
      <Stage1CommissionerControls
        invites={[]}
        latestLiveImport={null}
        liveWeekOperations={null}
        providerConfigured
        state={controlState()}
      />,
    );

    expect(screen.getByText("Complete the league roster")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Create default invitation link" }),
    ).toBeVisible();
    expect(screen.getByText("Alex")).toBeVisible();
    expect(screen.getByText("Jordan")).toBeVisible();
    expect(
      screen.getByText("Advanced invitation settings"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Finish the roster before odds work"),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Import NFL markets for review" }),
    ).toBeDisabled();
  });

  it("makes provider work available only after roster formation is valid", () => {
    render(
      <Stage1CommissionerControls
        invites={[]}
        latestLiveImport={null}
        liveWeekOperations={null}
        providerConfigured
        state={controlState(4)}
      />,
    );

    expect(screen.getByText("✓ Roster ready")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Import NFL markets for review" }),
    ).toBeVisible();
  });
});
