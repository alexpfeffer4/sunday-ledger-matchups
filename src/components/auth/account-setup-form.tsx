"use client";

import { useActionState } from "react";
import { completeAccountSetup } from "@/app/account/actions";
import { initialAccountSetupState } from "@/app/account/state";

const inputClass =
  "border-control bg-surface focus:border-action mt-2 min-h-12 w-full rounded-lg border px-3 text-base";

export function AccountSetupForm({
  currentUsername,
  next,
}: {
  currentUsername: string;
  next: string;
}) {
  const [state, action, pending] = useActionState(
    completeAccountSetup,
    initialAccountSetupState,
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="mt-7 space-y-5">
      <input name="next" type="hidden" value={next} />
      <div>
        <label className="text-sm font-bold" htmlFor="setup-username">
          Username
        </label>
        <input
          aria-describedby={
            errors.username
              ? "setup-username-help setup-username-error"
              : "setup-username-help"
          }
          aria-invalid={Boolean(errors.username)}
          autoComplete="nickname"
          className={inputClass}
          defaultValue={currentUsername}
          id="setup-username"
          maxLength={30}
          minLength={2}
          name="username"
          pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
          required
        />
        <p
          className="text-muted mt-2 text-xs leading-5"
          id="setup-username-help"
        >
          Public in league member lists. Your email stays private.
        </p>
        {errors.username ? (
          <p className="text-negative mt-2 text-sm" id="setup-username-error">
            {errors.username}
          </p>
        ) : null}
      </div>
      <div>
        <label className="text-sm font-bold" htmlFor="setup-password">
          Password
        </label>
        <input
          aria-describedby={
            errors.password ? "setup-password-error" : undefined
          }
          aria-invalid={Boolean(errors.password)}
          autoComplete="new-password"
          className={inputClass}
          id="setup-password"
          maxLength={128}
          minLength={8}
          name="password"
          required
          type="password"
        />
        {errors.password ? (
          <p className="text-negative mt-2 text-sm" id="setup-password-error">
            {errors.password}
          </p>
        ) : null}
      </div>
      <div>
        <label className="text-sm font-bold" htmlFor="setup-confirm-password">
          Confirm password
        </label>
        <input
          aria-describedby={
            errors.confirmPassword ? "setup-confirm-password-error" : undefined
          }
          aria-invalid={Boolean(errors.confirmPassword)}
          autoComplete="new-password"
          className={inputClass}
          id="setup-confirm-password"
          maxLength={128}
          minLength={8}
          name="confirmPassword"
          required
          type="password"
        />
        {errors.confirmPassword ? (
          <p
            className="text-negative mt-2 text-sm"
            id="setup-confirm-password-error"
          >
            {errors.confirmPassword}
          </p>
        ) : null}
      </div>
      {state.status === "error" ? (
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
        {pending ? "Saving account…" : "Save account and continue"}
      </button>
      <p className="text-muted text-center text-xs leading-5">
        Continue unlocks only after both the username and password are saved.
      </p>
    </form>
  );
}
