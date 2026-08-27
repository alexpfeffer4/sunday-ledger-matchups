export function AllocationMeter({
  allocatedCredits,
  remainingCredits,
  positionCount,
  maximumPositions,
  weeklyAllocationCredits,
  commonLockLabel,
}: {
  allocatedCredits: number;
  remainingCredits: number;
  positionCount: number;
  maximumPositions: number;
  weeklyAllocationCredits: number;
  commonLockLabel: string;
}) {
  const percentage = (allocatedCredits / weeklyAllocationCredits) * 100;

  return (
    <div className="bg-subtle rounded-lg p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-semibold">
            {allocatedCredits.toLocaleString()} allocated ·{" "}
            {remainingCredits.toLocaleString()} remaining
          </p>
          <p className="text-graphite mt-1 text-sm">
            {positionCount} of {maximumPositions} positions used
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
            Common lock
          </p>
          <p className="mt-1 text-sm font-semibold">{commonLockLabel}</p>
        </div>
      </div>
      <div
        aria-label={`${allocatedCredits} of ${weeklyAllocationCredits} credits allocated`}
        aria-valuemax={weeklyAllocationCredits}
        aria-valuemin={0}
        aria-valuenow={allocatedCredits}
        className="bg-boundary mt-4 h-2.5 overflow-hidden rounded-full"
        role="progressbar"
      >
        <div
          className="bg-registry h-full rounded-full transition-[width] duration-200"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
