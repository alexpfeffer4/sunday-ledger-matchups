"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function MatchupStateRefresh() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      className="bg-registry hover:bg-registry-hover text-canvas inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold disabled:cursor-wait disabled:opacity-75"
      disabled={isPending}
      onClick={() => startTransition(() => router.refresh())}
      type="button"
    >
      {isPending ? "Checking stored state…" : "Refresh matchup"}
    </button>
  );
}
