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
          Your card stays private, and the league record stays clear.
        </p>
        <div className="divide-boundary border-boundary mt-10 divide-y border-y">
          {[
            [
              "Sealed means sealed",
              "You can always see your own card. Opponents and commissioners cannot see your picks before they are revealed.",
            ],
            [
              "Receipts do not change",
              "Every accepted pick keeps its original line, odds, stake, and acceptance time.",
            ],
            [
              "Corrections stay visible",
              "If an official result changes, the correction stays visible and the affected scores and standings are recalculated.",
            ],
            [
              "Commissioners host",
              "Commissioners invite members and keep the season moving. They cannot view sealed cards, change scores, or choose winners.",
            ],
          ].map(([title, body]) => (
            <section
              key={title}
              className="grid gap-2 py-6 sm:grid-cols-[190px_1fr] sm:gap-8"
            >
              <h2 className="font-bold">{title}</h2>
              <p className="text-graphite leading-6">{body}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
