import type { Metadata } from "next";
import Link from "next/link";
import { BrandLockup } from "@/components/ui/register-mark";

export const metadata: Metadata = { title: "Rules & trust" };

export default function TrustPage() {
  return (
    <main className="bg-canvas min-h-screen px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" aria-label="Sunday Ledger home">
          <BrandLockup />
        </Link>
        <p className="text-registry mt-16 text-xs font-bold tracking-[0.1em] uppercase">
          Rules &amp; trust
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-[-0.04em]">
          Trust is part of the game.
        </h1>
        <p className="text-graphite mt-5 text-lg leading-7">
          Sunday Ledger keeps competitive truth narrow, private, and
          explainable.
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {[
            [
              "Sealed means sealed",
              "You can always see your accepted card. Opponents and commissioners receive no unrevealed position content or hidden-count metadata.",
            ],
            [
              "Receipts do not change",
              "Each accepted proposition, line, price, stake, source time, and ruleset stays attached to one permanent receipt.",
            ],
            [
              "Corrections stay visible",
              "An objective result correction appends a new version and explains every score, matchup, standings, eligibility, or bracket consequence.",
            ],
            [
              "Commissioners host",
              "Commissioners operate named league actions. They cannot view sealed cards, rewrite receipts, select winners, or privately waive rules.",
            ],
          ].map(([title, body]) => (
            <section
              key={title}
              className="border-boundary bg-surface rounded-xl border p-6"
            >
              <h2 className="text-lg font-bold">{title}</h2>
              <p className="text-graphite mt-3 leading-6">{body}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
