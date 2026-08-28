import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeInternalPath } from "@/adapters/supabase/redirect";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import { RecoveryPasswordForm } from "@/components/auth/recovery-password-form";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { BrandLockup } from "@/components/ui/register-mark";

export const metadata: Metadata = { title: "Reset password" };

export default async function RecoverPasswordPage({
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
    redirect(`/auth/recover?next=${encodeURIComponent(next)}`);
  }
  const email =
    typeof data.claims.email === "string" ? data.claims.email : "your account";

  return (
    <main className="bg-canvas min-h-screen px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-md">
        <Link href="/" aria-label="Sunday Ledger home">
          <BrandLockup />
        </Link>
        <section className="border-boundary bg-surface mt-16 rounded-xl border p-6 shadow-[var(--shadow-card)] sm:p-8">
          <p className="text-positive text-xs font-bold tracking-[0.1em] uppercase">
            Recovery link confirmed
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
            Save a new password
          </h1>
          <p className="text-graphite mt-3 leading-6">
            Set a password of at least eight characters for {email}. You will
            return to where you left off only after it saves successfully.
          </p>
          <RecoveryPasswordForm next={next} />
        </section>
        <div className="mt-5 flex justify-end">
          <SignOutForm className="text-muted hover:text-ink min-h-11 rounded-lg px-3 text-sm font-semibold" />
        </div>
      </div>
    </main>
  );
}
