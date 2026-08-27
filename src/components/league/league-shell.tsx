import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import {
  LeagueDesktopNav,
  LeagueMobileNav,
} from "@/components/league/league-nav";
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
  dataLabel,
  memberName,
  memberRole,
  allocatedCredits,
  archiveMode = false,
}: {
  children: ReactNode;
  leagueSlug: string;
  leagueName: string;
  week: number;
  nflYear: number;
  mode: "LIVE" | "SIMULATION";
  dataLabel: string;
  memberName: string;
  memberRole: string;
  allocatedCredits: number;
  archiveMode?: boolean;
}) {
  return (
    <div className="bg-canvas min-h-screen lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="border-boundary bg-surface relative hidden min-h-screen border-r px-4 py-5 lg:sticky lg:top-0 lg:block lg:h-screen">
        <Link href="/" aria-label="Sunday Ledger home" className="px-2">
          <BrandLockup />
        </Link>
        <div className="bg-subtle mt-7 rounded-lg p-3">
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
        <Suspense fallback={<NavigationFallback />}>
          <LeagueDesktopNav leagueSlug={leagueSlug} archiveMode={archiveMode} />
        </Suspense>
        <div className="border-boundary absolute right-4 bottom-5 left-4 border-t pt-4">
          <div className="flex items-center gap-3 px-2">
            <span className="border-registry bg-subtle text-registry flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold">
              {initials(memberName)}
            </span>
            <div>
              <p className="text-sm font-semibold">{memberName}</p>
              <p className="text-muted text-xs">{memberRole}</p>
            </div>
          </div>
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
                <p className="text-muted text-xs">Week {week}</p>
              </div>
            </div>
            <div className="hidden lg:block">
              <p className="text-sm font-semibold">
                {leagueName} / {nflYear}
              </p>
              <p className="text-muted text-xs">{dataLabel}</p>
            </div>
            {archiveMode ? (
              <span className="text-positive inline-flex min-h-11 items-center px-3 text-sm font-semibold">
                Season final
              </span>
            ) : (
              <Link
                href={`/l/${leagueSlug}/card`}
                className="text-registry hover:bg-subtle inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold"
              >
                {allocatedCredits} / 1,000 allocated
              </Link>
            )}
          </div>
        </header>
        <div className="border-pending/20 bg-pending/10 text-pending border-b px-4 py-2 text-center text-xs font-semibold">
          {mode === "SIMULATION" ? "Simulation mode" : "Live mode"} ·{" "}
          {dataLabel} · no live or simulated data is mixed
        </div>
        {children}
      </div>

      <Suspense fallback={null}>
        <LeagueMobileNav leagueSlug={leagueSlug} archiveMode={archiveMode} />
      </Suspense>
    </div>
  );
}
