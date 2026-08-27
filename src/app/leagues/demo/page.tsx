import type { Metadata } from "next";
import Link from "next/link";
import { InteractiveWeekDemo } from "@/components/demo/interactive-week-demo";
import { BrandLockup } from "@/components/ui/register-mark";

export const metadata: Metadata = { title: "Solo betting demo" };

export default function InteractiveDemoPage() {
  return (
    <main className="bg-canvas min-h-screen px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-[1480px]">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="Sunday Ledger home">
            <BrandLockup />
          </Link>
          <Link
            className="text-action inline-flex min-h-11 items-center text-sm font-semibold hover:underline"
            href="/leagues"
          >
            ← Your leagues
          </Link>
        </div>
        <header className="mt-14">
          <p className="text-registry text-xs font-bold tracking-[0.1em] uppercase">
            Preview lab · fictional test data
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-[-0.04em]">
            Test the weekly betting flow
          </h1>
          <p className="text-graphite mt-3 max-w-3xl leading-7">
            Build a private 1,000-credit card, exercise the real stake and odds
            guardrails, see the opponent remain sealed in the interface through
            lock, then reveal and settle a fictional head-to-head matchup.
            Nothing on this page writes to Supabase or changes a real league.
          </p>
        </header>
        <InteractiveWeekDemo />
      </div>
    </main>
  );
}
