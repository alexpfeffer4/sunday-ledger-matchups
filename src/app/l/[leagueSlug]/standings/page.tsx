import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLiveStage1League } from "@/application/queries/get-live-stage1-league";
import { getSimulationLeague } from "@/application/queries/get-simulation-league";
import { getSimulationSeasonArchive } from "@/application/queries/get-simulation-season-archive";
import { PageFrame } from "@/components/league/page-frame";
import { SeasonArchiveStandings } from "@/components/season/archive-views";
import { Stage1StandingsView } from "@/components/stage1/live-views";

export const metadata: Metadata = { title: "Official standings" };

export default async function StandingsPage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const [live, archive] = await Promise.all([
    getLiveStage1League(leagueSlug),
    getSimulationSeasonArchive(leagueSlug),
  ]);
  if (archive) return <SeasonArchiveStandings archive={archive} />;
  if (live) return <Stage1StandingsView state={live} />;
  const league = getSimulationLeague(leagueSlug);
  if (!league) notFound();

  return (
    <PageFrame
      eyebrow="Official through Week 5"
      title="Standings"
      description="Week 6 has not changed the official table. Record leads the frozen tiebreak order; current cards and provisional outcomes do not."
      aside={
        <div className="border-control bg-surface inline-flex rounded-lg border p-1 text-sm font-semibold">
          <span className="bg-registry rounded-md px-4 py-2 text-white">
            Official
          </span>
          <span className="text-muted px-4 py-2">Live</span>
        </div>
      }
    >
      <div className="border-boundary bg-surface mt-7 overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <caption className="sr-only">
              Official West 21st Ledger standings through Week 5
            </caption>
            <thead className="bg-subtle text-muted text-xs tracking-[0.08em] uppercase">
              <tr>
                <th className="px-4 py-3 font-bold" scope="col">
                  Seed
                </th>
                <th className="px-4 py-3 font-bold" scope="col">
                  Member
                </th>
                <th className="px-4 py-3 font-bold" scope="col">
                  Record
                </th>
                <th className="px-4 py-3 font-bold" scope="col">
                  Points For
                </th>
                <th className="px-4 py-3 font-bold" scope="col">
                  All-play
                </th>
                <th className="px-4 py-3 font-bold" scope="col">
                  Misses
                </th>
                <th className="px-4 py-3 font-bold" scope="col">
                  Move
                </th>
              </tr>
            </thead>
            <tbody className="divide-boundary divide-y">
              {league.standings.map((standing) => (
                <tr
                  key={standing.id}
                  className={`${standing.isViewer ? "bg-registry/5" : ""} ${standing.seed === 6 ? "border-b-2 border-dashed border-[var(--playoff-cutline)]" : ""}`}
                >
                  <td className="px-4 py-4 font-mono font-semibold">
                    {standing.seed}
                  </td>
                  <th className="px-4 py-4" scope="row">
                    <div className="flex items-center gap-3">
                      <span className="border-boundary bg-subtle flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold">
                        {standing.initials}
                      </span>
                      <span>
                        <span className="font-bold">{standing.memberName}</span>
                        {standing.state ? (
                          <span className="text-pending ml-2 text-xs font-semibold">
                            {standing.state}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </th>
                  <td className="px-4 py-4 font-semibold">{standing.record}</td>
                  <td className="px-4 py-4 font-mono">{standing.pointsFor}</td>
                  <td className="px-4 py-4">{standing.allPlay}</td>
                  <td className="px-4 py-4">{standing.misses}</td>
                  <td className="px-4 py-4">{standing.movement}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-pending border-boundary border-t px-4 py-3 text-xs font-semibold">
          Playoff cutline follows Seed 6 · qualification is not final until Week
          14.
        </p>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="border-boundary bg-surface rounded-xl border p-5">
          <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
            Your record bridge
          </p>
          <h2 className="mt-2 text-lg font-bold">Pfeff · No. 5</h2>
          <p className="text-graphite mt-3 leading-6">
            3–2 official record · 5,861.60 Points For · 34–11 all-play · up two
            positions after Week 5.
          </p>
        </section>
        <section className="border-boundary bg-subtle rounded-xl border p-5">
          <h2 className="font-bold">Frozen tiebreak order</h2>
          <p className="text-graphite mt-2 text-sm leading-6">
            Win percentage, Points For, all-play percentage, balanced head to
            head when applicable, fewer misses, highest official weekly score,
            then the published deterministic random value.
          </p>
        </section>
      </div>
    </PageFrame>
  );
}
