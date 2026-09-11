"use client";

import { useActionState, useState } from "react";
import {
  initialPasswordActionState,
  type EmailCodeAction,
} from "@/app/(auth)/auth/state";

import { EmailCodeForm } from "@/components/auth/email-code-form";
import { LinkErrorNotice } from "@/components/auth/link-error-notice";
import { useResendCooldown } from "@/components/auth/use-resend-cooldown";

export function PasswordRecoveryForm({
  next,
  linkError,
  requestEmailAction,
}: {
  requestEmailAction: (
    state: typeof initialPasswordActionState,
    formData: FormData,
  ) => Promise<typeof initialPasswordActionState>;
  next: string;
  linkError?: string;
}) {
  const [email, setEmail] = useState("");
  const [challenge, setChallenge] = useState<{
    email: string;
    verifyCodeAction: EmailCodeAction;
    revision: number;
  } | null>(null);
  const { secondsRemaining, start } = useResendCooldown();
  const [state, action, pending] = useActionState(
    async (previous: typeof initialPasswordActionState, data: FormData) => {
      const result = await requestEmailAction(previous, data);
      start(result.retryAfterSeconds);
      if (result.email && result.verifyCode) {
        const requestedEmail = result.email;
        const verifyCodeAction = result.verifyCode;
        setChallenge((previous) => ({
          email: requestedEmail,
          verifyCodeAction,
          revision: (previous?.revision ?? 0) + 1,
        }));
      }
      return result;
    },
    initialPasswordActionState,
  );

  return (
    <>
      <form action={action} className="mt-7 space-y-5">
        {linkError && state.status === "idle" ? (
          <LinkErrorNotice reason={linkError} />
        ) : null}
        <input name="next" type="hidden" value={next} />
        <div>
          <label className="text-sm font-bold" htmlFor="recovery-email">
            Email address
          </label>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            className="border-control bg-surface focus:border-action mt-2 min-h-12 w-full rounded-lg border px-3 text-base"
            id="recovery-email"
            name="email"
            placeholder="you@example.com"
            required
            type="email"
            aria-describedby={
              state.field === "email" ? "recovery-email-error" : undefined
            }
            aria-invalid={state.field === "email"}
          />
          {state.field === "email" ? (
            <p className="text-negative mt-2 text-sm" id="recovery-email-error">
              {state.message}
            </p>
          ) : null}
        </div>
        <button
          className="bg-registry hover:bg-registry-hover min-h-12 w-full rounded-lg px-5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70"
          disabled={pending || secondsRemaining > 0}
          type="submit"
        >
          {pending
            ? "Sending…"
            : secondsRemaining > 0
              ? `Resend available in ${secondsRemaining}s`
              : "Email recovery link"}
        </button>
        {state.status !== "idle" && state.field !== "email" ? (
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
      {challenge ? (
        <EmailCodeForm
          key={challenge.revision}
          email={challenge.email}
          verifyCodeAction={challenge.verifyCodeAction}
        />
      ) : null}
    </>
  );
}
