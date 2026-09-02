"use client";

import { formatCredits } from "@/domain/odds/american";

export function CardTray({
  aboveMobileNavigation = false,
  allocatedCredits,
  onReview,
  pickCount,
  remainingCredits,
}: {
  aboveMobileNavigation?: boolean;
  allocatedCredits: number;
  onReview: () => void;
  pickCount: number;
  remainingCredits: number;
}) {
  if (pickCount === 0) return null;

  return (
    <section
      aria-label="Working card"
      className={`border-boundary bg-surface fixed inset-x-3 z-50 rounded-xl border p-3 shadow-[var(--shadow-modal)] lg:hidden ${
        aboveMobileNavigation
          ? "bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)]"
          : "bottom-[calc(env(safe-area-inset-bottom)+0.75rem)]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {pickCount} {pickCount === 1 ? "pick" : "picks"} ·{" "}
            {formatCredits(allocatedCredits)} allocated
          </p>
          <p className="text-muted mt-0.5 text-xs">
            {remainingCredits >= 0
              ? `${formatCredits(remainingCredits)} remaining`
              : `${formatCredits(Math.abs(remainingCredits))} over`}
          </p>
        </div>
        <button
          className="bg-registry hover:bg-registry-hover min-h-11 shrink-0 rounded-lg px-4 text-sm font-semibold text-white"
          onClick={onReview}
          type="button"
        >
          Review card
        </button>
      </div>
    </section>
  );
}
