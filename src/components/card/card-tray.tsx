"use client";

import { useEffect, useRef, useState } from "react";
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
  const trayRef = useRef<HTMLElement>(null);
  const [trayHeight, setTrayHeight] = useState(0);
  const hasPicks = pickCount > 0;

  useEffect(() => {
    if (!hasPicks || !trayRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setTrayHeight(entry.target.getBoundingClientRect().height);
    });
    observer.observe(trayRef.current);
    return () => observer.disconnect();
  }, [hasPicks]);

  if (!hasPicks) return null;

  return (
    <>
      {/* Reserve the actual tray height as text grows. The league page already
          reserves its navigation height; both controls must remain reachable. */}
      <div
        aria-hidden="true"
        className="lg:hidden"
        style={{ height: `calc(${trayHeight}px + 1.5rem)` }}
      />
      <section
        aria-label="Working card"
        ref={trayRef}
        className={`border-boundary bg-surface fixed inset-x-3 z-50 rounded-xl border p-3 shadow-[var(--shadow-modal)] lg:hidden ${
          aboveMobileNavigation
            ? "bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)]"
            : "bottom-[calc(env(safe-area-inset-bottom)+0.75rem)]"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1 basis-40">
            <p className="text-sm font-semibold">
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
    </>
  );
}
