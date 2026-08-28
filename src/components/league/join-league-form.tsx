"use client";

import { useActionState } from "react";
import { joinLeagueAction } from "@/app/leagues/actions";
import { initialAppActionState } from "@/application/actions/action-state";
import { ActionFeedback } from "@/components/forms/action-feedback";

export function JoinLeagueForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(
    joinLeagueAction,
    initialAppActionState,
  );

  return (
    <form action={action} className="mt-6">
      <input name="token" type="hidden" value={token} />
      <button
        className="bg-registry hover:bg-registry-hover min-h-12 w-full rounded-lg px-5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Joining…" : "Join league"}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}
