"use client";

import { useActionState } from "react";
import { acceptStage1PositionAction } from "@/app/l/[leagueSlug]/actions";
import { initialAppActionState } from "@/application/actions/action-state";
import { ActionFeedback } from "@/components/forms/action-feedback";

export function Stage1PositionForm({
  leagueSlug,
  marketSnapshotId,
  payloadHash,
  maximumStakeCredits,
  remainingCredits,
}: {
  leagueSlug: string;
  marketSnapshotId: string;
  payloadHash: string;
  maximumStakeCredits: number;
  remainingCredits: number;
}) {
  const [state, action, pending] = useActionState(
    acceptStage1PositionAction,
    initialAppActionState,
  );
  const maximum = Math.min(maximumStakeCredits, remainingCredits);

  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="leagueSlug" value={leagueSlug} />
      <input type="hidden" name="marketSnapshotId" value={marketSnapshotId} />
      <input type="hidden" name="payloadHash" value={payloadHash} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor={`stake-${marketSnapshotId}`}>
          Credits at risk
        </label>
        <input
          className="border-control bg-surface focus:border-registry min-h-11 min-w-0 flex-1 rounded-lg border px-3 font-mono outline-none"
          id={`stake-${marketSnapshotId}`}
          name="stakeCredits"
          type="number"
          inputMode="numeric"
          min={50}
          max={maximum}
          step={1}
          defaultValue={Math.min(250, maximum)}
          required
          disabled={maximum < 50 || pending}
        />
        <button
          className="bg-registry hover:bg-registry-hover min-h-11 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-50"
          type="submit"
          disabled={maximum < 50 || pending}
        >
          {pending ? "Sealing…" : "Confirm & seal"}
        </button>
      </div>
      <ActionFeedback state={state} />
    </form>
  );
}
