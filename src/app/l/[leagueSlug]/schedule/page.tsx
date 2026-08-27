import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSimulationLeague } from "@/application/queries/get-simulation-league";
import { PageFrame } from "@/components/league/page-frame";

export const metadata: Metadata = { title: "2026 schedule" };

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const league = getSimulationLeague(leagueSlug);
  if (!league) notFound();

  const weeks = Array.from({ length: 14 }, (_, index) => index + 1);

  return (
    <PageFrame
      eyebrow="Published at roster lock"
      title="2026 regular-season schedule"
      description="One matchup per member per week. The complete 14-week publication is deterministic and immutable except for a proven integrity correction."
    >
      <div className="border-boundary bg-surface mt-7 rounded-xl border p-4 sm:p-5">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">Algorithm</dt>
            <dd className="mt-1 font-semibold">
              {league.schedule.algorithmVersion}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Publication</dt>
            <dd className="mt-1 font-semibold">14 weeks · frozen</dd>
          </div>
          <div>
            <dt className="text-muted">Output evidence</dt>
            <dd className="mt-1 truncate font-mono text-xs">
              {league.schedule.outputHash}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {weeks.map((week) => {
          const matchups = league.schedule.matchups.filter(
            (matchup) => matchup.week === week,
          );
          return (
            <section
              key={week}
              aria-labelledby={`schedule-week-${week}`}
              className={`rounded-xl border p-5 ${week === 6 ? "border-registry bg-registry/5" : "border-boundary bg-surface"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 id={`schedule-week-${week}`} className="font-bold">
                  Week {week}
                </h2>
                <span className="text-muted text-xs font-semibold">
                  {week < 6 ? "Final" : week === 6 ? "Current" : "Scheduled"}
                </span>
              </div>
              <div className="divide-boundary mt-3 divide-y">
                {matchups.map((matchup) => (
                  <p
                    key={`${matchup.sideAEntryId}-${matchup.sideBEntryId}`}
                    className={`py-2.5 text-sm ${matchup.sideA === "Pfeff" || matchup.sideB === "Pfeff" ? "text-registry font-bold" : "text-graphite"}`}
                  >
                    {matchup.sideA} <span className="text-muted">vs</span>{" "}
                    {matchup.sideB}
                  </p>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </PageFrame>
  );
}
