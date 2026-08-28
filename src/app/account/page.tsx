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
  const next = safeInternalPath(
    Array.isArray(query.next) ? query.next[0] : query.next,
  );
  const setup = Array.isArray(query.setup) ? query.setup[0] : query.setup;
  if (setup === "1") {
    redirect(`/account/setup?next=${encodeURIComponent(next)}`);
  }
  if (setup === "password") {
    redirect(`/account/recover-password?next=${encodeURIComponent(next)}`);
  }

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

        <section className="border-boundary bg-surface mt-10 rounded-xl border p-6 shadow-[var(--shadow-card)] sm:p-8">
          <p className="text-registry text-xs font-bold tracking-[0.1em] uppercase">
            Public identity
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
            Account
          </h1>
          <p className="text-graphite mt-3 leading-6">
            Sunday Ledger uses your email only for private account access. Your
            username appears in league member lists and season records.
          </p>
          <UsernameForm currentUsername={currentUsername} />
        </section>

        <section className="border-boundary bg-surface mt-6 rounded-xl border p-6 shadow-[var(--shadow-card)] sm:p-8">
          <p className="text-registry text-xs font-bold tracking-[0.1em] uppercase">
            Account security
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em]">
            Change password
          </h2>
          <p className="text-graphite mt-3 leading-6">
            Your private sign-in email is {email}. Use a password of at least
            eight characters for future sign-ins.
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
