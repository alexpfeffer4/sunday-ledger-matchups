"use client";

import { useActionState, useState } from "react";
import {
  initialEmailCodeState,
  type EmailCodeAction,
} from "@/app/(auth)/auth/state";
import { emailCodeRequestError } from "@/components/auth/email-code-request-error";

export function EmailCodeForm({
  email,
  verifyCodeAction,
}: {
  email: string;
  verifyCodeAction: EmailCodeAction;
}) {
  const [code, setCode] = useState("");
  const [state, action, pending] = useActionState(
    async (previous: typeof initialEmailCodeState, data: FormData) => {
      // Safari autofill can update the input before an onChange event. Keep
      // the submitted code in memory if the request fails and React resets
      // the form. Never automatically replay a one-time credential.
      const submitted = data.get("token");
      if (typeof submitted === "string") setCode(submitted);
      try {
        return await verifyCodeAction(previous, data);
      } catch (error) {
        // A transport/action failure occurs outside the server's own catch.
        // Return an inline error instead of destroying the requesting form.
        return emailCodeRequestError(error);
      }
    },
    initialEmailCodeState,
  );
  return (
    <form
      action={action}
      className="border-boundary mt-6 space-y-4 border-t pt-5"
    >
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
          value={code}
          onChange={(event) => setCode(event.target.value)}
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
      {state.requestFailed ? (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="text-registry min-h-11 rounded-lg px-3 text-sm font-semibold underline"
        >
          Reload to request a new email
        </button>
      ) : null}
    </form>
  );
}
