import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLiveStage1League } from "@/application/queries/get-live-stage1-league";
import { getSimulationLeague } from "@/application/queries/get-simulation-league";
import { PageFrame } from "@/components/league/page-frame";
import { Stage1DeferredView } from "@/components/stage1/live-views";

export const metadata: Metadata = { title: "Playoff race" };

const bracketStages = [
  {
    title: "Week 15 · opening round",
    games: ["Current No. 3 vs No. 6", "Current No. 4 vs No. 5"],
    note: "No. 1 and No. 2 receive byes after qualification is final.",
  },
  {
    title: "Week 16 · semifinals",
    games: ["No. 1 vs lowest remaining seed", "No. 2 vs other winner"],
    note: "Opening-round winners are reseeded by qualification seed.",
  },
  {
    title: "Week 17 · finals",
    games: ["Championship", "Third place"],
    note: "An exact score tie advances the higher qualification seed.",
  },
];

export default async function PlayoffsPage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const live = await getLiveStage1League(leagueSlug);
  if (live) {
    return (
      <Stage1DeferredView
        state={live}
        title="The playoff race has not opened"
        description="An eight-entry league will use the frozen small-league qualifier rule, but Stage 1 publishes no qualification claims from a single week."
      />
    );
  }
  const league = getSimulationLeague(leagueSlug);
  if (!league) notFound();
  const currentField = league.standings.slice(0, 6);

  return (
    <PageFrame
      eyebrow="Week 6 playoff race · 9 weeks remain"
      title="No one has qualified yet"
      description="The official Week 5 ordering is useful context, but the qualification snapshot is not created until Week 14 finalization."
    >
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="structure-title">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
                Ten-member structure
              </p>
              <h2 id="structure-title" className="mt-2 text-xl font-bold">
                Published championship path
              </h2>
            </div>
            <p className="text-muted text-xs font-semibold">Top six eligible</p>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {bracketStages.map((stage) => (
              <article
                key={stage.title}
                className="border-boundary bg-surface rounded-xl border p-5"
              >
                <h3 className="text-sm font-bold">{stage.title}</h3>
                <div className="mt-4 space-y-3">
                  {stage.games.map((game) => (
                    <div
                      key={game}
                      className="border-boundary bg-subtle rounded-lg border px-3 py-4 text-sm font-semibold"
                    >
                      {game}
                    </div>
                  ))}
                </div>
                <p className="text-muted mt-4 text-xs leading-5">
                  {stage.note}
                </p>
              </article>
            ))}
          </div>

          <section className="border-boundary bg-subtle mt-6 rounded-xl border p-5">
            <h2 className="font-bold">Pfeff’s current path</h2>
            <p className="text-graphite mt-2 text-sm leading-6">
              Pfeff sits No. 5 in the official table, one game above the current
              cutline. If that ordering were the final qualification snapshot,
              No. 5 would meet No. 4 in Week 15. This is context, not a clinch
              or a guaranteed seed.
            </p>
          </section>
        </section>

        <aside aria-labelledby="field-title">
          <section className="border-boundary bg-surface rounded-xl border p-5">
            <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
              Official through Week 5
            </p>
            <h2 id="field-title" className="mt-2 text-lg font-bold">
              Current field
            </h2>
            <ol className="divide-boundary mt-4 divide-y">
              {currentField.map((standing) => (
                <li
                  key={standing.id}
                  className={`grid grid-cols-[28px_1fr_auto] items-center gap-2 py-3 ${standing.isViewer ? "text-registry font-bold" : ""}`}
                >
                  <span className="font-mono text-sm">{standing.seed}</span>
                  <span className="text-sm">{standing.memberName}</span>
                  <span className="text-muted text-xs">{standing.record}</span>
                </li>
              ))}
            </ol>
            <p className="text-pending mt-1 border-t-2 border-dashed border-[var(--playoff-cutline)] pt-3 text-xs font-semibold">
              Current cutline · not qualification
            </p>
          </section>
          <section className="border-boundary bg-surface mt-5 rounded-xl border p-5">
            <h2 className="font-bold">Attendance eligibility</h2>
            <p className="text-graphite mt-2 text-sm leading-6">
              A third regular-season incomplete card makes a member ineligible.
              No ineligible member is promoted into a vacant bracket slot.
            </p>
          </section>
        </aside>
      </div>
    </PageFrame>
  );
}
