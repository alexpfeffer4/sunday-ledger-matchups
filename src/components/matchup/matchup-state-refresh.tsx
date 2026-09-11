"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

export function MatchupStateRefresh({
  active = false,
  label = "Refresh matchup",
}: {
  active?: boolean;
  label?: string;
}) {
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
      className="bg-registry hover:bg-registry-hover text-canvas inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold aria-disabled:cursor-wait aria-disabled:opacity-75"
      aria-disabled={isPending}
      onClick={() => {
        if (!isPending) startTransition(() => router.refresh());
      }}
      type="button"
    >
      {isPending ? "Checking for updates…" : label}
    </button>
  );
}
