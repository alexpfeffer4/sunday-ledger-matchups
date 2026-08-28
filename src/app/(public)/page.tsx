import Link from "next/link";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import { isSupabaseConfigured } from "@/adapters/supabase/config";
import { ButtonLink } from "@/components/ui/button-link";
import { BrandLockup } from "@/components/ui/register-mark";
import { StatusBadge } from "@/components/ui/status-badge";

async function isAuthenticated(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getClaims();
    return Boolean(data?.claims?.sub);
  } catch {
    return false;
  }
}

function MatchupPreview() {
  return (
    <div className="border-boundary bg-surface relative mx-auto w-full max-w-2xl rounded-xl border p-5 shadow-[var(--shadow-card)] sm:p-7">
      <div className="border-boundary mb-5 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <p className="text-muted text-xs font-semibold tracking-[0.08em] uppercase">
            Sample League · Week 6
          </p>
          <p className="text-graphite mt-1 text-sm">
            Cards lock Sunday · 12:55 PM ET
          </p>
        </div>
        <StatusBadge
          tone="sealed"
          icon={
            <span
              aria-hidden="true"
              className="bg-sealed size-1.5 rounded-full"
            />
          }
        >
          Cards open
        </StatusBadge>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-7">
        <div className="min-w-0 text-center">
          <div className="border-registry bg-subtle text-registry mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 text-lg font-bold">
            AP
          </div>
          <p className="mt-3 truncate font-bold">Pfeff</p>
          <p className="text-graphite text-sm">3–2 · No. 5 seed</p>
        </div>
        <div className="text-center">
          <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
            vs
          </p>
          <p className="text-graphite mt-2 font-mono text-sm font-semibold">
            1,000 each
          </p>
        </div>
        <div className="min-w-0 text-center">
          <div className="border-copper bg-subtle text-copper mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 text-lg font-bold">
            MC
          </div>
          <p className="mt-3 truncate font-bold">Mia</p>
          <p className="text-graphite text-sm">4–1 · No. 2 seed</p>
        </div>
      </div>

      <div className="bg-subtle mt-7 rounded-lg p-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">650 used · 350 left</p>
            <p className="text-graphite mt-1 text-xs">3 picks on your card</p>
          </div>
          <p className="text-sealed text-xs font-medium">Opponent sealed</p>
        </div>
        <div
          aria-label="650 of 1,000 credits used"
          className="bg-boundary mt-3 h-2 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={1000}
          aria-valuenow={650}
        >
          <div className="bg-registry h-full w-[65%] rounded-full" />
        </div>
      </div>
    </div>
  );
}

export default async function HomePage() {
  const authenticated = await isAuthenticated();
  const accountHref = authenticated ? "/leagues" : "/auth/sign-in";
  const startHref = authenticated
    ? "/leagues"
    : "/auth/create-account?next=%2Fleagues";

  return (
    <main className="bg-canvas min-h-screen">
      <header className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link aria-label="Sunday Ledger home" href="/">
          <BrandLockup />
        </Link>
        <nav
          aria-label="Public navigation"
          className="flex items-center gap-1 sm:gap-5"
        >
          <Link
            className="text-graphite hover:text-ink hidden min-h-11 items-center px-2 text-sm font-medium sm:flex"
            href="#how-it-works"
          >
            How it works
          </Link>
          <Link
            className="text-graphite hover:text-ink hidden min-h-11 items-center px-2 text-sm font-medium sm:flex"
            href="/rules"
          >
            Rules
          </Link>
          <ButtonLink href={accountHref} variant="secondary">
            {authenticated ? "Your leagues" : "Sign in"}
          </ButtonLink>
        </nav>
      </header>

      <section className="mx-auto grid max-w-7xl gap-12 px-5 pt-16 pb-20 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16 lg:pt-24 lg:pb-28">
        <div>
          <p className="text-registry text-sm font-semibold">
            Weekly NFL matchup leagues
          </p>
          <h1 className="text-ink mt-5 max-w-3xl text-[2.5rem] leading-[1.05] font-bold tracking-[-0.045em] sm:text-6xl">
            Build your card. Beat your matchup.
          </h1>
          <p className="text-graphite mt-6 max-w-xl text-lg leading-7">
            Every week, each member gets 1,000 virtual credits to allocate
            across real NFL lines. Returned credits become the score.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href={startHref} className="sm:min-w-48">
              {authenticated ? "Open your leagues" : "Start a league"}
            </ButtonLink>
            <ButtonLink
              href="/leagues/demo"
              variant="secondary"
              className="sm:min-w-48"
            >
              Try a practice week
            </ButtonLink>
          </div>
          <p className="text-muted mt-5 text-sm">
            Free to play · virtual credits have no cash value
          </p>
        </div>
        <MatchupPreview />
      </section>

      <section
        id="how-it-works"
        className="border-boundary bg-surface border-y"
      >
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 md:grid-cols-3 md:py-20">
          {[
            [
              "01",
              "Build your card",
              "Use all 1,000 credits across winner, spread, and total picks before cards lock.",
            ],
            [
              "02",
              "Beat one opponent",
              "Cards stay sealed until kickoff. Returned credits become your weekly score, and the higher score wins.",
            ],
            [
              "03",
              "Climb the table",
              "Build your record, track the playoff race, and play through Week 17 for the championship.",
            ],
          ].map(([number, title, description]) => (
            <article key={number} className="border-registry border-t-2 pt-5">
              <p className="text-registry font-mono text-xs font-semibold">
                {number}
              </p>
              <h2 className="mt-3 text-xl font-bold tracking-[-0.02em]">
                {title}
              </h2>
              <p className="text-graphite mt-3 leading-6">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-16 text-center sm:px-8 md:py-24">
        <p className="text-registry text-sm font-semibold">Fair play</p>
        <h2 className="mx-auto mt-4 max-w-3xl text-3xl font-bold tracking-[-0.035em] sm:text-4xl">
          Sealed picks. Transparent scoring.
        </h2>
        <p className="text-graphite mx-auto mt-5 max-w-2xl leading-7">
          Picks stay hidden until their events begin. Every card keeps the
          accepted line and odds, and any official correction remains visible.
        </p>
        <ButtonLink href="/trust" variant="tertiary" className="mt-6">
          See rules &amp; scoring
        </ButtonLink>
      </section>

      <footer className="border-boundary border-t">
        <div className="text-muted mx-auto flex max-w-7xl flex-col justify-between gap-4 px-5 py-8 text-sm sm:flex-row sm:px-8">
          <BrandLockup />
          <div className="flex items-center gap-5">
            <Link className="hover:text-ink" href="/rules">
              Rules
            </Link>
            <Link className="hover:text-ink" href="/trust">
              Trust
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
