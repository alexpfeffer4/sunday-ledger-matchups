"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/app/(auth)/auth/actions";
import { initialPasswordActionState } from "@/app/(auth)/auth/state";

export function PasswordRecoveryForm() {
  const [state, action, pending] = useActionState(
    requestPasswordReset,
    initialPasswordActionState,
  );

  return (
    <form action={action} className="mt-7 space-y-5">
      <div>
        <label className="text-sm font-bold" htmlFor="recovery-email">
          Email address
        </label>
        <input
          autoComplete="email"
          className="border-control bg-surface focus:border-action mt-2 min-h-12 w-full rounded-lg border px-3 text-base"
          id="recovery-email"
          name="email"
          placeholder="you@example.com"
          required
          type="email"
        />
      </div>
      <button
        className="bg-registry hover:bg-registry-hover min-h-12 w-full rounded-lg px-5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70"
        disabled={pending}
        type="submit"
      >
        {pending ? "Sending…" : "Email recovery link"}
      </button>
      {state.status !== "idle" ? (
        <p
          className={`rounded-lg border px-4 py-3 text-sm leading-6 ${
            state.status === "success"
              ? "border-positive/25 bg-positive/10 text-positive"
              : "border-negative/25 bg-negative/10 text-negative"
          }`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
