import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLiveStage1League } from "@/application/queries/get-live-stage1-league";
import { getLiveWeekOperations } from "@/application/queries/get-live-week-operations";
import { projectPairedMatchup } from "@/application/queries/project-paired-matchup";
import { MatchupStateRefresh } from "@/components/matchup/matchup-state-refresh";
import { PairedMatchupView } from "@/components/matchup/paired-matchup-view";
import { Stage1LiveView } from "@/components/stage1/live-views";

export const metadata: Metadata = { title: "Live matchup" };

export default async function LivePage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const [live, operations] = await Promise.all([
    getLiveStage1League(leagueSlug),
    getLiveWeekOperations(leagueSlug),
  ]);
  if (live) {
    const matchup = projectPairedMatchup(live, operations);
    return matchup ? (
      <PairedMatchupView
        matchup={matchup}
        refreshControl={<MatchupStateRefresh />}
      />
    ) : (
      <Stage1LiveView state={live} />
    );
  }
  notFound();
}
