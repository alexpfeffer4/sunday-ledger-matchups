import type { Metadata } from "next";
import Link from "next/link";
import { BrandLockup } from "@/components/ui/register-mark";
import { pocSeason1Ruleset } from "@/rulesets/poc-season-1";

export const metadata: Metadata = { title: "Season 1 rules" };

const sections = [
  {
    title: "Your weekly card",
    body: `Every regular-season week starts with ${pocSeason1Ruleset.card.weeklyAllocationCredits.toLocaleString()} fresh virtual credits. Allocate all of them across ${pocSeason1Ruleset.card.minimumPositions}–${pocSeason1Ruleset.card.maximumPositions} positions before common lock. Stakes are whole credits with a ${pocSeason1Ruleset.card.minimumStakeCredits}-credit minimum.`,
  },
  {
    title: "Eligible positions",
    body: "Use main pregame moneyline, spread, and game-total markets. One position is allowed per event and market type; duplicates and opposing sides are prohibited.",
  },
  {
    title: "Concentration",
    body: `At −200 or longer, one position may use the full card. A favorite shorter than −200 is capped at ${pocSeason1Ruleset.concentration.heavyFavoriteSinglePositionCapCredits} credits. There is no blanket odds band or aggregate favorite cap.`,
  },
  {
    title: "Scoring",
    body: "Wins return stake plus profit, losses return zero, and pushes or voids return stake. Your weekly score is total returned credits, rounded at each receipt to 0.01 credit.",
  },
  {
    title: "Incomplete cards",
    body: `A card below ${pocSeason1Ruleset.card.weeklyAllocationCredits.toLocaleString()} credits at common lock receives an automatic loss, zero Points For, and one miss. A third regular-season miss removes playoff eligibility.`,
  },
  {
    title: "The season",
    body: "Weeks 1–14 form the regular season. Leagues of eight or fewer use a top-four bracket; leagues of ten or more use a top-six bracket with two byes. Week 17 decides the champion, and Week 18 is exhibition/history only.",
  },
];

export default function RulesPage() {
  return (
    <main className="bg-canvas min-h-screen px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" aria-label="Sunday Ledger home">
          <BrandLockup />
        </Link>
        <p className="text-registry mt-16 text-xs font-bold tracking-[0.1em] uppercase">
          Frozen participant rulebook
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-[-0.04em]">
          Season 1 rules
        </h1>
        <p className="text-graphite mt-5 text-lg leading-7">
          These values are visible before roster lock, freeze with the season,
          and remain attached to its receipts, results, standings, bracket, and
          history.
        </p>
        <div className="divide-boundary border-boundary mt-10 divide-y border-y">
          {sections.map((section) => (
            <section
              key={section.title}
              className="grid gap-3 py-6 sm:grid-cols-[180px_1fr] sm:gap-8"
            >
              <h2 className="font-bold">{section.title}</h2>
              <p className="text-graphite leading-6">{section.body}</p>
            </section>
          ))}
        </div>
        <p className="text-muted mt-8 text-sm">
          Virtual credits have no cash value, cannot be purchased, and never
          carry into a future weekly allocation.
        </p>
      </div>
    </main>
  );
}
