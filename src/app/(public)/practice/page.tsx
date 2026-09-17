import type { Metadata } from "next";
import Link from "next/link";
import { InteractiveWeekDemo } from "@/components/demo/interactive-week-demo";
import { BrandLockup } from "@/components/ui/register-mark";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCredits } from "@/domain/odds/american";
import { pocSeason1Ruleset } from "@/rulesets/poc-season-1";

export function generateMetadata(): Metadata {
  const allocation = formatCredits(
    pocSeason1Ruleset.card.weeklyAllocationCredits,
  );

  return {
    title: "Practice Week",
    description: `Build an unsaved ${allocation}-credit practice card from neutral example matchups. No account is required.`,
  };
}

export default function PracticePage() {
  const allocation = formatCredits(
    pocSeason1Ruleset.card.weeklyAllocationCredits,
  );

  return (
    <main className="bg-canvas min-h-screen pb-28 lg:pb-12">
      <header className="border-boundary bg-surface/95 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-[1480px] items-center justify-between gap-4 px-5 sm:px-8">
          <Link aria-label="Sunday Ledger home" href="/">
            <BrandLockup variant="horizontal" />
          </Link>
          <div className="flex items-center gap-3">
            <StatusBadge tone="pending">Practice · Unsaved</StatusBadge>
            <Link
              className="text-action hidden min-h-11 items-center text-sm font-semibold hover:underline sm:inline-flex"
              href="/"
            >
              Exit practice
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1480px] px-5 py-9 sm:px-8 sm:py-12">
        <header>
          <p className="text-registry text-xs font-bold tracking-[0.1em] uppercase">
            Public practice week
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">
            Practice week
          </h1>
          <p className="text-graphite mt-4 max-w-3xl text-lg leading-7">
            Try picks, review and scoring with neutral examples. Your practice
            cannot affect a league.
          </p>
          <section
            aria-labelledby="practice-scope"
            className="border-boundary bg-surface mt-6 max-w-3xl rounded-lg border p-5"
          >
            <h2 id="practice-scope" className="font-bold">
              Practice uses older full-card rules
            </h2>
            <p className="text-graphite mt-2 text-sm leading-6">
              Use all {allocation} credits and seal once in this unsaved
              example. Rolling weeks let you submit separate bets.
            </p>
            <details className="mt-1 text-sm">
              <summary className="text-action min-h-11 cursor-pointer py-3 font-semibold">
                How this differs from your league
              </summary>
              <p className="text-graphite leading-6">
                In weeks with rolling submissions, submit one or more bets at a
                time. Partial cards count; accepted bets cannot be changed. You
                can use remaining credits on eligible games until each game’s
                cutoff. Unused credits expire at the final cutoff.
              </p>
              <Link
                href="/rules"
                className="text-action mt-2 inline-flex min-h-11 items-center text-sm font-semibold hover:underline"
              >
                Compare submission rules
              </Link>
              <p className="text-muted text-xs leading-5">
                Your league’s Rules page is the authority for each week,
                including historical weeks.
              </p>
            </details>
          </section>
        </header>

        <InteractiveWeekDemo />
      </div>
    </main>
  );
}
