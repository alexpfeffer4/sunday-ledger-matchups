"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const primaryItems = [
  { label: "Matchup", segment: "matchup", short: "M" },
  { label: "Slate", segment: "slate", short: "S" },
  { label: "My Card", segment: "card", short: "C" },
  { label: "League", segment: "league", short: "L" },
  { label: "Live", segment: "live", short: "●" },
] as const;

const secondaryItems = [
  { label: "Standings", segment: "standings" },
  { label: "Schedule", segment: "schedule" },
  { label: "Playoffs", segment: "playoffs" },
  { label: "History", segment: "history" },
] as const;

const archiveItems = [
  { label: "Season", segment: "matchup", short: "S" },
  { label: "Standings", segment: "standings", short: "#" },
  { label: "Schedule", segment: "schedule", short: "14" },
  { label: "Playoffs", segment: "playoffs", short: "P" },
  { label: "History", segment: "history", short: "H" },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function LeagueDesktopNav({
  leagueSlug,
  archiveMode = false,
}: {
  leagueSlug: string;
  archiveMode?: boolean;
}) {
  const pathname = usePathname();
  const base = `/l/${leagueSlug}`;
  const mainItems = archiveMode ? archiveItems : primaryItems;

  return (
    <nav aria-label="League navigation" className="mt-8">
      <ul className="space-y-1">
        {mainItems.map((item) => {
          const href = `${base}/${item.segment}`;
          const active = isActive(pathname, href);
          return (
            <li key={item.segment}>
              <Link
                className={`flex min-h-11 items-center gap-3 rounded-lg border-l-2 px-3 text-sm font-semibold transition-colors ${
                  active
                    ? "border-registry bg-subtle text-registry"
                    : "text-graphite hover:bg-subtle hover:text-ink border-transparent"
                }`}
                href={href}
              >
                <span
                  aria-hidden="true"
                  className="w-5 text-center font-mono text-xs"
                >
                  {item.short}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      {!archiveMode ? (
        <>
          <div className="border-boundary my-5 border-t" />
          <ul className="space-y-1">
            {secondaryItems.map((item) => {
              const href = `${base}/${item.segment}`;
              const active = isActive(pathname, href);
              return (
                <li key={item.segment}>
                  <Link
                    className={`flex min-h-11 items-center rounded-lg border-l-2 px-3 text-sm font-medium transition-colors ${
                      active
                        ? "border-registry bg-subtle text-registry"
                        : "text-graphite hover:bg-subtle hover:text-ink border-transparent"
                    }`}
                    href={href}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      <div className="border-boundary my-5 border-t" />
      <ul className="space-y-1">
        {[
          { label: "Rules & trust", segment: "rules" },
          ...(archiveMode
            ? []
            : [{ label: "Commissioner", segment: "commissioner" }]),
        ].map((item) => {
          const href = `${base}/${item.segment}`;
          const active = isActive(pathname, href);
          return (
            <li key={item.segment}>
              <Link
                className={`flex min-h-11 items-center rounded-lg border-l-2 px-3 text-sm font-medium transition-colors ${
                  active
                    ? "border-registry bg-subtle text-registry"
                    : "text-graphite hover:bg-subtle hover:text-ink border-transparent"
                }`}
                href={href}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
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
  const items = archiveMode ? archiveItems : primaryItems;

  return (
    <nav
      aria-label="Mobile league navigation"
      className="border-boundary bg-surface fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {items.map((item) => {
          const href = `${base}/${item.segment}`;
          const active = isActive(pathname, href);
          return (
            <li key={item.segment}>
              <Link
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${active ? "text-registry" : "text-muted"}`}
                href={href}
              >
                <span aria-hidden="true" className="font-mono text-xs">
                  {item.short}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
