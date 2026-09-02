import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/adapters/supabase/config";
import { safeInternalPath } from "@/adapters/supabase/redirect";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import { SignInMethods } from "@/components/auth/sign-in-methods";
import { LinkErrorNotice } from "@/components/auth/link-error-notice";
import { BrandLockup } from "@/components/ui/register-mark";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
    error?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const next = safeInternalPath(
    Array.isArray(query.next) ? query.next[0] : query.next,
  );

  let authenticated = false;
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase.auth.getClaims();
      authenticated = Boolean(data?.claims?.sub);
    } catch {}
  }
  if (authenticated) redirect(next);

  const hasLinkError = Boolean(query.error);

  return (
    <main className="bg-canvas min-h-screen px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-md">
        <Link href="/" aria-label="Sunday Ledger home">
          <BrandLockup variant="horizontal" />
        </Link>
        <section className="border-boundary bg-surface mt-16 rounded-xl border p-6 shadow-[var(--shadow-card)] sm:p-8">
          <h1 className="text-3xl font-bold tracking-[-0.04em]">Sign in</h1>
          <p className="text-graphite mt-3 leading-6">
            Use your password or request a one-time email link for an existing
            account.
          </p>
          {hasLinkError ? <LinkErrorNotice /> : null}
          <SignInMethods
            next={next}
            defaultMethod={hasLinkError ? "email" : "password"}
          />
          <Link
            className="text-action mt-5 inline-flex min-h-11 items-center font-semibold hover:underline"
            href={`/auth/create-account?next=${encodeURIComponent(next)}`}
          >
            New here? Create account
          </Link>
        </section>
        <p className="text-muted mt-5 text-center text-xs leading-5">
          League members see your username—not your email.
        </p>
      </div>
    </main>
  );
}
