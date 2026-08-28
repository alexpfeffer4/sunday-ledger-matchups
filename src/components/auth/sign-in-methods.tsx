"use client";

import { useState } from "react";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { PasswordSignInForm } from "@/components/auth/password-sign-in-form";

type SignInMethod = "password" | "email";

export function SignInMethods({
  next,
  defaultMethod = "password",
}: {
  next: string;
  defaultMethod?: SignInMethod;
}) {
  const [method, setMethod] = useState<SignInMethod>(defaultMethod);

  return (
    <div className="mt-7">
      <div
        aria-label="Sign-in method"
        className="border-boundary bg-subtle grid grid-cols-2 rounded-lg border p-1"
        role="tablist"
      >
        <button
          aria-controls="password-sign-in-panel"
          aria-selected={method === "password"}
          className={`min-h-10 rounded-md px-3 text-sm font-semibold transition-colors ${
            method === "password"
              ? "bg-surface text-ink shadow-sm"
              : "text-muted hover:text-ink"
          }`}
          id="password-sign-in-tab"
          onClick={() => setMethod("password")}
          role="tab"
          type="button"
        >
          Password
        </button>
        <button
          aria-controls="email-sign-in-panel"
          aria-selected={method === "email"}
          className={`min-h-10 rounded-md px-3 text-sm font-semibold transition-colors ${
            method === "email"
              ? "bg-surface text-ink shadow-sm"
              : "text-muted hover:text-ink"
          }`}
          id="email-sign-in-tab"
          onClick={() => setMethod("email")}
          role="tab"
          type="button"
        >
          Email link
        </button>
      </div>

      <div
        aria-labelledby={
          method === "password" ? "password-sign-in-tab" : "email-sign-in-tab"
        }
        id={
          method === "password"
            ? "password-sign-in-panel"
            : "email-sign-in-panel"
        }
        role="tabpanel"
      >
        {method === "password" ? (
          <PasswordSignInForm next={next} />
        ) : (
          <MagicLinkForm next={next} />
        )}
      </div>
    </div>
  );
}
