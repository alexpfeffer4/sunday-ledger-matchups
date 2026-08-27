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
            West 21st Ledger · Week 6
          </p>
          <p className="text-graphite mt-1 text-sm">
            Common lock Sunday · 12:55 PM ET
          </p>
        </div>
        <StatusBadge tone="sealed" icon={<span aria-hidden="true">●</span>}>
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
            <p className="text-sm font-semibold">
              650 allocated · 350 remaining
            </p>
            <p className="text-graphite mt-1 text-xs">3 of 20 positions used</p>
          </div>
          <p className="text-sealed text-xs font-medium">Opponent sealed</p>
        </div>
        <div
          aria-label="650 of 1,000 credits allocated"
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
          <p className="text-registry text-xs font-bold tracking-[0.1em] uppercase">
            Private NFL leagues · virtual credits only
          </p>
          <h1 className="text-ink mt-5 max-w-3xl text-[2.5rem] leading-[1.05] font-bold tracking-[-0.045em] sm:text-6xl">
            Beat one friend every week. Build a season worth remembering.
          </h1>
          <p className="text-graphite mt-6 max-w-xl text-lg leading-7">
            Start with the same fresh 1,000 credits. Build a sealed card at real
            pregame odds. Turn every Sunday into a matchup, a record, and a
            playoff race.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href={accountHref} className="sm:min-w-48">
              {authenticated ? "Open your leagues" : "Start an NFL league"}
            </ButtonLink>
            <ButtonLink
              href="/l/west-21st-ledger/matchup"
              variant="secondary"
              className="sm:min-w-48"
            >
              Open simulation preview
            </ButtonLink>
          </div>
          <p className="text-muted mt-5 text-sm">
            Free · private · no purchases · virtual credits have no cash value
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
              "Allocate all 1,000 credits across main pregame NFL markets. Concentrate or diversify within the frozen season rules.",
            ],
            [
              "02",
              "Beat one opponent",
              "Cards stay sealed. Positions reveal by event, returned credits become the paired weekly score, and the higher score wins.",
            ],
            [
              "03",
              "Climb the table",
              "Matchup records lead. Points For and all-play add context before deterministic playoffs decide the champion.",
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
        <p className="text-registry text-xs font-bold tracking-[0.1em] uppercase">
          The trust model
        </p>
        <h2 className="mx-auto mt-4 max-w-3xl text-3xl font-bold tracking-[-0.035em] sm:text-4xl">
          Your decisions stay private. The season stays on the record.
        </h2>
        <p className="text-graphite mx-auto mt-5 max-w-2xl leading-7">
          Opponents and commissioners cannot inspect unrevealed cards. Accepted
          positions become permanent receipts, and objective corrections append
          visibly instead of rewriting history.
        </p>
        <ButtonLink href="/trust" variant="tertiary" className="mt-6">
          Read rules &amp; trust
        </ButtonLink>
      </section>

      <footer className="border-boundary border-t">
        <div className="text-muted mx-auto flex max-w-7xl flex-col justify-between gap-4 px-5 py-8 text-sm sm:flex-row sm:px-8">
          <BrandLockup />
          <p>Free · private · virtual credits only · no cash value</p>
        </div>
      </footer>
    </main>
  );
}
