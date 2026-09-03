import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import {
  LeagueDesktopNav,
  LeagueMobileNav,
} from "@/components/league/league-nav";
import { LeagueDesktopProfileMenu } from "@/components/league/league-mobile-more";
import { initials } from "@/components/league/initials";
import { LeagueMobileSecondaryNav } from "@/components/league/league-secondary-nav";
import { InterfaceIcon } from "@/components/ui/interface-icon";
import { BrandLockup, RegisterMark } from "@/components/ui/register-mark";

function NavigationFallback() {
  return <div className="bg-subtle mt-7 h-72 rounded-lg" aria-hidden="true" />;
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
  phaseLabel,
  archiveMode = false,
  exampleMode = false,
  isCommissioner = false,
  ownerRehearsal = false,
  ownerRehearsalGuide,
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
  phaseLabel: string;
  archiveMode?: boolean;
  exampleMode?: boolean;
  isCommissioner?: boolean;
  ownerRehearsal?: boolean;
  ownerRehearsalGuide?: ReactNode;
}) {
  return (
    <div
      className="bg-canvas min-h-screen lg:grid lg:grid-cols-[72px_minmax(0,1fr)] xl:grid-cols-[232px_minmax(0,1fr)]"
      data-owner-rehearsal={ownerRehearsal ? "true" : undefined}
    >
      <aside className="border-boundary bg-surface hidden min-h-0 border-r px-2 py-5 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col xl:px-4">
        <Link
          href="/"
          aria-label="Sunday Ledger home"
          className="text-registry flex h-8 shrink-0 items-center justify-center xl:hidden"
        >
          <BrandLockup
            className="text-registry"
            master="compact"
            tone="currentColor"
            variant="mark-only"
          />
        </Link>
        <Link
          href="/"
          aria-label="Sunday Ledger home"
          className="hidden shrink-0 px-2 xl:block"
        >
          <BrandLockup variant="horizontal" />
        </Link>

        <Link
          aria-label={`Switch leagues. Current league: ${leagueName}. ${nflYear}, Week ${week}, ${phaseLabel}, ${exampleMode ? "Example Season read-only" : mode === "LIVE" ? "Live season" : "Practice/test Simulation"}`}
          className="bg-subtle hover:bg-boundary/60 mt-7 flex min-h-12 shrink-0 items-center justify-center rounded-lg p-2 transition-colors xl:justify-start xl:gap-3 xl:p-3"
          href="/leagues"
          title="Switch leagues"
        >
          <span className="border-registry bg-surface text-registry flex size-9 shrink-0 items-center justify-center rounded-lg border text-xs font-bold">
            {initials(leagueName)}
          </span>
          <span className="hidden min-w-0 flex-1 xl:block">
            <span className="block truncate text-sm font-bold">
              {leagueName}
            </span>
            <span className="text-muted mt-0.5 block text-xs">
              {nflYear} · Week {week}
            </span>
            <span className="text-muted mt-0.5 block text-xs leading-4">
              {phaseLabel} ·{" "}
              {exampleMode
                ? "Example read-only"
                : mode === "LIVE"
                  ? "Live season"
                  : "Practice/test · Simulation"}
            </span>
          </span>
          <span aria-hidden="true" className="text-muted hidden xl:block">
            <InterfaceIcon name="switch" />
          </span>
        </Link>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
          <Suspense fallback={<NavigationFallback />}>
            <LeagueDesktopNav
              leagueSlug={leagueSlug}
              isCommissioner={isCommissioner}
            />
          </Suspense>
        </div>

        <div className="border-boundary shrink-0 border-t pt-3">
          <LeagueDesktopProfileMenu
            memberName={memberName}
            memberRole={memberRole}
          />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="border-boundary bg-canvas/95 sticky top-0 z-30 border-b backdrop-blur-sm">
          <div className="mx-auto flex min-h-16 max-w-[1480px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <Link
              aria-label={`Switch leagues. Current league: ${leagueName}. ${nflYear}, Week ${week}, ${phaseLabel}, ${exampleMode ? "Example Season read-only" : mode === "LIVE" ? "Live season" : "Practice/test Simulation"}`}
              className="flex min-w-0 items-center gap-3 lg:hidden"
              href="/leagues"
            >
              <span className="text-registry">
                <RegisterMark master="compact" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{leagueName}</p>
                <p className="text-muted text-xs leading-4">
                  Week {week} · {phaseLabel} ·{" "}
                  {exampleMode
                    ? "Example Season · Read-only"
                    : mode === "LIVE"
                      ? "Live season"
                      : "Practice/test · Simulation"}
                </p>
              </div>
            </Link>
            <div className="hidden lg:block">
              <p
                className="line-clamp-2 max-w-3xl text-sm font-semibold break-words"
                title={`${leagueName} / ${nflYear}`}
              >
                {leagueName} / {nflYear}
              </p>
              <p className="text-muted text-xs">
                NFL · Week {week} · {phaseLabel} ·{" "}
                {exampleMode
                  ? "Example Season · Read-only"
                  : mode === "LIVE"
                    ? "Live season"
                    : "Practice/test · Simulation"}
              </p>
            </div>
            <div className="flex items-center gap-2">
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
            </div>
          </div>
          {ownerRehearsal ? (
            <p
              className="border-registry/20 bg-registry/5 text-registry border-t px-4 py-1.5 text-center text-[11px] font-bold tracking-[0.035em] sm:px-6 sm:text-xs lg:px-8"
              role="note"
            >
              Owner rehearsal · Simulated data · Does not affect Live leagues
            </p>
          ) : null}
        </header>
        <Suspense fallback={null}>
          <LeagueMobileSecondaryNav leagueSlug={leagueSlug} />
        </Suspense>
        {ownerRehearsalGuide ? (
          <div className="mx-auto max-w-[1480px] px-4 pt-4 sm:px-6 lg:px-8">
            {ownerRehearsalGuide}
          </div>
        ) : null}
        {children}
      </div>

      <Suspense fallback={null}>
        <LeagueMobileNav
          isCommissioner={isCommissioner}
          leagueSlug={leagueSlug}
          memberName={memberName}
          memberRole={memberRole}
        />
      </Suspense>
    </div>
  );
}
