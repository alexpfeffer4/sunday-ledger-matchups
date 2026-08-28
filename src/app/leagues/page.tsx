import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { LeagueSetupForms } from "@/components/league/league-setup-forms";
import { BrandLockup } from "@/components/ui/register-mark";

export const metadata: Metadata = { title: "Your leagues" };

export default async function LeaguesPage() {
  const supabase = await createSupabaseServerClient();
  const leaguesResult = await supabase
    .schema("api")
    .from("my_leagues")
    .select("id, name, slug, role, joined_at")
    .order("joined_at", { ascending: true });
  const leagues = leaguesResult.data ?? [];

  return (
    <main className="bg-canvas min-h-screen px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="Sunday Ledger home">
            <BrandLockup />
          </Link>
          <div className="flex items-center gap-1">
            <Link
              className="text-registry hover:bg-subtle inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold"
              href="/account"
            >
              Account
            </Link>
            <SignOutForm className="text-muted hover:text-ink min-h-11 rounded-lg px-3 text-sm font-semibold" />
          </div>
        </div>
        <div className="mt-16">
          <p className="text-registry text-xs font-bold tracking-[0.1em] uppercase">
            League home
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-[-0.04em]">
            Your leagues
          </h1>
          <p className="text-graphite mt-3 max-w-2xl leading-7">
            Open a league, join with an invitation, or start a new season.
          </p>
        </div>

        <LeagueSetupForms />

        <section className="border-boundary mt-10 border-y py-6">
          <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
            Practice week
          </p>
          <div className="mt-2 flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-bold">Learn the weekly game</h2>
              <p className="text-graphite mt-2 max-w-2xl text-sm leading-6">
                Build a 1,000-credit card and see how a matchup scores. Practice
                cards never affect your leagues.
              </p>
            </div>
            <Link
              className="bg-registry hover:bg-registry-hover inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg px-5 text-sm font-semibold text-white"
              href="/leagues/demo"
            >
              Try a practice week
            </Link>
          </div>
        </section>

        {leagues.length > 0 ? (
          <section className="mt-8" aria-labelledby="stored-leagues-title">
            <h2 id="stored-leagues-title" className="text-xl font-bold">
              League list
            </h2>
            <div className="divide-boundary border-boundary mt-4 divide-y border-y">
              {leagues.map((league) => (
                <article
                  className="flex flex-col justify-between gap-3 py-5 sm:flex-row sm:items-center"
                  key={league.id}
                >
                  <div>
                    <h3 className="text-lg font-bold">{league.name}</h3>
                    <p className="text-muted mt-1 text-xs font-semibold">
                      {league.role === "COMMISSIONER"
                        ? "Commissioner"
                        : "Member"}
                    </p>
                  </div>
                  <Link
                    className="text-action inline-flex min-h-11 items-center font-semibold hover:underline"
                    href={`/l/${league.slug}/matchup`}
                  >
                    Open league
                  </Link>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="border-boundary mt-8 border-t pt-6">
          <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
            Example league
          </p>
          <div className="mt-3 flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-bold">West 21st Ledger</h2>
              <p className="text-graphite mt-2 text-sm">
                See a complete league before starting your own.
              </p>
            </div>
            <Link
              href="/l/west-21st-ledger/matchup"
              className="border-registry bg-registry hover:bg-registry-hover inline-flex min-h-11 items-center justify-center rounded-lg border px-5 text-sm font-semibold text-white"
            >
              View example
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
