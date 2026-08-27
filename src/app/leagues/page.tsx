import type { Metadata } from "next";
import Link from "next/link";
import { BrandLockup } from "@/components/ui/register-mark";

export const metadata: Metadata = { title: "Your leagues" };

export default function LeaguesPage() {
  return (
    <main className="bg-canvas min-h-screen px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/" aria-label="Sunday Ledger home">
          <BrandLockup />
        </Link>
        <div className="mt-16 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-registry text-xs font-bold tracking-[0.1em] uppercase">
              League home
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-[-0.04em]">
              Your leagues
            </h1>
            <p className="text-graphite mt-3 max-w-2xl leading-7">
              Live memberships will load from Supabase after the authorized
              project connection. The deterministic simulation remains separate.
            </p>
          </div>
          <button
            type="button"
            disabled
            className="border-control text-muted min-h-11 cursor-not-allowed rounded-lg border px-5 text-sm font-semibold"
          >
            Create league after connection
          </button>
        </div>
        <section className="border-registry bg-surface mt-8 rounded-xl border p-6 shadow-[var(--shadow-card)]">
          <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
            Simulation · deterministic fixture
          </p>
          <div className="mt-3 flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-bold">West 21st Ledger</h2>
              <p className="text-graphite mt-2 text-sm">
                NFL · 2026 · Week 6 · Cards open
              </p>
            </div>
            <Link
              href="/l/west-21st-ledger/matchup"
              className="border-registry bg-registry hover:bg-registry-hover inline-flex min-h-11 items-center justify-center rounded-lg border px-5 text-sm font-semibold text-white"
            >
              Open simulation
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
