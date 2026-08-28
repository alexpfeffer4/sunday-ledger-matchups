"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { label: "Overview", segment: "league" },
  { label: "Standings", segment: "standings" },
  { label: "Schedule", segment: "schedule" },
  { label: "Playoffs", segment: "playoffs" },
  { label: "History", segment: "history" },
] as const;

export function LeagueMobileSecondaryNav({
  leagueSlug,
}: {
  leagueSlug: string;
}) {
  const pathname = usePathname();
  const base = `/l/${leagueSlug}`;
  const visible = items.some(({ segment }) =>
    pathname.startsWith(`${base}/${segment}`),
  );

  if (!visible) return null;

  return (
    <nav
      aria-label="League sections"
      className="border-boundary bg-surface overflow-x-auto border-b lg:hidden"
    >
      <ul className="flex min-w-max px-3">
        {items.map((item) => {
          const href = `${base}/${item.segment}`;
          const active = pathname.startsWith(href);
          return (
            <li key={item.segment}>
              <Link
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center border-b-2 px-3 text-xs font-semibold ${
                  active
                    ? "border-registry text-registry"
                    : "text-muted border-transparent"
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
