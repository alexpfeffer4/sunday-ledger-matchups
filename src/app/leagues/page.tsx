import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import { isDemoSeasonEnabled } from "@/application/demo/demo-season-availability";
import { DemoSeasonRunner } from "@/components/league/demo-season-runner";
import { LeagueSetupForms } from "@/components/league/league-setup-forms";
import { BrandLockup } from "@/components/ui/register-mark";

export const metadata: Metadata = { title: "Your leagues" };

export default async function LeaguesPage() {
  const demoSeasonEnabled = isDemoSeasonEnabled();
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
        <Link href="/" aria-label="Sunday Ledger home">
          <BrandLockup />
        </Link>
        <div className="mt-16">
          <p className="text-registry text-xs font-bold tracking-[0.1em] uppercase">
            League home
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-[-0.04em]">
            Your leagues
          </h1>
          <p className="text-graphite mt-3 max-w-2xl leading-7">
            Authenticated Supabase memberships. Simulation leagues remain
            private and can publish either the interactive Week 1 demo or a
            complete deterministic season archive.
          </p>
        </div>

        <LeagueSetupForms />

        <section className="border-champion bg-archive mt-8 rounded-xl border p-6 shadow-[var(--shadow-card)]">
          <p className="text-champion text-xs font-bold tracking-[0.09em] uppercase">
            Preview only · fictional test data
          </p>
          <div className="mt-3 flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-bold">Run a complete demo season</h2>
              <p className="text-graphite mt-2 max-w-2xl text-sm leading-6">
                Execute the real Stage 2 engine with 10 fictional members from
                Week 1 through the Week 18 exhibitions. No invitations, Supabase
                records, or changes to your private leagues.
              </p>
            </div>
            <DemoSeasonRunner enabled={demoSeasonEnabled} />
          </div>
        </section>

        {leagues.length > 0 ? (
          <section className="mt-8" aria-labelledby="stored-leagues-title">
            <h2 id="stored-leagues-title" className="text-xl font-bold">
              Stored leagues
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {leagues.map((league) => (
                <article
                  className="border-boundary bg-surface rounded-xl border p-5"
                  key={league.id}
                >
                  <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
                    {league.role} · Supabase
                  </p>
                  <h3 className="mt-2 text-lg font-bold">{league.name}</h3>
                  <Link
                    className="text-action mt-4 inline-flex min-h-11 items-center font-semibold hover:underline"
                    href={`/l/${league.slug}/matchup`}
                  >
                    Open league
                  </Link>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="border-registry bg-surface mt-8 rounded-xl border p-6 shadow-[var(--shadow-card)]">
          <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
            Legacy simulation · local fixture
          </p>
          <div className="mt-3 flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-bold">West 21st Ledger</h2>
              <p className="text-graphite mt-2 text-sm">
                NFL · 2026 · Week 6 · read-only preview
              </p>
            </div>
            <Link
              href="/l/west-21st-ledger/matchup"
              className="border-registry bg-registry hover:bg-registry-hover inline-flex min-h-11 items-center justify-center rounded-lg border px-5 text-sm font-semibold text-white"
            >
              Open preview
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
