import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeInternalPath } from "@/adapters/supabase/redirect";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import { BrandLockup } from "@/components/ui/register-mark";

export const metadata: Metadata = { title: "Set a password" };

export default async function SetPasswordPage({
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
    const destination = `/account/set-password?next=${encodeURIComponent(next)}`;
    redirect(
      `/auth/sign-in?method=email&next=${encodeURIComponent(destination)}`,
    );
  }
  return (
    <main className="bg-canvas min-h-screen px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-md">
        <Link href="/" aria-label="Sunday Ledger home">
          <BrandLockup variant="horizontal" />
        </Link>
        <section className="border-boundary bg-surface mt-16 rounded-xl border p-6 shadow-[var(--shadow-card)] sm:p-8">
          <h1 className="text-3xl font-bold tracking-[-0.04em]">
            Set a password
          </h1>
          <p className="text-graphite mt-3 leading-6">
            You are signed in. Save a password for future visits, then continue
            to your invitation or leagues.
          </p>
          <SetPasswordForm next={next} />
        </section>
      </div>
    </main>
  );
}
