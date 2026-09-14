import type { Metadata } from "next";
import Link from "next/link";
import { BrandLockup } from "@/components/ui/register-mark";
import { formatCredits } from "@/domain/odds/american";
import { pocSeason1Ruleset } from "@/rulesets/poc-season-1";

export const metadata: Metadata = { title: "Season 1 rules" };

const sections = [
  {
    title: "Your weekly card",
    body: `Every regular-season week starts with ${formatCredits(pocSeason1Ruleset.card.weeklyAllocationCredits)} fresh virtual credits. Use all of them across ${pocSeason1Ruleset.card.minimumPositions}–${pocSeason1Ruleset.card.maximumPositions} picks before cards lock. Each pick uses whole credits with a ${formatCredits(pocSeason1Ruleset.card.minimumStakeCredits)}-credit minimum.`,
  },
  {
    title: "Eligible picks",
    body: "Choose from pregame winner, spread, and game-total markets. You may make one pick per game and market type, with no duplicates or opposing sides.",
  },
  {
    title: "Concentration",
    body: `At −200 or longer, one pick may use the full card. A favorite shorter than −200 is capped at ${formatCredits(pocSeason1Ruleset.concentration.heavyFavoriteSinglePositionCapCredits)} credits.`,
  },
  {
    title: "Scoring",
    body: "Wins return stake plus profit, losses return zero, and pushes or voids return stake. Your weekly score is total returned credits, rounded at each receipt to 0.01 credit.",
  },
  {
    title: "Incomplete cards",
    body: `A card below ${formatCredits(pocSeason1Ruleset.card.weeklyAllocationCredits)} credits when cards lock receives an automatic loss, zero Points For, and one miss. A third regular-season miss removes playoff eligibility.`,
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
          <BrandLockup variant="horizontal" />
        </Link>
        <p className="text-registry mt-16 text-xs font-bold tracking-[0.1em] uppercase">
          How the league works
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-[-0.04em]">
          Season 1 rules
        </h1>
        <p className="text-graphite mt-5 text-lg leading-7">
          Every member plays by the same rules within a week. Your league’s
          Rules page identifies the version for that week. Submission and
          scoring changes apply only to unopened future weeks.
        </p>
        <section className="border-boundary mt-8 rounded-lg border p-5">
          <h2 className="font-bold">Submission rules depend on your week</h2>
          <p className="text-graphite mt-2 leading-6">
            The baseline below describes Rules v1.2. Weeks using v1.3 allow one
            or several bets per submission until each game’s kickoff. Submitted
            bets are permanent; partial cards score normally, and unused credits
            expire at the final game’s cutoff. Only zero submitted bets creates
            a missed week. An already-open week keeps its existing submission,
            deadline and scoring rules.
          </p>
        </section>
        <section className="border-boundary mt-5 rounded-lg border p-5">
          <h2 className="font-bold">Selected games are visible now</h2>
          <p className="text-graphite mt-2 leading-6">
            League members see each selected game immediately after a successful
            submission, including games already selected in the current week. A
            game appears once even when someone has several bets on it. The
            actual bets and per-game counts stay hidden until the game’s start
            is confirmed. Drafts remain private. This visibility change does not
            reopen betting or change existing credits, receipts or results.
          </p>
        </section>
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
