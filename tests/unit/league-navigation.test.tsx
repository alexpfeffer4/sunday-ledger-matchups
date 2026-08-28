// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  LeagueDesktopNav,
  LeagueMobileNav,
} from "@/components/league/league-nav";
import {
  LeagueDesktopProfileMenu,
  LeagueMobileMore,
} from "@/components/league/league-mobile-more";
import { LeagueMobileSecondaryNav } from "@/components/league/league-secondary-nav";
import { LeagueShell } from "@/components/league/league-shell";

const navigationState = vi.hoisted(() => ({
  pathname: "/l/live-test/matchup",
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
}));

vi.mock("@/app/(auth)/auth/actions", () => ({
  signOutAction: vi.fn(),
}));

describe("league navigation", () => {
  it("shows the league subnavigation on mobile league pages", () => {
    navigationState.pathname = "/l/live-test/standings";
    render(<LeagueMobileSecondaryNav leagueSlug="live-test" />);

    const navigation = screen.getByRole("navigation", {
      name: "League sections",
    });
    expect(
      within(navigation).getByRole("link", { name: "Overview" }),
    ).toHaveAttribute("href", "/l/live-test/league");
    expect(
      within(navigation).getByRole("link", { name: "Standings" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("keeps commissioner navigation out of a regular member's UI", () => {
    navigationState.pathname = "/l/live-test/matchup";
    render(<LeagueDesktopNav leagueSlug="live-test" isCommissioner={false} />);

    expect(screen.getByRole("link", { name: "Rules & trust" })).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Commissioner" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Play")).toBeInTheDocument();
    expect(screen.getByText("League")).toBeInTheDocument();
    expect(screen.getByText("Manage")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Matchup" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("exposes five mobile destinations without duplicating league sections", () => {
    render(
      <>
        <LeagueMobileNav leagueSlug="live-test" />
        <LeagueMobileMore
          leagueSlug="live-test"
          isCommissioner
          memberName="Alex Pfeffer"
          memberRole="Commissioner"
        />
      </>,
    );

    const primary = screen.getByRole("navigation", {
      name: "Mobile league navigation",
    });
    expect(within(primary).getAllByRole("link")).toHaveLength(5);
    expect(
      within(primary).getByRole("link", { name: "My Card" }),
    ).toHaveAttribute("href", "/l/live-test/card");
    expect(screen.getByText("AP", { selector: "summary" })).toBeInTheDocument();
    const utilities = within(
      screen.getByRole("navigation", { name: "League and account" }),
    );

    expect(
      utilities.getByRole("link", { name: "Commissioner" }),
    ).toHaveAttribute("href", "/l/live-test/commissioner");
    expect(
      utilities.getByRole("link", { name: "Rules & trust" }),
    ).toHaveAttribute("href", "/l/live-test/rules");
    expect(
      utilities.queryByRole("link", { name: "Standings" }),
    ).not.toBeInTheDocument();
    expect(
      utilities.queryByRole("link", { name: "Schedule" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
  });

  it("puts desktop account actions behind one profile control", () => {
    render(
      <LeagueDesktopProfileMenu
        memberName="Alex Pfeffer"
        memberRole="Commissioner"
      />,
    );

    expect(
      screen.getByText("AP", { selector: "summary span" }),
    ).toBeInTheDocument();
    const account = screen.getByRole("navigation", { name: "Account options" });
    expect(account.getAttribute("class")).toContain("mt-2");
    expect(
      within(account).getByRole("link", { name: "Your leagues" }),
    ).toHaveAttribute("href", "/leagues");
    const menu = account.closest("details");
    expect(menu).not.toBeNull();
    expect(
      within(menu as HTMLElement).getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
  });

  it("uses a responsive rail and omits the redundant live-season badge", () => {
    const { container } = render(
      <LeagueShell
        cardStatusLabel="650 / 1,000 used"
        isCommissioner
        leagueName="Test League"
        leagueSlug="live-test"
        memberName="Alex Pfeffer"
        memberRole="Commissioner"
        mode="LIVE"
        nflYear={2026}
        week={6}
      >
        <p>Shell content</p>
      </LeagueShell>,
    );

    expect(container.firstElementChild).toHaveClass(
      "lg:grid-cols-[72px_minmax(0,1fr)]",
      "xl:grid-cols-[232px_minmax(0,1fr)]",
    );
    expect(
      screen.getByRole("link", {
        name: "Switch leagues. Current league: Test League",
      }),
    ).toHaveAttribute("href", "/leagues");
    expect(screen.queryByText("Live season")).not.toBeInTheDocument();
  });

  it("retains a small Practice label for practice leagues", () => {
    render(
      <LeagueShell
        cardStatusLabel="Card ready"
        leagueName="Practice League"
        leagueSlug="practice-test"
        memberName="Alex Pfeffer"
        memberRole="Practice commissioner"
        mode="SIMULATION"
        nflYear={2026}
        week={6}
      >
        <p>Practice shell</p>
      </LeagueShell>,
    );

    expect(screen.getByText("Practice", { selector: "span" })).toBeVisible();
  });
});
