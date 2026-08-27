import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLiveStage1League } from "@/application/queries/get-live-stage1-league";
import { getSimulationLeague } from "@/application/queries/get-simulation-league";
import { getSimulationSeasonArchive } from "@/application/queries/get-simulation-season-archive";
import { PageFrame } from "@/components/league/page-frame";
import { SeasonArchiveHistory } from "@/components/season/archive-views";
import { Stage1DeferredView } from "@/components/stage1/live-views";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "League history" };

const resultTone = {
  W: "text-positive",
  L: "text-negative",
  T: "text-pending",
} as const;

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const [live, archive] = await Promise.all([
    getLiveStage1League(leagueSlug),
    getSimulationSeasonArchive(leagueSlug),
  ]);
  if (archive) return <SeasonArchiveHistory archive={archive} />;
  if (live) {
    return (
      <Stage1DeferredView
        state={live}
        title="League history begins after Week 1 finalizes"
        description="Stage 1 stores immutable Week 1 evidence; the season archive is not populated from provisional results."
      />
    );
  }
  const league = getSimulationLeague(leagueSlug);
  if (!league) notFound();

  return (
    <PageFrame
      eyebrow="Season archive"
      title="League history"
      description="Official results retain their competition scope. Regular season, playoffs, placement, and exhibition meetings never blur together."
      aside={<StatusBadge tone="pending">2026 · in progress</StatusBadge>}
    >
      <section className="border-boundary bg-archive mt-7 rounded-xl border p-5 sm:p-7">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <p className="text-registry text-xs font-bold tracking-[0.1em] uppercase">
              West 21st Ledger · 2026
            </p>
            <h2 className="mt-2 text-2xl font-bold">
              First season in progress
            </h2>
            <p className="text-graphite mt-2 text-sm">
              Official through Week 5 · champion not yet determined
            </p>
          </div>
          <Link
            className="text-action inline-flex min-h-11 items-center text-sm font-semibold hover:underline"
            href={`/l/${leagueSlug}/standings`}
          >
            View current table
          </Link>
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="archive-title">
          <h2 id="archive-title" className="text-xl font-bold">
            Pfeff’s official matchups
          </h2>
          <div className="border-boundary bg-surface mt-4 overflow-hidden rounded-xl border">
            <div className="divide-boundary divide-y">
              {league.historyMeetings.map((meeting) => (
                <article
                  key={meeting.week}
                  className="grid gap-3 p-4 sm:grid-cols-[80px_1fr_auto] sm:items-center sm:p-5"
                >
                  <div>
                    <p className="font-bold">Week {meeting.week}</p>
                    <p className="text-muted mt-1 text-xs">{meeting.scope}</p>
                  </div>
                  <div>
                    <p className="font-semibold">Pfeff vs {meeting.opponent}</p>
                    <p className="text-muted mt-1 text-xs">{meeting.note}</p>
                  </div>
                  <p className="font-mono text-sm font-semibold">
                    <span className={resultTone[meeting.result]}>
                      {meeting.result}
                    </span>{" "}
                    {meeting.viewerScore}–{meeting.opponentScore}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <aside>
          <section className="border-boundary bg-surface rounded-xl border p-5">
            <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
              Rivalry index
            </p>
            <h2 className="mt-2 text-lg font-bold">Pfeff vs Mia</h2>
            <p className="text-graphite mt-2 text-sm leading-6">
              Mia leads the official regular-season series 1–0. Week 6 is the
              second meeting. No playoff meetings.
            </p>
            <Link
              className="text-action mt-3 inline-flex min-h-11 items-center text-sm font-semibold hover:underline"
              href={`/l/${leagueSlug}/rivalry/pfeff/mia`}
            >
              Open rivalry record
            </Link>
          </section>
        </aside>
      </div>
    </PageFrame>
  );
}
