import type { Metadata } from "next";
import Link from "next/link";
import { BrandLockup } from "@/components/ui/register-mark";

export const metadata: Metadata = { title: "Rules & trust" };

export default function TrustPage() {
  return (
    <main className="bg-canvas min-h-screen px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" aria-label="Sunday Ledger home">
          <BrandLockup variant="horizontal" />
        </Link>
        <p className="text-registry mt-16 text-xs font-bold tracking-[0.1em] uppercase">
          Rules &amp; trust
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-[-0.04em]">
          Trust is part of the game.
        </h1>
        <p className="text-graphite mt-5 text-lg leading-7">
          Your unrevealed bet details stay private, and the league record stays
          clear.
        </p>
        <div className="divide-boundary border-boundary mt-10 divide-y border-y">
          {[
            [
              "Bet details stay private",
              "You can always see your own bets. League members see each selected game immediately after a successful submission, including games already selected in the current week. Each game appears once. Markets, selections, lines, odds, individual stakes and per-game counts remain hidden until the game’s start is confirmed. Commissioners have the same privacy boundary. Showing selected games does not reopen betting or change the submission rules for an existing week.",
            ],
            [
              "Totals have their own timing",
              "Whole-card unsettled bet counts and original stake totals become visible five minutes before the first eligible game, including hidden bets. Under supported rolling rules, available or expired credits appear in that same window. These totals can reveal information when someone has selected only one game; drafts never become public.",
            ],
            [
              "Receipts do not change",
              "Every accepted pick keeps its original line, odds, stake, and acceptance time.",
            ],
            [
              "Featured player choices",
              "Where player props are enabled, each team’s featured QB, RB and WR or TE are chosen from the highest available standard passing, rushing and receiving lines. They are not confirmed starters, and a posted line does not guarantee availability or participation. Under progressive availability, the commissioner reviews the available players and approves automatic additions to eligible empty slots before each game’s betting cutoff. Each player stays fixed from first publication. Earlier rules keep their original menu-freeze policy.",
            ],
            [
              "Player results can take longer",
              "Where player props are enabled, expect results overnight after games finish, with later updates possible. A bet stays awaiting player results until the evidence needed to grade or void it is verified. Missing data never counts as zero or proves that a player did not participate.",
            ],
            [
              "Corrections stay visible",
              "If an official result changes, the correction stays visible and is applied through the week’s correction rules. Protected postseason and historical results follow their governing review process.",
            ],
            [
              "Commissioners host",
              "Commissioners invite members and keep the season moving. They cannot view unrevealed bet details, directly edit scores, or choose winners.",
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
          <section className="grid gap-2 py-6 sm:grid-cols-[190px_1fr] sm:gap-8">
            <h2 className="font-bold">Data attribution</h2>
            <p className="text-graphite leading-6">
              Where player props are enabled, roster, published player-total and
              offensive-snap data include work by the{" "}
              <a
                className="text-registry underline"
                href="https://github.com/nflverse/nflverse-data"
              >
                nflverse project
              </a>{" "}
              under{" "}
              <a
                className="text-registry underline"
                href="https://creativecommons.org/licenses/by/4.0/"
              >
                Creative Commons Attribution 4.0
              </a>
              . Sunday Ledger normalizes player identities and data formats and
              applies the league’s selection and settlement rules. The nflverse
              project does not endorse Sunday Ledger.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
