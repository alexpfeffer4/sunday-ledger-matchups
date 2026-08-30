import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLiveStage1League } from "@/application/queries/get-live-stage1-league";
import { getSeasonArchive } from "@/application/queries/get-season-archive";
import { getWeeklyCloseState } from "@/application/queries/get-weekly-close-state";
import { HistoryLedger } from "@/components/history/history-ledger";
import { SeasonArchiveHistory } from "@/components/season/archive-views";
import { Stage1DeferredView } from "@/components/stage1/live-views";
import { projectSeasonMemory } from "@/domain/history/project-season-memory";

export const metadata: Metadata = { title: "League history" };

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const [live, archive, weeklyCloseState] = await Promise.all([
    getLiveStage1League(leagueSlug),
    getSeasonArchive(leagueSlug),
    getWeeklyCloseState(leagueSlug),
  ]);
  if (archive) return <SeasonArchiveHistory archive={archive} />;
  if (weeklyCloseState) {
    return (
      <HistoryLedger
        leagueSlug={leagueSlug}
        memory={projectSeasonMemory(weeklyCloseState)}
      />
    );
  }
  if (live) {
    return (
      <Stage1DeferredView
        state={live}
        title="League history begins after Week 1 finalizes"
        description="Final matchups will appear here after Week 1."
      />
    );
  }
  notFound();
}
