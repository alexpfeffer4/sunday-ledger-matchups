import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSimulationLeague } from "@/application/queries/get-simulation-league";
import { PageFrame } from "@/components/league/page-frame";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Week 6 live matchup" };

export default async function LivePage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const league = getSimulationLeague(leagueSlug);
  if (!league) notFound();

  return (
    <PageFrame
      dark
      eyebrow="Week 6 · pre-kickoff"
      title="Pfeff vs Mia"
      description="No designated event is reliably live. Scores and positions remain sealed until a provider live state or commissioner kickoff confirmation."
      aside={<StatusBadge tone="sealed">Waiting for kickoff</StatusBadge>}
    >
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <section className="border-boundary bg-surface rounded-xl border p-5 sm:p-7">
            <p className="text-live text-xs font-bold tracking-[0.1em] uppercase">
              Official records · weekly score not started
            </p>
            <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-8">
              <div>
                <p className="text-registry text-xl font-bold sm:text-2xl">
                  Pfeff
                </p>
                <p className="text-graphite mt-1 text-sm">3–2 · No. 5</p>
                <p className="mt-4 font-mono text-3xl font-bold">—</p>
              </div>
              <p className="text-muted text-xs font-bold">VS</p>
              <div className="text-right">
                <p className="text-copper text-xl font-bold sm:text-2xl">Mia</p>
                <p className="text-graphite mt-1 text-sm">4–1 · No. 2</p>
                <p className="mt-4 font-mono text-3xl font-bold">—</p>
              </div>
            </div>
            <div className="border-boundary bg-subtle mt-7 rounded-lg border px-4 py-5 text-center">
              <p className="font-semibold">Future positions sealed</p>
              <p className="text-muted mt-1 text-xs">
                No count, allocation, market, or geometry is disclosed.
              </p>
            </div>
          </section>

          <section className="border-boundary bg-surface rounded-xl border p-5">
            <p className="text-live text-xs font-bold tracking-[0.1em] uppercase">
              Designated events
            </p>
            <div className="divide-boundary mt-4 divide-y">
              {league.slate.map((game) => (
                <div
                  key={game.id}
                  className="flex flex-col justify-between gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {game.awayTeam} at {game.homeTeam}
                    </p>
                    <p className="text-muted mt-1 text-xs">
                      {game.kickoffLabel}
                    </p>
                  </div>
                  <span className="text-muted text-xs font-semibold">
                    Scheduled · sealed
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="border-boundary bg-surface rounded-xl border p-5">
            <p className="text-live text-xs font-bold tracking-[0.1em] uppercase">
              Remaining paths
            </p>
            <h2 className="mt-2 text-lg font-bold">No complete path yet</h2>
            <p className="text-graphite mt-3 text-sm leading-6">
              Every position is still sealed, so no factual win path can be
              calculated without exposing private terms.
            </p>
          </section>
          <section className="border-boundary bg-surface rounded-xl border p-5">
            <h2 className="font-bold">Reveal reliability</h2>
            <p className="text-graphite mt-2 text-sm leading-6">
              Scheduled time alone never reveals a receipt. A reliable provider
              live state or explicit actual-kickoff confirmation is required.
            </p>
          </section>
        </aside>
      </div>
    </PageFrame>
  );
}
