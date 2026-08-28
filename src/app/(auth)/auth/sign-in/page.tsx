import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/adapters/supabase/config";
import { safeInternalPath } from "@/adapters/supabase/redirect";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { PasswordSignInForm } from "@/components/auth/password-sign-in-form";
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
          <BrandLockup />
        </Link>
        <section className="border-boundary bg-surface mt-16 rounded-xl border p-6 shadow-[var(--shadow-card)] sm:p-8">
          <p className="text-registry text-xs font-bold tracking-[0.1em] uppercase">
            Private league access
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
            Sign in to Sunday Ledger
          </h1>
          <p className="text-graphite mt-3 leading-6">
            Sign in with your password, or use an email link to create or
            recover your account.
          </p>
          {hasLinkError ? (
            <p className="border-negative/25 bg-negative/10 text-negative mt-5 rounded-lg border px-4 py-3 text-sm leading-6">
              That sign-in link is invalid or expired. Request a fresh one
              below.
            </p>
          ) : null}
          <PasswordSignInForm next={next} />
          <div className="my-7 flex items-center gap-3" aria-hidden="true">
            <span className="border-boundary flex-1 border-t" />
            <span className="text-muted text-xs font-semibold uppercase">
              Or use email
            </span>
            <span className="border-boundary flex-1 border-t" />
          </div>
          <MagicLinkForm next={next} />
        </section>
        <p className="text-muted mt-5 text-center text-xs leading-5">
          Authentication is provided by Supabase Auth. League data remains in
          Supabase Postgres under membership-scoped Row Level Security.
        </p>
      </div>
    </main>
  );
}
