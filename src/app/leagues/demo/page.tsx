import type { Metadata } from "next";
import Link from "next/link";
import { InteractiveWeekDemo } from "@/components/demo/interactive-week-demo";
import { BrandLockup } from "@/components/ui/register-mark";

export const metadata: Metadata = { title: "Practice week" };

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
            Practice week
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-[-0.04em]">
            Build a practice card
          </h1>
          <p className="text-graphite mt-3 max-w-3xl leading-7">
            Make your picks, use all 1,000 credits, and see how the matchup
            scores. Practice cards never affect your leagues.
          </p>
        </header>
        <InteractiveWeekDemo />
      </div>
    </main>
  );
}
