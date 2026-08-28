// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  LeagueDesktopNav,
  LeagueMobileNav,
} from "@/components/league/league-nav";
import { LeagueMobileMore } from "@/components/league/league-mobile-more";

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
  usePathname: () => "/l/live-test/matchup",
}));

vi.mock("@/app/(auth)/auth/actions", () => ({
  signOutAction: vi.fn(),
}));

describe("league navigation permissions", () => {
  it("keeps commissioner navigation out of a regular member's UI", () => {
    render(
      <LeagueDesktopNav
        leagueSlug="live-test"
        isCommissioner={false}
      />,
    );

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
    expect(screen.getByRole("link", { name: "Commissioner" })).toHaveAttribute(
      "href",
      "/l/live-test/commissioner",
    );
    expect(screen.getByRole("link", { name: "Rules & trust" })).toHaveAttribute(
      "href",
      "/l/live-test/rules",
    );
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });
});
