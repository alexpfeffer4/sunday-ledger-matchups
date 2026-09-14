import type { PairedMatchupDto } from "@/application/queries/project-paired-matchup";
import { formatCenticredits, formatCredits } from "@/domain/odds/american";

function credits(value: number): string {
  return formatCenticredits(BigInt(value), true);
}

export function ScorePath({ matchup }: { matchup: PairedMatchupDto }) {
  // A recorded matchup result means both cards are complete, even while the
  // rest of the weekly slate is still playing.
  if (
    matchup.resultStatus ||
    (matchup.self.outstanding?.picks === 0 &&
      matchup.opponent.outstanding?.picks === 0)
  )
    return null;

  return (
    <section
      aria-labelledby="score-path-heading"
      className="border-boundary bg-surface rounded-xl border p-5"
    >
      <div>
        <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
          Current score
        </p>
        <h2 className="mt-1 text-lg font-bold" id="score-path-heading">
          What can still be added
        </h2>
      </div>

      <dl className="score-path-facts border-boundary mt-4 grid grid-cols-2 gap-x-4 gap-y-5 border-t pt-4 sm:grid-cols-4">
        <div className="flex min-w-0 flex-col">
          <dt className="text-muted flex-1 text-xs">Starting credits</dt>
          <dd className="mt-2 font-mono font-semibold">
            {formatCredits(matchup.scorePath.startingAllocationCredits)} each
          </dd>
        </div>
        <div className="flex min-w-0 flex-col">
          <dt className="text-muted flex-1 text-xs">Your returns</dt>
          <dd className="mt-2 font-mono font-semibold">
            {credits(matchup.scorePath.selfSettledCenticredits)}
          </dd>
        </div>
        <div className="flex min-w-0 flex-col">
          <dt className="text-muted flex-1 text-xs">Your remaining upside</dt>
          <dd className="mt-2 font-mono font-semibold">
            {credits(matchup.scorePath.selfRemainingMaximumCenticredits)}
          </dd>
        </div>
        <div className="flex min-w-0 flex-col">
          <dt className="text-muted flex-1 text-xs">
            Opponent remaining upside
          </dt>
          <dd className="mt-2 font-mono font-semibold">
            {matchup.scorePath.opponentRemainingMaximumCenticredits === null
              ? "Sealed"
              : credits(matchup.scorePath.opponentRemainingMaximumCenticredits)}
          </dd>
        </div>
      </dl>

      <p className="text-muted mt-3 text-sm leading-6">
        Remaining upside includes the stakes and winnings if every outstanding
        pick wins. Opponent amounts stay sealed while their picks are hidden.
      </p>

      {matchup.scorePath.sentence ? (
        <p className="border-boundary mt-4 border-t pt-4 text-sm leading-6 font-semibold">
          {matchup.scorePath.sentence}
        </p>
      ) : null}
    </section>
  );
}
