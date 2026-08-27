"use client";

import { useFormStatus } from "react-dom";
import { runDemoSeasonAction } from "@/app/leagues/actions";

function RunDemoSeasonButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="border-champion bg-champion inline-flex min-h-11 items-center justify-center rounded-lg border px-5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={!enabled || pending}
      type="submit"
    >
      {pending ? "Running all 18 weeks…" : "Run demo season"}
    </button>
  );
}

export function DemoSeasonRunner({ enabled }: { enabled: boolean }) {
  return (
    <div className="sm:text-right">
      <form action={runDemoSeasonAction}>
        <RunDemoSeasonButton enabled={enabled} />
      </form>
      <p className="text-muted mt-2 text-xs">
        {enabled
          ? "Available on this Preview deployment"
          : "Disabled on Production"}
      </p>
    </div>
  );
}
