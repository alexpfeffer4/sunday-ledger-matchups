import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAuthoritativeLeagueState } from "@/application/queries/get-live-stage1-league";
import { getLiveWeekOperations } from "@/application/queries/get-live-week-operations";
import { getAuthoritativePlayoffState } from "@/application/queries/get-live-playoff-state";
import { projectPairedMatchup } from "@/application/queries/project-paired-matchup";
import { getSeasonArchive } from "@/application/queries/get-season-archive";
import { getWeeklyCloseState } from "@/application/queries/get-weekly-close-state";
import { WeeklyCloseModule } from "@/components/history/weekly-close-module";
import { MatchupStateRefresh } from "@/components/matchup/matchup-state-refresh";
import { PairedMatchupView } from "@/components/matchup/paired-matchup-view";
import { SeasonArchiveHome } from "@/components/season/archive-views";
import { Stage1MatchupView } from "@/components/stage1/live-views";
import { projectSeasonMemory } from "@/domain/history/project-season-memory";

export const metadata: Metadata = { title: "Matchup" };

export default async function MatchupPage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const [live, archive, operations, weeklyCloseState] = await Promise.all([
    getAuthoritativeLeagueState(leagueSlug),
    getSeasonArchive(leagueSlug),
    getLiveWeekOperations(leagueSlug),
    getWeeklyCloseState(leagueSlug),
  ]);
  if (archive) {
    return <SeasonArchiveHome archive={archive} leagueSlug={leagueSlug} />;
  }
  if (live) {
    const playoffState = [
      "PLAYOFFS",
      "CHAMPION_FINAL",
      "WEEK_18_EXHIBITION",
      "FINAL",
    ].includes(live.league.lifecycle)
      ? await getAuthoritativePlayoffState(leagueSlug)
      : null;
    const qualificationSeeds = new Map(
      (playoffState?.publication.qualifiers ?? []).map((qualifier) => [
        qualifier.entryId,
        qualifier.qualificationSeed,
      ]),
    );
    const matchup = projectPairedMatchup(
      live,
      operations,
      new Date(),
      qualificationSeeds,
    );
    const memory = weeklyCloseState
      ? projectSeasonMemory(weeklyCloseState)
      : null;
    return matchup ? (
      <PairedMatchupView
        matchup={matchup}
        refreshControl={<MatchupStateRefresh />}
        weeklyClose={
          memory?.recordBridge ? (
            <WeeklyCloseModule
              bridge={memory.recordBridge}
              cutline={memory.playoffCutline}
              leagueSlug={leagueSlug}
            />
          ) : null
        }
      />
    ) : (
      <Stage1MatchupView state={live} />
    );
  }
  notFound();
}
