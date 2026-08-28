import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { BrandLockup } from "@/components/ui/register-mark";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) {
    redirect("/auth/sign-in?next=/account");
  }

  const email =
    typeof data.claims.email === "string" ? data.claims.email : "Your account";

  return (
    <main className="bg-canvas min-h-screen px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-xl">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="Sunday Ledger home">
            <BrandLockup />
          </Link>
          <Link
            className="text-registry hover:bg-subtle inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold"
            href="/leagues"
          >
            Your leagues
          </Link>
        </div>

        <section className="border-boundary bg-surface mt-12 rounded-xl border p-6 shadow-[var(--shadow-card)] sm:p-8">
          <p className="text-registry text-xs font-bold tracking-[0.1em] uppercase">
            Account security
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
            Set or change your password
          </h1>
          <p className="text-graphite mt-3 leading-6">
            Signed in as {email}. Set a password once, then use it instead of
            requesting an authorization email on each new Preview or device.
          </p>
          <SetPasswordForm />
        </section>

        <div className="mt-5 flex justify-end">
          <SignOutForm className="text-muted hover:text-ink min-h-11 rounded-lg px-3 text-sm font-semibold" />
        </div>
      </div>
    </main>
  );
}
