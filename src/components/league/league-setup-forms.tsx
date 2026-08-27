"use client";

import { useActionState } from "react";
import { createLeagueAction, joinLeagueAction } from "@/app/leagues/actions";
import { initialAppActionState } from "@/application/actions/action-state";
import { ActionFeedback } from "@/components/forms/action-feedback";

export function LeagueSetupForms() {
  const [createState, createAction, creating] = useActionState(
    createLeagueAction,
    initialAppActionState,
  );
  const [joinState, joinAction, joining] = useActionState(
    joinLeagueAction,
    initialAppActionState,
  );

  return (
    <div className="mt-8 grid gap-5 lg:grid-cols-2">
      <form
        action={createAction}
        className="border-boundary bg-surface rounded-xl border p-5 sm:p-6"
      >
        <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
          Start a league
        </p>
        <h2 className="mt-2 text-xl font-bold">Create a Simulation league</h2>
        <p className="text-graphite mt-2 text-sm leading-6">
          Invite an even roster from 4 through 16 for a complete simulated
          season, or use exactly eight members for the interactive Week 1 demo.
          Rules and rosters freeze when either path publishes.
        </p>
        <label
          className="mt-5 block text-sm font-semibold"
          htmlFor="league-name"
        >
          League name
        </label>
        <input
          className="border-control bg-surface focus:border-registry mt-2 min-h-11 w-full rounded-lg border px-3 outline-none"
          id="league-name"
          name="name"
          required
          maxLength={80}
          placeholder="West 21st Ledger"
        />
        <label
          className="mt-4 block text-sm font-semibold"
          htmlFor="league-slug"
        >
          URL slug
        </label>
        <input
          className="border-control bg-surface focus:border-registry mt-2 min-h-11 w-full rounded-lg border px-3 font-mono text-sm outline-none"
          id="league-slug"
          name="slug"
          required
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          placeholder="west-21st-ledger"
        />
        <button
          className="bg-registry hover:bg-registry-hover mt-5 min-h-11 w-full rounded-lg px-4 font-semibold text-white disabled:opacity-60"
          disabled={creating}
          type="submit"
        >
          {creating ? "Creating…" : "Create private league"}
        </button>
        <ActionFeedback state={createState} />
      </form>

      <form
        action={joinAction}
        className="border-boundary bg-surface rounded-xl border p-5 sm:p-6"
      >
        <p className="text-copper text-xs font-bold tracking-[0.09em] uppercase">
          Private invitation
        </p>
        <h2 className="mt-2 text-xl font-bold">Join an existing league</h2>
        <p className="text-graphite mt-2 text-sm leading-6">
          Paste the private code your commissioner shared. The code—not your
          magic-link email—belongs here.
        </p>
        <label
          className="mt-5 block text-sm font-semibold"
          htmlFor="invite-token"
        >
          Invitation code
        </label>
        <input
          className="border-control bg-surface focus:border-registry mt-2 min-h-11 w-full rounded-lg border px-3 font-mono text-sm outline-none"
          id="invite-token"
          name="token"
          required
          autoComplete="off"
        />
        <button
          className="border-registry text-registry hover:bg-subtle mt-5 min-h-11 w-full rounded-lg border px-4 font-semibold disabled:opacity-60"
          disabled={joining}
          type="submit"
        >
          {joining ? "Joining…" : "Join league"}
        </button>
        <ActionFeedback state={joinState} />
      </form>
    </div>
  );
}
