import {
  formatCenticredits,
  formatCredits,
  profitCenticredits,
  returnedCenticredits,
} from "@/domain/odds/american";

export function PickReturn({
  stakeCredits,
  americanOdds,
  compact = false,
  showBreakdown = true,
}: {
  stakeCredits: number;
  americanOdds: number;
  compact?: boolean;
  showBreakdown?: boolean;
}) {
  if (
    !Number.isSafeInteger(stakeCredits) ||
    stakeCredits <= 0 ||
    !Number.isSafeInteger(americanOdds) ||
    americanOdds === 0
  )
    return null;
  if (compact) {
    return (
      <div
        className="bg-subtle rounded-lg px-3 py-2 text-sm"
        aria-label="Return if this pick wins"
        role="group"
      >
        <dl className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <dt className="font-semibold">Total returned if won</dt>
          <dd className="text-lg font-bold whitespace-nowrap tabular-nums">
            {formatCenticredits(
              returnedCenticredits(stakeCredits, americanOdds, "WIN"),
            )}
          </dd>
        </dl>
        {showBreakdown ? (
          <p className="text-graphite mt-1 text-sm">
            Includes {formatCredits(stakeCredits)} stake +{" "}
            {formatCenticredits(profitCenticredits(stakeCredits, americanOdds))}{" "}
            profit.
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <div
      className="border-boundary bg-subtle mt-3 rounded-lg border p-3 text-sm"
      aria-label="Return if this pick wins"
      role="group"
    >
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-3">
        <div>
          <dt className="text-muted">Stake</dt>
          <dd className="mt-1 font-mono font-semibold">
            {formatCredits(stakeCredits)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Profit if won</dt>
          <dd className="mt-1 font-mono font-semibold">
            {formatCenticredits(profitCenticredits(stakeCredits, americanOdds))}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Total returned if won</dt>
          <dd className="mt-1 font-mono font-bold">
            {formatCenticredits(
              returnedCenticredits(stakeCredits, americanOdds, "WIN"),
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function ReturnExplanation({
  disclosure = false,
}: {
  disclosure?: boolean;
}) {
  const explanation = (
    <p className="text-graphite text-sm leading-6">
      Your score is the total returned, including your stake. A loss returns 0;
      a push or void returns your stake. Returned credits cannot be used again
      this week.
    </p>
  );
  return disclosure ? (
    <details className="border-boundary border-t">
      <summary className="text-action min-h-11 cursor-pointer py-3 text-sm font-semibold">
        How returns work
      </summary>
      <div className="pb-3">{explanation}</div>
    </details>
  ) : (
    explanation
  );
}
