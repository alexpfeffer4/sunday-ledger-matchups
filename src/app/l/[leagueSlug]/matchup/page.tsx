import { getLeagueMatchupCards } from "@/application/queries/get-league-matchup-cards";
import { projectLeagueMatchup } from "@/application/queries/project-league-matchup";
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
import { ownerCardContext } from "@/components/card/owner-card-context";
import { OwnerCardProgress } from "@/components/card/owner-card-progress";

export const metadata: Metadata = { title: "Matchup" };

export default async function MatchupPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueSlug: string }>;
  searchParams: Promise<{ matchup?: string | string[] }>;
}) {
  const { leagueSlug } = await params;
  const requested = (await searchParams).matchup;
  if (
    requested !== undefined &&
    (typeof requested !== "string" ||
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(requested))
  )
    notFound();
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
    const leagueCards = live.week
      ? await getLeagueMatchupCards(leagueSlug, live.week.id)
      : null;
    const ownMatchup = projectPairedMatchup(
      live,
      operations,
      new Date(),
      qualificationSeeds,
      leagueCards,
    );
    const matchup =
      requested && ownMatchup
        ? projectLeagueMatchup(
            live,
            ownMatchup,
            leagueCards,
            requested,
            qualificationSeeds,
          )
        : ownMatchup;
    if (requested && !matchup) notFound();
    const memory = weeklyCloseState
      ? projectSeasonMemory(weeklyCloseState)
      : null;
    const currentClose = memory?.recordBridge?.matchup.id === live.matchup?.id;
    return matchup ? (
      <PairedMatchupView
        matchup={matchup}
        cardProgress={
          matchup.spectator ? undefined : (
            <OwnerCardProgress context={ownerCardContext(live)} />
          )
        }
        refreshControl={
          <MatchupStateRefresh
            active={
              live.league.mode === "LIVE" &&
              live.week?.state !== "FINAL" &&
              live.week?.state !== "OPEN"
            }
          />
        }
        weeklyClose={
          !matchup.spectator && memory?.recordBridge ? (
            currentClose ? (
              <WeeklyCloseModule
                bridge={memory.recordBridge}
                cutline={memory.playoffCutline}
                leagueSlug={leagueSlug}
                presentation="supporting"
              />
            ) : (
              <details className="border-boundary border-b pb-4">
                <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">
                  Previous result · Week {memory.recordBridge.matchup.nflWeek}
                </summary>
                <WeeklyCloseModule
                  bridge={memory.recordBridge}
                  cutline={memory.playoffCutline}
                  leagueSlug={leagueSlug}
                />
              </details>
            )
          ) : null
        }
      />
    ) : (
      <Stage1MatchupView state={live} />
    );
  }
  notFound();
}
