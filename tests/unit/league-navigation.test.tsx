// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  LeagueDesktopNav,
  LeagueMobileNav,
} from "@/components/league/league-nav";
import { LeagueDesktopProfileMenu } from "@/components/league/league-mobile-more";
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

  it("keeps Rivalry inside History and marks the History link current", () => {
    navigationState.pathname = "/l/live-test/rivalry/member-a/member-b";
    const { container } = render(
      <LeagueMobileSecondaryNav leagueSlug="live-test" />,
    );
    const navigation = within(container).getByRole("navigation", {
      name: "League sections",
    });
    expect(
      within(navigation).getByRole("link", { name: "History" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(navigation).queryByRole("link", { name: "Rivalry" }),
    ).not.toBeInTheDocument();
  });

  it("keeps commissioner navigation out of a regular member's UI", () => {
    navigationState.pathname = "/l/live-test/matchup";
    render(<LeagueDesktopNav leagueSlug="live-test" isCommissioner={false} />);

    expect(screen.getByRole("link", { name: "Rules & trust" })).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Commissioner" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("This week")).toBeInTheDocument();
    expect(screen.getByText("League")).toBeInTheDocument();
    expect(screen.getByText("Utilities")).toBeInTheDocument();
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Make picks" })).toHaveAttribute(
      "href",
      "/l/live-test/slate",
    );
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute(
      "href",
      "/account",
    );
    expect(screen.getByRole("link", { name: "Matchup" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("exposes five mobile destinations without duplicating league sections", () => {
    render(
      <LeagueMobileNav
        isCommissioner
        leagueSlug="live-test"
        memberName="Alex Pfeffer"
        memberRole="Commissioner"
      />,
    );

    const primary = screen.getByRole("navigation", {
      name: "Mobile league navigation",
    });
    expect(within(primary).getAllByRole("link")).toHaveLength(4);
    expect(
      Array.from(primary.querySelectorAll(":scope > ul > li")).map((item) =>
        (
          item.querySelector(":scope > a, :scope > div > button") as HTMLElement
        ).textContent?.trim(),
      ),
    ).toEqual(["Matchup", "Make picks", "My Card", "League", "More"]);
    expect(
      within(primary).getByRole("link", { name: "My Card" }),
    ).toHaveAttribute("href", "/l/live-test/card");
    const profileTrigger = screen.getByRole("button", {
      name: "More",
    });
    expect(profileTrigger).toHaveTextContent("More");
    expect(profileTrigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(profileTrigger);
    expect(profileTrigger).toHaveAttribute("aria-expanded", "true");
    const profileMenu = screen.getByRole("dialog", { name: "More" });
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
      within(profileMenu).getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
  });

  it("keeps commissioner utilities out of a member's mobile More sheet", () => {
    const { container } = render(
      <LeagueMobileNav
        isCommissioner={false}
        leagueSlug="live-test"
        memberName="Morgan Member"
        memberRole="Member"
      />,
    );
    fireEvent.click(within(container).getByRole("button", { name: "More" }));
    const utilities = within(
      within(container).getByRole("navigation", { name: "League and account" }),
    );
    expect(
      utilities.queryByRole("link", { name: "Commissioner" }),
    ).not.toBeInTheDocument();
    expect(utilities.getByRole("link", { name: "Account" })).toBeVisible();
  });

  it("puts desktop account actions behind one profile control", () => {
    render(
      <LeagueDesktopProfileMenu
        memberName="Alex Pfeffer"
        memberRole="Commissioner"
      />,
    );

    const accountTrigger = screen.getByRole("button", {
      name: "Open account menu",
    });
    expect(accountTrigger).toHaveTextContent("AP");
    fireEvent.click(accountTrigger);
    const menu = screen.getByRole("menu", { name: "Account menu" });
    expect(
      within(menu).getByRole("menuitem", { name: "Your leagues" }),
    ).toHaveAttribute("href", "/leagues");
    expect(
      within(menu).getByRole("menuitem", {
        name: "Your leagues",
      }),
    ).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(
      within(menu).getByRole("menuitem", { name: "Account" }),
    ).toHaveFocus();
    expect(
      within(menu).getByRole("menuitem", { name: "Sign out" }),
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
        phaseLabel="Live"
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
      screen.getAllByRole("link", {
        name: /Switch leagues\. Current league: Test League\. 2026, Week 6, Live, Live/,
      }),
    ).toHaveLength(2);
    expect(screen.queryByText("Live season")).not.toBeInTheDocument();
  });

  it("reserves an explicit Simulation label for authoritative Simulation", () => {
    render(
      <LeagueShell
        cardStatusLabel="Card ready"
        leagueName="Practice League"
        leagueSlug="practice-test"
        memberName="Alex Pfeffer"
        memberRole="Practice commissioner"
        mode="SIMULATION"
        nflYear={2026}
        phaseLabel="Cards open"
        week={6}
      >
        <p>Practice shell</p>
      </LeagueShell>,
    );

    expect(screen.getAllByText(/Simulation/).length).toBeGreaterThan(0);
  });

  it("keeps Example Season separate from Simulation", () => {
    const { container } = render(
      <LeagueShell
        archiveMode
        cardStatusLabel="Read-only"
        exampleMode
        leagueName="Example Season"
        leagueSlug="example-season"
        memberName="North Club"
        memberRole="Example participant"
        mode="SIMULATION"
        nflYear={2026}
        phaseLabel="Archive final"
        week={18}
      >
        <p>Example content</p>
      </LeagueShell>,
    );

    expect(
      within(container).getAllByText(/Example Season · Read-only/).length,
    ).toBeGreaterThan(0);
    expect(within(container).queryByText("Simulation")).not.toBeInTheDocument();
  });
});
