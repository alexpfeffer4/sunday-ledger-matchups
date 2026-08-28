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
        aria-label="Choose a sign-in method"
        className="border-boundary bg-subtle grid grid-cols-2 rounded-lg border p-1"
        role="group"
      >
        <button
          aria-pressed={method === "password"}
          className={`min-h-11 rounded-md border px-3 text-sm font-semibold transition-colors ${
            method === "password"
              ? "border-registry bg-surface text-ink shadow-sm"
              : "text-muted hover:text-ink border-transparent"
          }`}
          onClick={() => setMethod("password")}
          type="button"
        >
          {method === "password" ? "✓ " : ""}Password
        </button>
        <button
          aria-pressed={method === "email"}
          className={`min-h-11 rounded-md border px-3 text-sm font-semibold transition-colors ${
            method === "email"
              ? "border-registry bg-surface text-ink shadow-sm"
              : "text-muted hover:text-ink border-transparent"
          }`}
          onClick={() => setMethod("email")}
          type="button"
        >
          {method === "email" ? "✓ " : ""}Email link
        </button>
      </div>

      <div>
        {method === "password" ? (
          <PasswordSignInForm next={next} />
        ) : (
          <MagicLinkForm next={next} />
        )}
      </div>
    </div>
  );
}
