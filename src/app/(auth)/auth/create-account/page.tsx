import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/adapters/supabase/config";
import { safeInternalPath } from "@/adapters/supabase/redirect";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { BrandLockup } from "@/components/ui/register-mark";

export const metadata: Metadata = { title: "Create account" };

export default async function CreateAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
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

  return (
    <main className="bg-canvas min-h-screen px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-md">
        <Link href="/" aria-label="Sunday Ledger home">
          <BrandLockup variant="horizontal" />
        </Link>
        <section className="border-boundary bg-surface mt-16 rounded-xl border p-6 shadow-[var(--shadow-card)] sm:p-8">
          <p className="text-registry text-xs font-bold tracking-[0.1em] uppercase">
            New account
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
            Create account
          </h1>
          <p className="text-graphite mt-3 leading-6">
            Start with a private one-time email link. Before continuing, you
            must save the public username your league sees and a password for
            future sign-ins.
          </p>
          <MagicLinkForm intent="create-account" next={next} />
          <Link
            className="text-action mt-5 inline-flex min-h-11 items-center font-semibold hover:underline"
            href={`/auth/sign-in?next=${encodeURIComponent(next)}`}
          >
            Already have an account? Sign in
          </Link>
        </section>
        <p className="text-muted mt-5 text-center text-xs leading-5">
          Your email stays private. League members see only your username.
        </p>
      </div>
    </main>
  );
}
