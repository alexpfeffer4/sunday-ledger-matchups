"use client";

import { useActionState } from "react";
import { verifyEmailCode } from "@/app/(auth)/auth/verify-code";
import { initialEmailCodeState } from "@/app/(auth)/auth/state";

export function EmailCodeForm({
  email,
  flow,
  next,
}: {
  email: string;
  flow: "create-account" | "sign-in" | "recovery";
  next: string;
}) {
  const [state, action, pending] = useActionState(
    verifyEmailCode,
    initialEmailCodeState,
  );
  return (
    <form
      action={action}
      className="border-boundary mt-6 space-y-4 border-t pt-5"
    >
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="flow" value={flow} />
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email-code" className="text-sm font-bold">
          Email verification code
        </label>
        <p id="email-code-help" className="text-muted mt-2 text-xs leading-5">
          For {email}: if your email includes a code, enter it here to stay in
          this browser. Otherwise, copy the email link into this browser’s
          address bar.
        </p>
        <input
          id="email-code"
          name="token"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          pattern="[0-9]{6,10}"
          minLength={6}
          maxLength={10}
          required
          aria-describedby={
            state.status === "error"
              ? "email-code-help email-code-error"
              : "email-code-help"
          }
          aria-invalid={state.status === "error"}
          className="border-control bg-surface focus:border-action mt-2 min-h-12 w-full rounded-lg border px-3 text-base"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="bg-registry hover:bg-registry-hover min-h-12 w-full rounded-lg px-5 text-sm font-semibold text-white disabled:opacity-70"
      >
        {pending ? "Verifying…" : "Verify code and continue"}
      </button>
      {state.status === "error" ? (
        <p
          role="alert"
          id="email-code-error"
          className="text-negative text-sm leading-6"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
