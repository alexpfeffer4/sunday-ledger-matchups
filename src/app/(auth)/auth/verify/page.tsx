import type { Metadata } from "next";
import Link from "next/link";
import { safeInternalPath } from "@/adapters/supabase/redirect";
import { BrandLockup } from "@/components/ui/register-mark";

export const metadata: Metadata = {
  title: "Confirm email link",
  // Keep credentials out of Referer without suppressing the form's Origin.
  referrer: "strict-origin",
  robots: { index: false, follow: false },
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  function value(key: string) {
    const raw = query[key];
    return typeof raw === "string" && raw.length <= 2048 ? raw : "";
  }
  const next = safeInternalPath(value("next"));
  const recovery = value("flow") === "recovery" || value("type") === "recovery";
  const creating =
    value("flow") === "create-account" || value("type") === "signup";
  const hasCredential = Boolean(value("token_hash") || value("code"));
  const retryPath = recovery
    ? "recover"
    : creating
      ? "create-account"
      : "sign-in";
  return (
    <main className="bg-canvas min-h-screen px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-md">
        <Link href="/" aria-label="Sunday Ledger home">
          <BrandLockup variant="horizontal" />
        </Link>
        <section className="border-boundary bg-surface mt-16 rounded-xl border p-6 shadow-[var(--shadow-card)] sm:p-8">
          <p className="text-registry text-xs font-bold tracking-[0.1em] uppercase">
            Private account access
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
            {hasCredential
              ? "Confirm your email link"
              : "This email link is unavailable"}
          </h1>
          <p className="text-graphite mt-3 leading-6">
            {hasCredential
              ? recovery
                ? "Continue to save a new password. Your league destination will be kept."
                : creating
                  ? "Confirm to finish your username and password, then return to your invitation or leagues."
                  : "Continue to sign in and return where you left off."
              : "The link is incomplete or could not be verified. Request a fresh email and use the newest link."}
          </p>
          {hasCredential ? (
            <form action="/auth/confirm" method="post" className="mt-7">
              {[
                "token_hash",
                "type",
                "code",
                "sb_flow_id",
                "flow",
                "error_code",
              ].map((key) => (
                <input key={key} type="hidden" name={key} value={value(key)} />
              ))}
              <input type="hidden" name="next" value={next} />
              <button
                className="bg-registry hover:bg-registry-hover min-h-12 w-full rounded-lg px-5 text-sm font-semibold text-white"
                type="submit"
              >
                Confirm and continue
              </button>
            </form>
          ) : (
            <Link
              className="text-action mt-5 inline-flex min-h-11 items-center font-semibold hover:underline"
              href={`/auth/${retryPath}?error=invalid_link&next=${encodeURIComponent(next)}`}
            >
              Request a new email link
            </Link>
          )}
          <p className="text-muted mt-4 text-sm leading-6">
            Only continue if you requested this email. Your link can be used
            once.
          </p>
        </section>
      </div>
    </main>
  );
}
