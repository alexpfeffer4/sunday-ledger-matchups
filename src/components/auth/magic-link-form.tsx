"use client";

import { useActionState, useState } from "react";
import {
  sendCreateAccountLink,
  sendSignInLink,
} from "@/app/(auth)/auth/actions";
import { initialMagicLinkState } from "@/app/(auth)/auth/state";
import { useResendCooldown } from "@/components/auth/use-resend-cooldown";
import { LinkErrorNotice } from "@/components/auth/link-error-notice";

export function MagicLinkForm({
  intent = "sign-in",
  next,
  linkError,
}: {
  intent?: "create-account" | "sign-in";
  next: string;
  linkError?: string;
}) {
  const [email, setEmail] = useState("");
  const { secondsRemaining, start } = useResendCooldown();
  const [state, formAction, pending] = useActionState(
    async (previousState: typeof initialMagicLinkState, formData: FormData) => {
      const send =
        intent === "create-account" ? sendCreateAccountLink : sendSignInLink;
      const result = await send(previousState, formData);
      start(result.retryAfterSeconds);
      return result;
    },
    initialMagicLinkState,
  );
  const emailError = state.status === "error" && state.field === "email";

  return (
    <form action={formAction} className="mt-7 space-y-5">
      {linkError && state.status === "idle" ? (
        <LinkErrorNotice reason={linkError} />
      ) : null}
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email" className="text-sm font-bold">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
          className="border-control bg-surface focus:border-action mt-2 min-h-12 w-full rounded-lg border px-3 text-base"
          placeholder="you@example.com"
          aria-describedby={
            emailError ? "email-help email-error" : "email-help"
          }
          aria-invalid={emailError}
        />
        <p id="email-help" className="text-muted mt-2 text-xs leading-5">
          {intent === "create-account"
            ? "The link signs you in once, then opens required username and password setup."
            : "Email links are for existing accounts and return you directly to your destination."}
        </p>
        <p className="text-muted mt-2 text-xs leading-5">
          On your phone, open the email link in the same browser you are using
          now. You can copy the link from Mail and paste it into this browser’s
          address bar.
        </p>
        {emailError ? (
          <p id="email-error" className="text-negative mt-2 text-sm">
            {state.message}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={pending || secondsRemaining > 0}
        className="border-registry bg-registry hover:border-registry-hover hover:bg-registry-hover min-h-12 w-full rounded-lg border px-5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70"
      >
        {pending
          ? "Sending…"
          : secondsRemaining > 0
            ? `Resend available in ${secondsRemaining}s`
            : state.status === "sent"
              ? "Resend email link"
              : intent === "create-account"
                ? "Email account link"
                : "Send sign-in link"}
      </button>
      {state.status !== "idle" && !emailError ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={`rounded-lg border px-4 py-3 text-sm leading-6 ${
            state.status === "sent"
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
