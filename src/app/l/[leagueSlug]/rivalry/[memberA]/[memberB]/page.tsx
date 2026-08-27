import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSimulationLeague } from "@/application/queries/get-simulation-league";
import { PageFrame } from "@/components/league/page-frame";

export const metadata: Metadata = { title: "Rivalry record" };

export default async function RivalryPage({
  params,
}: {
  params: Promise<{
    leagueSlug: string;
    memberA: string;
    memberB: string;
  }>;
}) {
  const { leagueSlug, memberA, memberB } = await params;
  const league = getSimulationLeague(leagueSlug);
  if (!league || memberA !== "pfeff" || memberB !== "mia") notFound();
  const firstMeeting = league.historyMeetings.find(
    (meeting) => meeting.opponent === "Mia",
  );
  if (!firstMeeting) notFound();

  return (
    <PageFrame
      eyebrow="Official head to head"
      title="Pfeff vs Mia"
      description="Competition scope is preserved so future exhibitions and placement games cannot alter this regular-season record."
    >
      <div className="mt-7 max-w-4xl">
        <section className="border-boundary bg-surface rounded-xl border p-5 sm:p-7">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-center">
            <div>
              <p className="text-registry text-xl font-bold">Pfeff</p>
              <p className="mt-3 font-mono text-3xl font-bold">0</p>
              <p className="text-muted mt-1 text-xs">official wins</p>
            </div>
            <p className="text-muted text-xs font-bold">VS</p>
            <div>
              <p className="text-copper text-xl font-bold">Mia</p>
              <p className="mt-3 font-mono text-3xl font-bold">1</p>
              <p className="text-muted mt-1 text-xs">official wins</p>
            </div>
          </div>
          <div className="border-boundary mt-7 border-t pt-5">
            <p className="font-bold">
              Week {firstMeeting.week} · regular season
            </p>
            <p className="text-graphite mt-2 text-sm">
              Mia won {firstMeeting.opponentScore}–{firstMeeting.viewerScore}.
              Week 6 is scheduled and does not enter the record until final.
            </p>
          </div>
        </section>
      </div>
    </PageFrame>
  );
}
