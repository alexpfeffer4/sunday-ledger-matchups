import type { Metadata } from "next";
import Link from "next/link";
import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";
import { BrandLockup } from "@/components/ui/register-mark";

export const metadata: Metadata = { title: "Recover password" };

export default function RecoverPasswordPage() {
  return (
    <main className="bg-canvas min-h-screen px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-md">
        <Link href="/" aria-label="Sunday Ledger home">
          <BrandLockup />
        </Link>
        <section className="border-boundary bg-surface mt-16 rounded-xl border p-6 shadow-[var(--shadow-card)] sm:p-8">
          <p className="text-registry text-xs font-bold tracking-[0.1em] uppercase">
            Account recovery
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
            Choose a new password
          </h1>
          <p className="text-graphite mt-3 leading-6">
            We will email a one-time recovery link. It opens your Account page,
            where you can save a new password of at least eight characters.
          </p>
          <PasswordRecoveryForm />
          <Link
            className="text-action mt-5 inline-flex min-h-11 items-center font-semibold hover:underline"
            href="/auth/sign-in"
          >
            Back to sign in
          </Link>
        </section>
      </div>
    </main>
  );
}
