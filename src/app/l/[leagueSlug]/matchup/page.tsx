import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLiveStage1League } from "@/application/queries/get-live-stage1-league";
import { getLiveWeekOperations } from "@/application/queries/get-live-week-operations";
import { projectPairedMatchup } from "@/application/queries/project-paired-matchup";
import { getSeasonArchive } from "@/application/queries/get-season-archive";
import { MatchupStateRefresh } from "@/components/matchup/matchup-state-refresh";
import { PairedMatchupView } from "@/components/matchup/paired-matchup-view";
import { SeasonArchiveHome } from "@/components/season/archive-views";
import { Stage1MatchupView } from "@/components/stage1/live-views";

export const metadata: Metadata = { title: "Matchup" };

export default async function MatchupPage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const [live, archive, operations] = await Promise.all([
    getLiveStage1League(leagueSlug),
    getSeasonArchive(leagueSlug),
    getLiveWeekOperations(leagueSlug),
  ]);
  if (archive) {
    return <SeasonArchiveHome archive={archive} leagueSlug={leagueSlug} />;
  }
  if (live) {
    const matchup = projectPairedMatchup(live, operations);
    return matchup ? (
      <PairedMatchupView
        matchup={matchup}
        refreshControl={<MatchupStateRefresh />}
      />
    ) : (
      <Stage1MatchupView state={live} />
    );
  }
  notFound();
}
