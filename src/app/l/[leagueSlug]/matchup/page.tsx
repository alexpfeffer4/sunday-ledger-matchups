import { getLeagueMatchupCards } from "@/application/queries/get-league-matchup-cards";
import { projectLeagueMatchup } from "@/application/queries/project-league-matchup";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getAuthoritativeLeagueState,
  getLeagueState,
} from "@/application/queries/get-live-stage1-league";
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
import { projectHistoricalMatchup } from "@/application/queries/project-historical-matchup";
import { matchupHref } from "@/application/presentation/matchup-link";

export const metadata: Metadata = { title: "Matchup" };

export default async function MatchupPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueSlug: string }>;
  searchParams: Promise<{
    matchup?: string | string[];
    week?: string | string[];
  }>;
}) {
  const { leagueSlug } = await params;
  const query = await searchParams;
  const requested = query.matchup;
  if (
    query.week !== undefined &&
    (typeof query.week !== "string" || !/^(?:[1-9]|1[0-8])$/.test(query.week))
  )
    notFound();
  const requestedWeek = query.week ? Number(query.week) : undefined;
  if (
    requested !== undefined &&
    (typeof requested !== "string" ||
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(requested))
  )
    notFound();
  const [live, archive, weeklyCloseState] = await Promise.all([
    getLeagueState(leagueSlug),
    getSeasonArchive(leagueSlug),
    getWeeklyCloseState(leagueSlug),
  ]);
  const selectedWeek = weeklyCloseState?.weeks.find(
    (week) => week.nflWeek === requestedWeek,
  );
  const weekOptions = (selected: number) =>
    [
      ...(weeklyCloseState?.weeks ?? [])
        .filter(
          (week) =>
            week.state === "FINAL" && week.nflWeek !== live?.week?.nflWeek,
        )
        .map((week) => ({
          week: week.nflWeek,
          href: matchupHref(leagueSlug, week.nflWeek),
          selected: week.nflWeek === selected,
          current: false,
        })),
      ...(live?.week
        ? [
            {
              week: live.week.nflWeek,
              href: archive
                ? matchupHref(leagueSlug, live.week.nflWeek)
                : `/l/${leagueSlug}/matchup`,
              selected: live.week.nflWeek === selected,
              current: !archive,
            },
          ]
        : []),
    ].sort((a, b) => b.week - a.week);
  if (
    requestedWeek !== undefined &&
    selectedWeek?.state === "FINAL" &&
    weeklyCloseState
  ) {
    const selectedGame = weeklyCloseState.matchups.find(
      (game) =>
        game.seasonId === weeklyCloseState.season.id &&
        game.weekId === selectedWeek.id &&
        (requested
          ? game.id === requested
          : [game.sideAEntryId, game.sideBEntryId].includes(
              weeklyCloseState.viewer.entryId,
            )),
    );
    if (!selectedGame || selectedGame.result?.status !== "FINAL") notFound();
    const cards = await getLeagueMatchupCards(leagueSlug, selectedWeek.id);
    const matchup = projectHistoricalMatchup(
      weeklyCloseState,
      cards,
      requestedWeek,
      requested,
    );
    if (!matchup)
      throw new Error("Historical bets could not be loaded. Please try again.");
    const corrections = weeklyCloseState.corrections.filter(
      (correction) =>
        correction.weekId === selectedWeek.id &&
        correction.effects.some(
          (effect) => effect.matchupId === selectedGame.id,
        ),
    );
    return (
      <PairedMatchupView
        matchup={matchup}
        seasonArchived={Boolean(archive)}
        weeks={weekOptions(requestedWeek)}
        refreshControl={null}
        weeklyClose={
          corrections.length ? (
            <details className="border-boundary rounded-lg border px-4">
              <summary className="min-h-11 cursor-pointer py-3 font-semibold">
                Result corrections
              </summary>
              {corrections.map((correction) => (
                <p key={correction.id} className="pb-3 text-sm">
                  {correction.eventLabel}: {correction.reason}
                </p>
              ))}
            </details>
          ) : null
        }
      />
    );
  }
  if (requestedWeek !== undefined && requestedWeek !== live?.week?.nflWeek)
    notFound();
  if (archive) {
    return <SeasonArchiveHome archive={archive} leagueSlug={leagueSlug} />;
  }
  if (live) {
    const [current, operations, playoffState, leagueCards] = await Promise.all([
      getAuthoritativeLeagueState(leagueSlug),
      getLiveWeekOperations(leagueSlug),
      ["PLAYOFFS", "CHAMPION_FINAL", "WEEK_18_EXHIBITION", "FINAL"].includes(
        live.league.lifecycle,
      )
        ? getAuthoritativePlayoffState(leagueSlug)
        : null,
      live.week ? getLeagueMatchupCards(leagueSlug, live.week.id) : null,
    ]);
    if (!current) notFound();
    const qualificationSeeds = new Map(
      (playoffState?.publication.qualifiers ?? []).map((qualifier) => [
        qualifier.entryId,
        qualifier.qualificationSeed,
      ]),
    );
    const ownMatchup = projectPairedMatchup(
      current,
      operations,
      new Date(),
      qualificationSeeds,
      leagueCards,
    );
    const matchup =
      requested && ownMatchup
        ? projectLeagueMatchup(
            current,
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
        weeks={weekOptions(matchup.week.nflWeek)}
        cardProgress={
          matchup.spectator ? undefined : (
            <OwnerCardProgress
              context={ownerCardContext(current)}
              presentation="matchup"
            />
          )
        }
        refreshControl={
          <MatchupStateRefresh
            active={
              live.league.mode === "LIVE" &&
              live.week?.state !== "FINAL" &&
              (matchup.gameIdentitiesVisible === true ||
                live.week?.state !== "OPEN")
            }
            intervalMs={matchup.gameIdentitiesVisible ? 30_000 : undefined}
          />
        }
        previousResult={!currentClose}
        weeklyClose={
          !matchup.spectator &&
          memory?.recordBridge &&
          !(
            currentClose &&
            matchup.week.rollingSubmissionsEnabled &&
            matchup.scorePath.furtherSubmissionsPossible
          ) ? (
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
      <Stage1MatchupView state={current} />
    );
  }
  notFound();
}
