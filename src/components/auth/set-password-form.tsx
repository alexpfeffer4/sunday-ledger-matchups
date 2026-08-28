"use client";

import { useActionState } from "react";
import { updatePassword } from "@/app/(auth)/auth/actions";
import { initialPasswordActionState } from "@/app/(auth)/auth/state";

export function SetPasswordForm() {
  const [state, formAction, pending] = useActionState(
    updatePassword,
    initialPasswordActionState,
  );

  return (
    <form action={formAction} className="mt-7 space-y-5">
      <div>
        <label htmlFor="new-password" className="text-sm font-bold">
          New password
        </label>
        <input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
          aria-describedby="password-requirements"
          className="border-control bg-surface focus:border-action mt-2 min-h-12 w-full rounded-lg border px-3 text-base"
        />
        <p
          id="password-requirements"
          className="text-muted mt-2 text-xs leading-5"
        >
          Use at least 8 characters. A password manager-generated password is
          best.
        </p>
      </div>
      <div>
        <label htmlFor="confirm-password" className="text-sm font-bold">
          Confirm password
        </label>
        <input
          id="confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
          className="border-control bg-surface focus:border-action mt-2 min-h-12 w-full rounded-lg border px-3 text-base"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="border-registry bg-registry hover:border-registry-hover hover:bg-registry-hover min-h-12 w-full rounded-lg border px-5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "Saving…" : "Save password"}
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
