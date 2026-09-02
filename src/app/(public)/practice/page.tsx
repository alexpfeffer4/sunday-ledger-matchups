import type { Metadata } from "next";
import Link from "next/link";
import { InteractiveWeekDemo } from "@/components/demo/interactive-week-demo";
import { ButtonLink } from "@/components/ui/button-link";
import { BrandLockup } from "@/components/ui/register-mark";
import { StatusBadge } from "@/components/ui/status-badge";
import { pocSeason1Ruleset } from "@/rulesets/poc-season-1";

export function generateMetadata(): Metadata {
  const allocation =
    pocSeason1Ruleset.card.weeklyAllocationCredits.toLocaleString();

  return {
    title: "Practice Week",
    description: `Build an unsaved ${allocation}-credit practice card from neutral example matchups. No account is required.`,
  };
}

export default function PracticePage() {
  const allocation =
    pocSeason1Ruleset.card.weeklyAllocationCredits.toLocaleString();

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
            Build a practice card
          </h1>
          <p className="text-graphite mt-4 max-w-3xl text-lg leading-7">
            Use all {allocation} virtual credits across neutral example
            matchups. This public practice is not saved and cannot affect a
            league.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/auth/create-account?next=%2Fleagues">
              Start a real league
            </ButtonLink>
            <ButtonLink
              href="/auth/sign-in?next=%2Fleagues"
              variant="secondary"
            >
              Sign in
            </ButtonLink>
            <ButtonLink href="/" variant="tertiary">
              Return home
            </ButtonLink>
          </div>
        </header>

        <InteractiveWeekDemo />
      </div>
    </main>
  );
}
