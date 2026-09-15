import type { LiveRegularSeasonSchedule } from "@/application/queries/get-live-regular-season-schedule";
import type { Stage1StateDto } from "@/application/queries/stage1-dtos";
import type { WeeklyCloseStateDto } from "@/application/queries/weekly-close-dtos";
import type { ScheduleWeekRecord } from "@/components/league/schedule-navigator";
import { competitionLabel } from "./competition-label";
import { matchupHref } from "./matchup-link";

export function projectScheduleWeeks(
  state: Stage1StateDto,
  publication?: LiveRegularSeasonSchedule | null,
  history?: WeeklyCloseStateDto | null,
): ScheduleWeekRecord[] {
  const historyMatches =
    history?.matchups.filter((game) => game.seasonId === state.season.id) ?? [];
  const names = new Map(
    state.members.map((member) => [member.entryId, member.displayName]),
  );
  const weekNumbers = new Set([
    ...(publication ? Array.from({ length: 14 }, (_, index) => index + 1) : []),
    ...(history?.weeks ?? [])
      .filter((week) => week.state !== "PLANNED")
      .map((week) => week.nflWeek),
    ...(state.week ? [state.week.nflWeek] : []),
  ]);
  return [...weekNumbers]
    .sort((a, b) => a - b)
    .map((week) => {
      const current = week === state.week?.nflWeek;
      const publishedWeek = history?.weeks.find(
        (candidate) => candidate.nflWeek === week,
      );
      const status =
        (current ? state.week?.state : publishedWeek?.state) ?? "PLANNED";
      const label = {
        PLANNED: "Scheduled",
        OPEN: "Open",
        LOCKED: "Locked",
        PROVISIONAL: "Picks settled",
        FINAL: "Final",
      }[status];
      const knownGames = current
        ? state.schedule
        : historyMatches
            .filter((game) => game.nflWeek === week)
            .map((game) => ({
              ...game,
              sideAName: names.get(game.sideAEntryId) ?? "Member",
              sideBName: names.get(game.sideBEntryId) ?? "Member",
            }));
      const matchups = knownGames.length
        ? knownGames.map((game) => ({
            id: game.id,
            sideAName: game.sideAName,
            sideBName: game.sideBName,
            sideAScoreCenticredits:
              game.result?.sideAPointsForCenticredits ?? null,
            sideBScoreCenticredits:
              game.result?.sideBPointsForCenticredits ?? null,
            status:
              game.result?.status === "FINAL"
                ? "Final"
                : game.result?.status === "PROVISIONAL"
                  ? "Picks settled"
                  : label,
            competition: competitionLabel({
              ...game,
              week,
              lifecycle: state.league.lifecycle,
            }),
            currentMember: [game.sideAEntryId, game.sideBEntryId].includes(
              state.viewer.entryId,
            ),
            sideAWinner: game.result?.sideADecision === "WIN",
            sideBWinner: game.result?.sideBDecision === "WIN",
            href:
              current ||
              (publishedWeek?.state === "FINAL" &&
                game.result?.status === "FINAL")
                ? matchupHref(state.league.slug, week, game.id)
                : undefined,
          }))
        : (publication?.matchups ?? [])
            .filter((game) => game.week === week)
            .map((game) => ({
              id: `${week}-${game.sideAEntryId}-${game.sideBEntryId}`,
              sideAName: game.sideAName,
              sideBName: game.sideBName,
              sideAScoreCenticredits: null,
              sideBScoreCenticredits: null,
              status: label,
              competition: "Regular season",
              currentMember: [game.sideAEntryId, game.sideBEntryId].includes(
                state.viewer.entryId,
              ),
            }));
      return {
        week,
        label: week === 18 ? "Week 18 · Exhibition" : `Week ${week}`,
        status: label,
        matchups,
      };
    });
}
