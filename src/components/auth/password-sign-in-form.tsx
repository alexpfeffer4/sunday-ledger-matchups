"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signInWithPassword } from "@/app/(auth)/auth/actions";
import { initialPasswordActionState } from "@/app/(auth)/auth/state";

export function PasswordSignInForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(
    signInWithPassword,
    initialPasswordActionState,
  );
  const emailError = state.status === "error" && state.field === "email";
  const passwordError = state.status === "error" && state.field === "password";

  return (
    <form action={formAction} className="mt-7 space-y-5">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="password-email" className="text-sm font-bold">
          Email address
        </label>
        <input
          id="password-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="border-control bg-surface focus:border-action mt-2 min-h-12 w-full rounded-lg border px-3 text-base"
          placeholder="you@example.com"
          aria-describedby={emailError ? "password-email-error" : undefined}
          aria-invalid={emailError}
        />
        {emailError ? (
          <p className="text-negative mt-2 text-sm" id="password-email-error">
            {state.message}
          </p>
        ) : null}
      </div>
      <div>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="password" className="text-sm font-bold">
            Password
          </label>
          <Link
            className="text-action min-h-11 content-center text-xs font-semibold hover:underline"
            href={`/auth/recover?next=${encodeURIComponent(next)}`}
          >
            Forgot password?
          </Link>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          minLength={8}
          required
          className="border-control bg-surface focus:border-action mt-2 min-h-12 w-full rounded-lg border px-3 text-base"
          aria-describedby={passwordError ? "password-error" : undefined}
          aria-invalid={passwordError}
        />
        {passwordError ? (
          <p className="text-negative mt-2 text-sm" id="password-error">
            {state.message}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="border-registry bg-registry hover:border-registry-hover hover:bg-registry-hover min-h-12 w-full rounded-lg border px-5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "Signing in…" : "Sign in with password"}
      </button>
      {state.status === "error" && !emailError && !passwordError ? (
        <p
          role="alert"
          className="border-negative/25 bg-negative/10 text-negative rounded-lg border px-4 py-3 text-sm leading-6"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
