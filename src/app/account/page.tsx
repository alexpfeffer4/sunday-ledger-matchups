import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeInternalPath } from "@/adapters/supabase/redirect";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { UsernameForm } from "@/components/auth/username-form";
import { BrandLockup } from "@/components/ui/register-mark";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{
    setup?: string | string[];
    next?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) {
    redirect("/auth/sign-in?next=/account");
  }

  const email =
    typeof data.claims.email === "string" ? data.claims.email : "Your account";
  const profileResult = await supabase
    .schema("api")
    .from("my_profile")
    .select("display_name")
    .maybeSingle();
  if (profileResult.error) throw profileResult.error;

  const currentUsername =
    profileResult.data?.display_name ?? email.split("@")[0] ?? "Member";
  const setup = Array.isArray(query.setup) ? query.setup[0] : query.setup;
  const next = safeInternalPath(
    Array.isArray(query.next) ? query.next[0] : query.next,
  );

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

        {setup === "1" ? (
          <section className="border-positive/25 bg-positive/10 mt-10 rounded-xl border p-5">
            <p className="text-positive text-xs font-bold tracking-[0.1em] uppercase">
              You are signed in
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-[-0.03em]">
              Finish account setup
            </h1>
            <p className="text-graphite mt-2 leading-6">
              Choose the username your league will see, then create a password
              so future sign-ins do not require another email link.
            </p>
          </section>
        ) : null}

        <section className="border-boundary bg-surface mt-8 rounded-xl border p-6 shadow-[var(--shadow-card)] sm:p-8">
          <p className="text-registry text-xs font-bold tracking-[0.1em] uppercase">
            Public identity
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
            Choose your username
          </h2>
          <p className="text-graphite mt-3 leading-6">
            Sunday Ledger uses your email only for private account access. Your
            username appears in matchups, standings, history, and league member
            lists.
          </p>
          <UsernameForm currentUsername={currentUsername} />
        </section>

        <section className="border-boundary bg-surface mt-6 rounded-xl border p-6 shadow-[var(--shadow-card)] sm:p-8">
          <p className="text-registry text-xs font-bold tracking-[0.1em] uppercase">
            Account security
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
            Set or change your password
          </h2>
          <p className="text-graphite mt-3 leading-6">
            Your private sign-in email is {email}. Set a password once, then use
            it instead of requesting an authorization email on each new Preview
            or device.
          </p>
          <SetPasswordForm />
        </section>

        {setup === "1" ? (
          <Link
            className="bg-registry hover:bg-registry-hover mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-lg px-5 text-sm font-semibold text-white"
            href={next}
          >
            Continue to Sunday Ledger
          </Link>
        ) : null}

        <div className="mt-5 flex justify-end">
          <SignOutForm className="text-muted hover:text-ink min-h-11 rounded-lg px-3 text-sm font-semibold" />
        </div>
      </div>
    </main>
  );
}
