"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const items = [
  { label: "Overview", segment: "league" },
  { label: "Standings", segment: "standings" },
  { label: "Schedule", segment: "schedule" },
  { label: "Playoffs", segment: "playoffs" },
  { label: "History", segment: "history" },
] as const;

function itemIsActive(pathname: string, base: string, segment: string) {
  if (segment === "history" && pathname.startsWith(`${base}/rivalry/`)) {
    return true;
  }
  const href = `${base}/${segment}`;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function LeagueSecondaryNav({ leagueSlug }: { leagueSlug: string }) {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);
  const base = `/l/${leagueSlug}`;
  const visible = items.some(({ segment }) =>
    itemIsActive(pathname, base, segment),
  );

  useEffect(() => {
    if (
      !visible ||
      (typeof window.matchMedia === "function" &&
        window.matchMedia("(min-width: 1024px)").matches)
    ) {
      return;
    }
    activeRef.current?.scrollIntoView?.({
      block: "nearest",
      inline: "center",
    });
  }, [pathname, visible]);

  if (!visible) return null;

  return (
    <nav
      aria-label="League sections"
      className="border-boundary bg-surface relative border-b"
    >
      <div className="league-secondary-scroll mx-auto max-w-[1480px] overflow-x-auto px-3 sm:px-5 lg:px-8">
        <ul className="flex min-w-max lg:gap-1 lg:py-2">
          {items.map((item) => {
            const href = `${base}/${item.segment}`;
            const active = itemIsActive(pathname, base, item.segment);
            return (
              <li key={item.segment}>
                <Link
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-12 items-center border-b-2 px-3 text-xs font-semibold lg:min-h-9 lg:rounded-md lg:border-b-0 lg:px-3 ${
                    active
                      ? "border-registry bg-registry/5 text-registry"
                      : "text-muted hover:bg-subtle hover:text-ink border-transparent"
                  }`}
                  href={href}
                  ref={active ? activeRef : undefined}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      <span
        aria-hidden="true"
        className="from-surface pointer-events-none absolute inset-y-0 left-0 w-3 bg-gradient-to-r to-transparent lg:hidden"
      />
      <span
        aria-hidden="true"
        className="from-surface pointer-events-none absolute inset-y-0 right-0 w-5 bg-gradient-to-l to-transparent lg:hidden"
      />
    </nav>
  );
}

export const LeagueMobileSecondaryNav = LeagueSecondaryNav;
