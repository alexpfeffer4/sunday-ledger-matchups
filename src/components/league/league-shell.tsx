import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { SignOutForm } from "@/components/auth/sign-out-form";
import {
  LeagueDesktopNav,
  LeagueMobileNav,
} from "@/components/league/league-nav";
import { LeagueMobileMore } from "@/components/league/league-mobile-more";
import { LeagueMobileSecondaryNav } from "@/components/league/league-secondary-nav";
import { BrandLockup, RegisterMark } from "@/components/ui/register-mark";

function NavigationFallback() {
  return <div className="bg-subtle mt-8 h-72 rounded-lg" aria-hidden="true" />;
}

function initials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "SL";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

export function LeagueShell({
  children,
  leagueSlug,
  leagueName,
  week,
  nflYear,
  mode,
  memberName,
  memberRole,
  cardStatusLabel,
  archiveMode = false,
  isCommissioner = false,
}: {
  children: ReactNode;
  leagueSlug: string;
  leagueName: string;
  week: number;
  nflYear: number;
  mode: "LIVE" | "SIMULATION";
  memberName: string;
  memberRole: string;
  cardStatusLabel: string;
  archiveMode?: boolean;
  isCommissioner?: boolean;
}) {
  return (
    <div className="bg-canvas min-h-screen lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="border-boundary bg-surface hidden min-h-0 border-r px-4 py-5 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-hidden">
        <Link
          href="/"
          aria-label="Sunday Ledger home"
          className="shrink-0 px-2"
        >
          <BrandLockup />
        </Link>
        <div className="bg-subtle mt-7 shrink-0 rounded-lg p-3">
          <div className="flex items-center gap-3">
            <span className="bg-registry flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white">
              <RegisterMark className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{leagueName}</p>
              <p className="text-muted mt-0.5 text-xs">
                NFL · {nflYear} · Week {week}
              </p>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
          <Suspense fallback={<NavigationFallback />}>
            <LeagueDesktopNav
              leagueSlug={leagueSlug}
              archiveMode={archiveMode}
              isCommissioner={isCommissioner}
            />
          </Suspense>
        </div>
        <div className="border-boundary shrink-0 border-t pt-4">
          <div className="flex items-center gap-3 px-2">
            <span className="border-registry bg-subtle text-registry flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold">
              {initials(memberName)}
            </span>
            <div>
              <p className="text-sm font-semibold">{memberName}</p>
              <p className="text-muted text-xs">{memberRole}</p>
            </div>
          </div>
          <Link
            className="text-muted hover:text-ink mt-3 flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold"
            href="/account"
          >
            Account
          </Link>
          <SignOutForm className="text-muted hover:text-ink min-h-11 w-full rounded-lg px-2 text-left text-sm font-semibold" />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="border-boundary bg-canvas/95 sticky top-0 z-30 border-b backdrop-blur-sm">
          <div className="mx-auto flex min-h-16 max-w-[1480px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3 lg:hidden">
              <Link
                aria-label="Sunday Ledger home"
                href="/"
                className="text-registry"
              >
                <RegisterMark className="h-7 w-7" />
              </Link>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{leagueName}</p>
                <p className="text-muted max-w-[13rem] truncate text-xs">
                  Week {week} · {archiveMode ? "Season final" : cardStatusLabel}
                </p>
              </div>
            </div>
            <div className="hidden lg:block">
              <p className="text-sm font-semibold">
                {leagueName} / {nflYear}
              </p>
              <p className="text-muted text-xs">NFL · Week {week}</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-2 py-1 text-[11px] font-bold tracking-[0.04em] uppercase ${
                  mode === "SIMULATION"
                    ? "border-pending/30 bg-pending/10 text-pending border"
                    : "bg-subtle text-graphite"
                }`}
              >
                {mode === "SIMULATION" ? "Practice" : "Live season"}
              </span>
              {archiveMode ? (
                <span className="text-positive hidden min-h-11 items-center px-3 text-sm font-semibold lg:inline-flex">
                  Season final
                </span>
              ) : (
                <Link
                  href={`/l/${leagueSlug}/card`}
                  className="text-registry hover:bg-subtle hidden min-h-11 items-center rounded-lg px-3 text-sm font-semibold lg:inline-flex"
                >
                  {cardStatusLabel}
                </Link>
              )}
              <LeagueMobileMore
                leagueSlug={leagueSlug}
                isCommissioner={isCommissioner}
              />
            </div>
          </div>
        </header>
        <Suspense fallback={null}>
          <LeagueMobileSecondaryNav leagueSlug={leagueSlug} />
        </Suspense>
        {children}
      </div>

      <Suspense fallback={null}>
        <LeagueMobileNav leagueSlug={leagueSlug} archiveMode={archiveMode} />
      </Suspense>
    </div>
  );
}
