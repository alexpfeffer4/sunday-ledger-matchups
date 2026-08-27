"use client";

import { useMemo, useState } from "react";
import type { SlateOutcomeDto } from "@/application/queries/league-dtos";
import { formatCenticredits, profitCenticredits } from "@/domain/odds/american";

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `−${Math.abs(odds)}`;
}

export function PositionPreview({ outcome }: { outcome: SlateOutcomeDto }) {
  const [stake, setStake] = useState(350);
  const validation = useMemo(() => {
    if (!Number.isInteger(stake)) return "Use whole credits.";
    if (stake < 50) return "The minimum position is 50 credits.";
    if (stake > 350) return "Only 350 credits remain on this simulation card.";
    if (stake > outcome.maximumStakeCredits) {
      return `At ${formatOdds(outcome.americanOdds)}, this position may use at most ${outcome.maximumStakeCredits} credits.`;
    }
    const remainder = 350 - stake;
    if (remainder > 0 && remainder < 50) {
      return `${stake} would leave ${remainder} credits, below the 50-credit minimum.`;
    }
    return null;
  }, [outcome, stake]);
  const profit = validation
    ? 0n
    : profitCenticredits(stake, outcome.americanOdds);
  const returned = validation ? 0n : BigInt(stake) * 100n + profit;

  return (
    <div className="border-boundary bg-surface mt-6 rounded-xl border p-5 shadow-[var(--shadow-card)] sm:p-7">
      <div className="border-boundary flex flex-col justify-between gap-3 border-b pb-5 sm:flex-row">
        <div>
          <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
            Add position
          </p>
          <h2 className="mt-2 text-xl font-bold">{outcome.proposition}.</h2>
        </div>
        <p className="font-mono text-lg font-semibold">
          {formatOdds(outcome.americanOdds)}
        </p>
      </div>

      <div className="mt-5">
        <label htmlFor="stake" className="block text-sm font-semibold">
          Credits at risk
        </label>
        <div className="border-control bg-surface focus-within:border-registry mt-2 flex items-center rounded-lg border">
          <input
            id="stake"
            min={50}
            max={Math.min(350, outcome.maximumStakeCredits)}
            inputMode="numeric"
            type="number"
            value={stake}
            onChange={(event) => setStake(event.currentTarget.valueAsNumber)}
            className="min-h-14 min-w-0 flex-1 bg-transparent px-4 font-mono text-2xl font-semibold outline-none"
          />
          <span className="text-muted pr-4 text-sm">credits</span>
        </div>
        <p className="text-graphite mt-2 text-sm">
          At {formatOdds(outcome.americanOdds)}, this position may use up to{" "}
          {outcome.maximumStakeCredits.toLocaleString()} credits.
        </p>
        {validation ? (
          <p className="border-negative text-negative mt-3 border-l-2 pl-3 text-sm font-medium">
            {validation}
          </p>
        ) : null}
      </div>

      <div className="divide-boundary border-boundary mt-6 grid grid-cols-3 divide-x border-y py-4 text-center">
        <div>
          <p className="text-muted text-[11px] font-bold tracking-[0.07em] uppercase">
            Risk
          </p>
          <p className="mt-1 font-mono font-semibold">
            {validation ? "—" : stake}
          </p>
        </div>
        <div>
          <p className="text-muted text-[11px] font-bold tracking-[0.07em] uppercase">
            Profit if right
          </p>
          <p className="mt-1 font-mono font-semibold">
            {validation ? "—" : formatCenticredits(profit)}
          </p>
        </div>
        <div>
          <p className="text-muted text-[11px] font-bold tracking-[0.07em] uppercase">
            Total returned
          </p>
          <p className="mt-1 font-mono font-semibold">
            {validation ? "—" : formatCenticredits(returned)}
          </p>
        </div>
      </div>

      <div className="bg-subtle mt-5 rounded-lg p-4 text-sm">
        <p className="font-semibold">
          After this position: {validation ? "—" : 1_000 - (350 - stake)}{" "}
          allocated · {validation ? "—" : 350 - stake} remaining
        </p>
        <p className="text-graphite mt-1">
          Accepted entries cannot be changed or canceled.
        </p>
      </div>

      <button
        type="button"
        disabled
        className="bg-subtle text-graphite mt-5 min-h-12 w-full cursor-not-allowed rounded-lg px-5 font-semibold"
      >
        Confirm and seal
      </button>
      <p className="text-muted mt-2 text-center text-xs">
        Receipt acceptance activates after the authorized Supabase database is
        connected.
      </p>
    </div>
  );
}
