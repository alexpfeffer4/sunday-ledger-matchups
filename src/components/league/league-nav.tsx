"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LeagueNavIcon,
  type LeagueNavIconName,
} from "@/components/league/league-nav-icon";
import { LeagueMobileMore } from "@/components/league/league-mobile-more";

type NavItem = {
  label: string;
  segment?: string;
  href?: string;
  icon: LeagueNavIconName;
};

const thisWeekItems: readonly NavItem[] = [
  { label: "Matchup", segment: "matchup", icon: "matchup" },
  { label: "Make picks", segment: "slate", icon: "slate" },
  { label: "My Card", segment: "card", icon: "card" },
];

const leaguePrimaryItems: readonly NavItem[] = [
  { label: "Overview", segment: "league", icon: "league" },
];

const mobileItems: readonly NavItem[] = [
  ...thisWeekItems,
  { label: "League", segment: "league", icon: "league" },
];

const leagueSectionSegments = [
  "league",
  "standings",
  "schedule",
  "playoffs",
  "history",
  "rivalry",
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function DesktopNavGroup({
  base,
  items,
  label,
  pathname,
}: {
  base: string;
  items: readonly NavItem[];
  label: string;
  pathname: string;
}) {
  return (
    <div>
      <p className="text-muted mb-2 hidden px-3 text-xs font-semibold xl:block">
        {label}
      </p>
      <ul className="space-y-1">
        {items.map((item) => {
          const href = item.href ?? `${base}/${item.segment}`;
          const active = isActive(pathname, href);

          return (
            <li className="group relative" key={item.href ?? item.segment}>
              <Link
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                className={`flex min-h-11 items-center justify-center rounded-lg border-l-2 px-2 text-sm font-semibold transition-colors xl:justify-start xl:gap-3 xl:px-3 ${
                  active
                    ? "border-registry bg-subtle text-registry"
                    : "text-graphite hover:bg-subtle hover:text-ink border-transparent"
                }`}
                href={href}
                title={item.label}
              >
                <LeagueNavIcon className="size-5 shrink-0" name={item.icon} />
                <span className="hidden xl:inline">{item.label}</span>
              </Link>
              <span
                className="border-boundary bg-ink pointer-events-none absolute top-1/2 left-[calc(100%+0.5rem)] z-50 hidden -translate-y-1/2 rounded-md border px-2 py-1 text-xs font-semibold whitespace-nowrap text-white shadow-lg group-focus-within:block group-hover:block xl:hidden"
                role="tooltip"
              >
                {item.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function LeagueDesktopNav({
  leagueSlug,
  isCommissioner = false,
}: {
  leagueSlug: string;
  isCommissioner?: boolean;
}) {
  const pathname = usePathname();
  const base = `/l/${leagueSlug}`;
  const utilityItems: readonly NavItem[] = [
    { label: "Rules & trust", segment: "rules", icon: "rules" },
    { label: "Account", href: "/account", icon: "account" },
    ...(isCommissioner
      ? [
          {
            label: "Commissioner",
            segment: "commissioner",
            icon: "commissioner" as const,
          },
        ]
      : []),
  ];

  return (
    <nav aria-label="League navigation" className="mt-7">
      <DesktopNavGroup
        base={base}
        items={thisWeekItems}
        label="This week"
        pathname={pathname}
      />
      <div className="border-boundary my-5 border-t" />
      <DesktopNavGroup
        base={base}
        items={leaguePrimaryItems}
        label="League"
        pathname={pathname}
      />
      <div className="border-boundary my-5 border-t" />
      <DesktopNavGroup
        base={base}
        items={utilityItems}
        label="Utilities"
        pathname={pathname}
      />
    </nav>
  );
}

export function LeagueMobileNav({
  leagueSlug,
  isCommissioner,
  memberName,
  memberRole,
}: {
  leagueSlug: string;
  isCommissioner: boolean;
  memberName: string;
  memberRole: string;
}) {
  const pathname = usePathname();
  const base = `/l/${leagueSlug}`;
  const utilityActive =
    pathname === "/account" ||
    isActive(pathname, `${base}/rules`) ||
    isActive(pathname, `${base}/commissioner`);

  return (
    <nav
      aria-label="Mobile league navigation"
      className="border-boundary bg-surface fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {mobileItems.map((item) => {
          const href = `${base}/${item.segment}`;
          const exactActive = isActive(pathname, href);
          const active =
            exactActive ||
            (item.segment === "league" &&
              leagueSectionSegments.some((segment) =>
                isActive(pathname, `${base}/${segment}`),
              ));

          return (
            <li key={item.segment}>
              <Link
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] transition-colors after:absolute after:inset-x-4 after:top-0 after:h-0.5 after:rounded-full ${
                  active
                    ? "text-registry after:bg-registry font-bold"
                    : "text-muted font-semibold after:bg-transparent"
                }`}
                href={href}
              >
                <span
                  className={
                    active
                      ? "bg-registry/10 flex rounded-md p-1"
                      : "flex rounded-md p-1"
                  }
                >
                  <LeagueNavIcon className="size-5" name={item.icon} />
                </span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
        <LeagueMobileMore
          active={utilityActive}
          isCommissioner={isCommissioner}
          leagueSlug={leagueSlug}
          memberName={memberName}
          memberRole={memberRole}
        />
      </ul>
    </nav>
  );
}
