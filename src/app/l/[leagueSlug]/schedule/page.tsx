import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLiveStage1League } from "@/application/queries/get-live-stage1-league";
import { getLiveRegularSeasonSchedule } from "@/application/queries/get-live-regular-season-schedule";
import { getSimulationLeague } from "@/application/queries/get-simulation-league";
import { getSimulationSeasonArchive } from "@/application/queries/get-simulation-season-archive";
import { PageFrame } from "@/components/league/page-frame";
import { SeasonArchiveSchedule } from "@/components/season/archive-views";
import { Stage1ScheduleView } from "@/components/stage1/live-views";

export const metadata: Metadata = { title: "2026 schedule" };

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const [live, archive, liveSchedule] = await Promise.all([
    getLiveStage1League(leagueSlug),
    getSimulationSeasonArchive(leagueSlug),
    getLiveRegularSeasonSchedule(leagueSlug),
  ]);
  if (archive) return <SeasonArchiveSchedule archive={archive} />;
  if (live)
    return <Stage1ScheduleView liveSchedule={liveSchedule} state={live} />;
  const league = getSimulationLeague(leagueSlug);
  if (!league) notFound();

  const weeks = Array.from({ length: 14 }, (_, index) => index + 1);

  return (
    <PageFrame
      eyebrow="Published at roster lock"
      title="2026 regular-season schedule"
      description="One matchup per member per week. Once the roster locks, all 14 weeks are published and do not change."
    >
      <div className="border-boundary bg-surface mt-7 rounded-xl border p-4 sm:p-5">
        <p className="font-semibold">14-week schedule locked</p>
        <details className="border-boundary mt-4 border-t pt-4 text-sm">
          <summary className="cursor-pointer font-semibold">
            Schedule verification
          </summary>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-muted">Method</dt>
              <dd className="mt-1 font-semibold">
                {league.schedule.algorithmVersion}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted">Verification code</dt>
              <dd className="mt-1 truncate font-mono text-xs">
                {league.schedule.outputHash}
              </dd>
            </div>
          </dl>
        </details>
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
