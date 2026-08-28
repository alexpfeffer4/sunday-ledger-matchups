"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LeagueNavIcon,
  type LeagueNavIconName,
} from "@/components/league/league-nav-icon";

type NavItem = {
  label: string;
  segment: string;
  icon: LeagueNavIconName;
};

const playItems: readonly NavItem[] = [
  { label: "Matchup", segment: "matchup", icon: "matchup" },
  { label: "Slate", segment: "slate", icon: "slate" },
  { label: "My Card", segment: "card", icon: "card" },
  { label: "Live", segment: "live", icon: "live" },
];

const leagueItems: readonly NavItem[] = [
  { label: "Overview", segment: "league", icon: "league" },
  { label: "Standings", segment: "standings", icon: "standings" },
  { label: "Schedule", segment: "schedule", icon: "schedule" },
  { label: "Playoffs", segment: "playoffs", icon: "playoffs" },
  { label: "History", segment: "history", icon: "history" },
];

const mobileItems: readonly NavItem[] = [
  ...playItems.slice(0, 3),
  { label: "League", segment: "league", icon: "league" },
  playItems[3],
];

const archiveItems: readonly NavItem[] = [
  { label: "Season", segment: "matchup", icon: "league" },
  { label: "Standings", segment: "standings", icon: "standings" },
  { label: "Schedule", segment: "schedule", icon: "schedule" },
  { label: "Playoffs", segment: "playoffs", icon: "playoffs" },
  { label: "History", segment: "history", icon: "history" },
];

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
          const href = `${base}/${item.segment}`;
          const active = isActive(pathname, href);

          return (
            <li key={item.segment}>
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function LeagueDesktopNav({
  leagueSlug,
  archiveMode = false,
  isCommissioner = false,
}: {
  leagueSlug: string;
  archiveMode?: boolean;
  isCommissioner?: boolean;
}) {
  const pathname = usePathname();
  const base = `/l/${leagueSlug}`;
  const manageItems: readonly NavItem[] = [
    { label: "Rules & trust", segment: "rules", icon: "rules" },
    ...(archiveMode || !isCommissioner
      ? []
      : [
          {
            label: "Commissioner",
            segment: "commissioner",
            icon: "commissioner" as const,
          },
        ]),
  ];

  return (
    <nav aria-label="League navigation" className="mt-7">
      {archiveMode ? (
        <DesktopNavGroup
          base={base}
          items={archiveItems}
          label="Season"
          pathname={pathname}
        />
      ) : (
        <>
          <DesktopNavGroup
            base={base}
            items={playItems}
            label="Play"
            pathname={pathname}
          />
          <div className="border-boundary my-5 border-t" />
          <DesktopNavGroup
            base={base}
            items={leagueItems}
            label="League"
            pathname={pathname}
          />
        </>
      )}
      <div className="border-boundary my-5 border-t" />
      <DesktopNavGroup
        base={base}
        items={manageItems}
        label="Manage"
        pathname={pathname}
      />
    </nav>
  );
}

export function LeagueMobileNav({
  leagueSlug,
  archiveMode = false,
}: {
  leagueSlug: string;
  archiveMode?: boolean;
}) {
  const pathname = usePathname();
  const base = `/l/${leagueSlug}`;
  const items = archiveMode ? archiveItems : mobileItems;

  return (
    <nav
      aria-label="Mobile league navigation"
      className="border-boundary bg-surface fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {items.map((item) => {
          const href = `${base}/${item.segment}`;
          const exactActive = isActive(pathname, href);
          const active =
            exactActive ||
            (!archiveMode &&
              item.segment === "league" &&
              leagueItems.some((leagueItem) =>
                isActive(pathname, `${base}/${leagueItem.segment}`),
              ));

          return (
            <li key={item.segment}>
              <Link
                aria-current={exactActive ? "page" : undefined}
                className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors after:absolute after:inset-x-4 after:top-0 after:h-0.5 after:rounded-full ${
                  active
                    ? "text-registry after:bg-registry"
                    : "text-muted after:bg-transparent"
                }`}
                href={href}
              >
                <LeagueNavIcon className="size-5" name={item.icon} />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
