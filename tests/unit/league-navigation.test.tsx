// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  LeagueDesktopNav,
  LeagueMobileNav,
} from "@/components/league/league-nav";
import { LeagueMobileMore } from "@/components/league/league-mobile-more";
import { LeagueMobileSecondaryNav } from "@/components/league/league-secondary-nav";

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

describe("league navigation permissions", () => {
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
  });

  it("exposes the five mobile destinations and commissioner utilities", () => {
    render(
      <>
        <LeagueMobileNav leagueSlug="live-test" />
        <LeagueMobileMore leagueSlug="live-test" isCommissioner />
      </>,
    );

    expect(
      screen.getByRole("navigation", { name: "Mobile league navigation" }),
    ).toBeInTheDocument();
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
      screen.getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
  });
});
