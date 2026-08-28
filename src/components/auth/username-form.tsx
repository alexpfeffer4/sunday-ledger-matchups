"use client";

import { useActionState } from "react";
import { updateUsername } from "@/app/account/actions";
import { initialUsernameActionState } from "@/app/account/state";

export function UsernameForm({ currentUsername }: { currentUsername: string }) {
  const [state, formAction, pending] = useActionState(
    updateUsername,
    initialUsernameActionState,
  );

  return (
    <form action={formAction} className="mt-7 space-y-5">
      <div>
        <label htmlFor="username" className="text-sm font-bold">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="nickname"
          defaultValue={currentUsername}
          minLength={2}
          maxLength={30}
          pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
          required
          aria-describedby="username-help"
          className="border-control bg-surface focus:border-action mt-2 min-h-12 w-full rounded-lg border px-3 text-base"
        />
        <p id="username-help" className="text-muted mt-2 text-xs leading-5">
          This is the name other league members see. Use 2–30 letters, numbers,
          periods, underscores, or hyphens. Your email stays private.
        </p>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="border-registry bg-registry hover:border-registry-hover hover:bg-registry-hover min-h-12 w-full rounded-lg border px-5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "Saving…" : "Save username"}
      </button>
      {state.status !== "idle" ? (
        <p
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm leading-6 ${
            state.status === "success"
              ? "border-positive/25 bg-positive/10 text-positive"
              : "border-negative/25 bg-negative/10 text-negative"
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
