"use client";

import { useActionState } from "react";
import {
  sendCreateAccountLink,
  sendSignInLink,
} from "@/app/(auth)/auth/actions";
import { initialMagicLinkState } from "@/app/(auth)/auth/state";

export function MagicLinkForm({
  intent = "sign-in",
  next,
}: {
  intent?: "create-account" | "sign-in";
  next: string;
}) {
  const [state, formAction, pending] = useActionState(
    intent === "create-account" ? sendCreateAccountLink : sendSignInLink,
    initialMagicLinkState,
  );
  const emailError = state.status === "error" && state.field === "email";

  return (
    <form action={formAction} className="mt-7 space-y-5">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email" className="text-sm font-bold">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
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
        {emailError ? (
          <p id="email-error" className="text-negative mt-2 text-sm">
            {state.message}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="border-registry bg-registry hover:border-registry-hover hover:bg-registry-hover min-h-12 w-full rounded-lg border px-5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70"
      >
        {pending
          ? "Sending…"
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
