"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

export function MatchupStateRefresh({ active = false }: { active?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!active || isPending) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      startTransition(() => router.refresh());
    }, 5 * 60_000);
    return () => window.clearInterval(timer);
  }, [active, isPending, router]);

  return (
    <button
      className="bg-registry hover:bg-registry-hover text-canvas inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold disabled:cursor-wait disabled:opacity-75"
      disabled={isPending}
      onClick={() => startTransition(() => router.refresh())}
      type="button"
    >
      {isPending ? "Checking updates…" : "Refresh matchup"}
    </button>
  );
}
