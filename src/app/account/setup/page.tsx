import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeInternalPath } from "@/adapters/supabase/redirect";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import { AccountSetupForm } from "@/components/auth/account-setup-form";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { BrandLockup } from "@/components/ui/register-mark";

export const metadata: Metadata = { title: "Finish account setup" };

export default async function AccountSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const query = await searchParams;
  const next = safeInternalPath(
    Array.isArray(query.next) ? query.next[0] : query.next,
  );
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) {
    redirect(`/auth/create-account?next=${encodeURIComponent(next)}`);
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
        <Link href="/" aria-label="Sunday Ledger home">
          <BrandLockup />
        </Link>
        <section className="border-boundary bg-surface mt-12 rounded-xl border p-6 shadow-[var(--shadow-card)] sm:p-8">
          <p className="text-positive text-xs font-bold tracking-[0.1em] uppercase">
            Email confirmed
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
            Finish account setup
          </h1>
          <p className="text-graphite mt-3 leading-6">
            Choose the username your league will see and save a password for
            future sign-ins. Both are required before continuing.
          </p>
          <p className="text-muted mt-3 text-sm">Private email · {email}</p>
          <AccountSetupForm currentUsername={currentUsername} next={next} />
        </section>
        <div className="mt-5 flex justify-end">
          <SignOutForm className="text-muted hover:text-ink min-h-11 rounded-lg px-3 text-sm font-semibold" />
        </div>
      </div>
    </main>
  );
}
