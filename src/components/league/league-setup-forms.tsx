"use client";

import { useActionState, useState } from "react";
import { createLeagueAction, joinLeagueAction } from "@/app/leagues/actions";
import { initialAppActionState } from "@/application/actions/action-state";
import { ActionFeedback } from "@/components/forms/action-feedback";

type SetupPanel = "create" | "join" | null;

const triggerClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-semibold transition-colors";

export function LeagueSetupForms() {
  const [panel, setPanel] = useState<SetupPanel>(null);
  const [createState, createAction, creating] = useActionState(
    createLeagueAction,
    initialAppActionState,
  );
  const [joinState, joinAction, joining] = useActionState(
    joinLeagueAction,
    initialAppActionState,
  );

  return (
    <section className="border-boundary mt-8 border-y py-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold">Add a league</h2>
          <p className="text-graphite mt-1 text-sm leading-6">
            Start a private NFL league or enter an invitation code.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            aria-controls="create-league-panel"
            aria-expanded={panel === "create"}
            className={`${triggerClass} border-registry bg-registry hover:bg-registry-hover text-white`}
            onClick={() =>
              setPanel((current) => (current === "create" ? null : "create"))
            }
            type="button"
          >
            Create league
          </button>
          <button
            aria-controls="join-league-panel"
            aria-expanded={panel === "join"}
            className={`${triggerClass} border-control text-registry hover:bg-subtle`}
            onClick={() =>
              setPanel((current) => (current === "join" ? null : "join"))
            }
            type="button"
          >
            Enter invite code
          </button>
        </div>
      </div>

      {panel === "create" ? (
        <form
          action={createAction}
          className="border-boundary bg-surface mt-5 rounded-xl border p-5 sm:p-6"
          id="create-league-panel"
        >
          <h3 className="text-lg font-bold">Create a private league</h3>
          <p className="text-graphite mt-2 text-sm leading-6">
            Choose an authoritative Live or Simulation season. The mode is
            frozen when the league is created.
          </p>
          <label
            className="mt-5 block text-sm font-semibold"
            htmlFor="league-name"
          >
            League name
          </label>
          <input
            autoFocus
            className="border-control bg-surface focus:border-registry mt-2 min-h-11 w-full rounded-lg border px-3 outline-none"
            id="league-name"
            name="name"
            required
            maxLength={80}
            placeholder="Sunday League"
          />
          <fieldset className="mt-5">
            <legend className="text-sm font-semibold">Season mode</legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className="border-control has-checked:border-registry has-checked:bg-subtle flex cursor-pointer gap-3 rounded-lg border p-4">
                <input defaultChecked name="mode" type="radio" value="LIVE" />
                <span>
                  <span className="block font-semibold">Live</span>
                  <span className="text-muted mt-1 block text-xs leading-5">
                    Uses reviewed DraftKings-shaped provider observations and
                    the real clock.
                  </span>
                </span>
              </label>
              <label className="border-control has-checked:border-registry has-checked:bg-subtle flex cursor-pointer gap-3 rounded-lg border p-4">
                <input name="mode" type="radio" value="SIMULATION" />
                <span>
                  <span className="block font-semibold">Simulation</span>
                  <span className="text-muted mt-1 block text-xs leading-5">
                    Uses the approved deterministic fixture pack and a
                    commissioner-controlled clock.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>
          <button
            className="bg-registry hover:bg-registry-hover mt-5 min-h-11 w-full rounded-lg px-4 font-semibold text-white disabled:opacity-60"
            disabled={creating}
            type="submit"
          >
            {creating ? "Creating…" : "Create league"}
          </button>
          <ActionFeedback state={createState} />
        </form>
      ) : null}

      {panel === "join" ? (
        <form
          action={joinAction}
          className="border-boundary bg-surface mt-5 rounded-xl border p-5 sm:p-6"
          id="join-league-panel"
        >
          <h3 className="text-lg font-bold">Enter an invitation code</h3>
          <p className="text-graphite mt-2 text-sm leading-6">
            Most invitations open directly from the private link. Use this if
            your commissioner sent only the code.
          </p>
          <label
            className="mt-5 block text-sm font-semibold"
            htmlFor="invite-token"
          >
            Invitation code
          </label>
          <input
            autoFocus
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
      ) : null}
    </section>
  );
}
