// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthInvitationContext } from "@/application/queries/get-auth-invitation-context";
import { getLeagueInvitePreview } from "@/application/queries/get-league-invite-preview";
import { InvitationContext } from "@/components/auth/invitation-context";

vi.mock("server-only", () => ({}));
vi.mock("@/application/queries/get-league-invite-preview", () => ({
  getLeagueInvitePreview: vi.fn(),
}));
const token = "0123456789abcdef0123456789abcdef";
const next = `/join/${token}`;
const preview = {
  league_name: "An unusually long league name".repeat(3),
  commissioner_name: "Not needed in account setup",
  expires_at: "2026-10-01T00:00:00Z",
  member_count: 2,
  mode: "LIVE" as const,
  nfl_year: 2026,
};
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

describe("invitation context is presentation, not admission", () => {
  it.each([
    next,
    `${next}/`,
    `${next}?leagueName=Forged#anything`,
    `/account/set-password?next=${encodeURIComponent(next)}`,
  ])("uses only the token-scoped preview for %s", async (destination) => {
    vi.mocked(getLeagueInvitePreview).mockResolvedValue(preview);
    expect(await getAuthInvitationContext(destination)).toEqual({
      leagueName: preview.league_name,
    });
    expect(getLeagueInvitePreview).toHaveBeenCalledExactlyOnceWith(token);
  });
  it.each([
    "/leagues",
    "//outside.test/join/0123456789abcdef",
    "https://outside.test/join/0123456789abcdef",
    "/other?next=%2Fjoin%2F0123456789abcdef",
    "/account/set-password?next=%2F%2Foutside.test",
    "/account/set-password?next=%2Faccount%2Fset-password%3Fnext%3D%252Fjoin%252F0123456789abcdef",
  ])(
    "does not fetch or invent invitation facts for %s",
    async (destination) => {
      expect(await getAuthInvitationContext(destination)).toBeNull();
      expect(getLeagueInvitePreview).not.toHaveBeenCalled();
    },
  );
  it.each([
    "/join/short",
    "/join/%2F%2Foutside.test",
    `/join/${token}/extra`,
    `/join/${"a".repeat(121)}`,
  ])(
    "shows unavailable without querying malformed token %s",
    async (destination) => {
      expect(await getAuthInvitationContext(destination)).toEqual({
        leagueName: null,
      });
      expect(getLeagueInvitePreview).not.toHaveBeenCalled();
    },
  );
  it("shows the verified league and preserves an explicit join step", async () => {
    vi.mocked(getLeagueInvitePreview).mockResolvedValue(preview);
    render(await InvitationContext({ next }));
    expect(
      screen.getByRole("complementary", { name: "League invitation" }),
    ).toHaveTextContent(preview.league_name);
    expect(screen.getByText(/does not join it/)).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.queryByText(preview.commissioner_name),
    ).not.toBeInTheDocument();
  });
  it.each(["inactive", "outage"])(
    "does not reuse a name after %s",
    async (reason) => {
      vi.mocked(getLeagueInvitePreview).mockResolvedValueOnce(preview);
      await getAuthInvitationContext(next);
      if (reason === "outage")
        vi.mocked(getLeagueInvitePreview).mockRejectedValueOnce(
          new Error("private provider detail"),
        );
      else vi.mocked(getLeagueInvitePreview).mockResolvedValueOnce(null);
      render(await InvitationContext({ next }));
      expect(screen.getByText("Invitation unavailable")).toBeVisible();
      expect(
        screen.getByText(/joining still requires an active invitation/),
      ).toBeVisible();
      expect(screen.queryByText(preview.league_name)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/private provider detail/),
      ).not.toBeInTheDocument();
    },
  );
  it("renders no invitation for unrelated account access", async () => {
    expect(await InvitationContext({ next: "/leagues" })).toBeNull();
  });
});
