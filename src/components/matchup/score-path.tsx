import type { PairedMatchupDto } from "@/application/queries/project-paired-matchup";
import { formatCenticredits, formatCredits } from "@/domain/odds/american";

function credits(value: number): string {
  return formatCenticredits(BigInt(value), true);
}

export function ScorePath({ matchup }: { matchup: PairedMatchupDto }) {
  return (
    <section
      aria-labelledby="score-path-heading"
      className="border-boundary bg-surface rounded-xl border p-5"
    >
      <div>
        <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
          Score path
        </p>
        <h2 className="mt-1 text-lg font-bold" id="score-path-heading">
          What has returned and what can remain
        </h2>
      </div>

      <dl className="border-boundary mt-4 grid grid-cols-2 gap-x-4 gap-y-5 border-t pt-4 sm:grid-cols-4">
        <div>
          <dt className="text-muted text-xs">Starting allocation</dt>
          <dd className="mt-1 font-mono font-semibold">
            {formatCredits(matchup.scorePath.startingAllocationCredits)} each
          </dd>
        </div>
        <div>
          <dt className="text-muted text-xs">Your settled returns</dt>
          <dd className="mt-1 font-mono font-semibold">
            {credits(matchup.scorePath.selfSettledCenticredits)}
          </dd>
        </div>
        <div>
          <dt className="text-muted text-xs">Your remaining return ceiling</dt>
          <dd className="mt-1 font-mono font-semibold">
            {credits(matchup.scorePath.selfRemainingMaximumCenticredits)}
          </dd>
        </div>
        <div>
          <dt className="text-muted text-xs">
            Opponent remaining return ceiling
          </dt>
          <dd className="mt-1 font-mono font-semibold">
            {matchup.scorePath.opponentRemainingMaximumCenticredits === null
              ? "Sealed"
              : credits(matchup.scorePath.opponentRemainingMaximumCenticredits)}
          </dd>
        </div>
      </dl>

      {matchup.scorePath.sentence ? (
        <p className="border-boundary mt-4 border-t pt-4 text-sm leading-6 font-semibold">
          {matchup.scorePath.sentence}
        </p>
      ) : null}
    </section>
  );
}
