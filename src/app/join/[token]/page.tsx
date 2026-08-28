import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import { getLeagueInvitePreview } from "@/application/queries/get-league-invite-preview";
import { JoinLeagueForm } from "@/components/league/join-league-form";
import { BrandLockup, RegisterMark } from "@/components/ui/register-mark";

export const metadata: Metadata = {
  title: "Private league invitation",
  robots: { index: false, follow: false },
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/New_York",
});

export default async function JoinLeaguePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = await getLeagueInvitePreview(token);
  const supabase = await createSupabaseServerClient();
  const claims = await supabase.auth.getClaims();
  const authenticated = Boolean(claims.data?.claims?.sub);

  return (
    <main className="bg-canvas min-h-screen px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-xl">
        <Link href="/" aria-label="Sunday Ledger home">
          <BrandLockup />
        </Link>

        {!preview ? (
          <section className="border-boundary bg-surface mt-14 rounded-xl border p-6 shadow-[var(--shadow-card)] sm:p-8">
            <p className="text-pending text-xs font-bold tracking-[0.1em] uppercase">
              Invitation unavailable
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
              This league link is no longer active
            </h1>
            <p className="text-graphite mt-3 leading-7">
              It may have expired, reached its use limit, or been revoked. Ask
              the commissioner for a new private invitation.
            </p>
            <Link
              className="text-action mt-5 inline-flex min-h-11 items-center font-semibold hover:underline"
              href="/leagues"
            >
              Go to your leagues
            </Link>
          </section>
        ) : (
          <section className="border-boundary bg-surface mt-14 overflow-hidden rounded-xl border shadow-[var(--shadow-card)]">
            <div className="bg-registry px-6 py-7 text-white sm:px-8">
              <div className="flex items-center gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/30 bg-white/10">
                  <RegisterMark className="h-7 w-7" />
                </span>
                <div>
                  <p className="text-xs font-bold tracking-[0.1em] text-white/75 uppercase">
                    Private NFL league
                  </p>
                  <h1 className="mt-1 text-2xl font-bold">
                    {preview.league_name}
                  </h1>
                </div>
              </div>
            </div>
            <div className="p-6 sm:p-8">
              <p className="text-copper text-xs font-bold tracking-[0.1em] uppercase">
                {preview.commissioner_name} invited you
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
                Beat one friend every week
              </h2>
              <p className="text-graphite mt-3 leading-7">
                Start each week with the same 1,000 virtual credits, build a
                sealed card from real NFL markets, and turn the result into a
                record, playoff seed, and season history.
              </p>

              <dl className="border-boundary mt-6 grid gap-4 border-y py-5 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted">Season</dt>
                  <dd className="mt-1 font-semibold">
                    NFL {preview.nfl_year} ·{" "}
                    {preview.mode === "LIVE"
                      ? "Live season"
                      : "Practice season"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Members joined</dt>
                  <dd className="mt-1 font-semibold">
                    {preview.member_count} · even roster required
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Cost</dt>
                  <dd className="mt-1 font-semibold">
                    Free · virtual credits only
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Link expires</dt>
                  <dd className="mt-1 font-semibold">
                    {dateFormatter.format(new Date(preview.expires_at))} ET
                  </dd>
                </div>
              </dl>

              {authenticated ? (
                <JoinLeagueForm token={token} />
              ) : (
                <Link
                  className="bg-registry hover:bg-registry-hover mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-lg px-5 text-sm font-semibold text-white"
                  href={`/auth/sign-in?next=${encodeURIComponent(`/join/${token}`)}`}
                >
                  Sign in or create account
                </Link>
              )}
              <p className="text-muted mt-4 text-center text-xs leading-5">
                Sealed picks stay private until their games begin. Commissioners
                cannot inspect sealed cards.
              </p>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
