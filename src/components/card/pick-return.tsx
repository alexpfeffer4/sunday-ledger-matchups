import {
  formatCenticredits,
  formatCredits,
  profitCenticredits,
  returnedCenticredits,
} from "@/domain/odds/american";

export function PickReturn({
  stakeCredits,
  americanOdds,
}: {
  stakeCredits: number;
  americanOdds: number;
}) {
  if (
    !Number.isSafeInteger(stakeCredits) ||
    stakeCredits <= 0 ||
    !Number.isSafeInteger(americanOdds) ||
    americanOdds === 0
  )
    return null;
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

export function ReturnExplanation() {
  return (
    <p className="text-graphite text-sm leading-6">
      Your score is the total returned, including your stake. A loss returns 0;
      a push or void returns your stake. Returned credits cannot be used again
      this week.
    </p>
  );
}
