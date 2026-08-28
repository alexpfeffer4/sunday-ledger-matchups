"use client";

import { useActionState } from "react";
import { finishPasswordRecovery } from "@/app/(auth)/auth/actions";
import { initialPasswordActionState } from "@/app/(auth)/auth/state";

const inputClass =
  "border-control bg-surface focus:border-action mt-2 min-h-12 w-full rounded-lg border px-3 text-base";

export function RecoveryPasswordForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(
    finishPasswordRecovery,
    initialPasswordActionState,
  );
  const passwordError = state.field === "password";
  const confirmationError = state.field === "confirmPassword";

  return (
    <form action={action} className="mt-7 space-y-5">
      <input name="next" type="hidden" value={next} />
      <div>
        <label className="text-sm font-bold" htmlFor="recovery-password">
          New password
        </label>
        <input
          aria-describedby={
            passwordError ? "recovery-password-error" : undefined
          }
          aria-invalid={passwordError}
          autoComplete="new-password"
          className={inputClass}
          id="recovery-password"
          maxLength={128}
          minLength={8}
          name="password"
          required
          type="password"
        />
        {passwordError ? (
          <p
            className="text-negative mt-2 text-sm"
            id="recovery-password-error"
          >
            {state.message}
          </p>
        ) : null}
      </div>
      <div>
        <label
          className="text-sm font-bold"
          htmlFor="recovery-confirm-password"
        >
          Confirm password
        </label>
        <input
          aria-describedby={
            confirmationError ? "recovery-confirm-password-error" : undefined
          }
          aria-invalid={confirmationError}
          autoComplete="new-password"
          className={inputClass}
          id="recovery-confirm-password"
          maxLength={128}
          minLength={8}
          name="confirmPassword"
          required
          type="password"
        />
        {confirmationError ? (
          <p
            className="text-negative mt-2 text-sm"
            id="recovery-confirm-password-error"
          >
            {state.message}
          </p>
        ) : null}
      </div>
      {state.status === "error" && !state.field ? (
        <p
          className="border-negative/25 bg-negative/10 text-negative rounded-lg border px-4 py-3 text-sm leading-6"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}
      <button
        className="bg-registry hover:bg-registry-hover min-h-12 w-full rounded-lg px-5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving password…" : "Save password and continue"}
      </button>
    </form>
  );
}
