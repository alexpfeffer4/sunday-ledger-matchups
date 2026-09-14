import type { Stage1StateDto } from "./stage1-dtos";
import type { LeagueMatchupCards } from "./league-matchup-dtos";
import { competitionLabel } from "@/application/presentation/competition-label";
import type {
  PairedMatchupDto,
  PositionLedgerItem,
} from "./project-paired-matchup";

/** Projects only the member-authorized public side of each card. Never changes viewer identity. */
export function projectLeagueMatchup(
  state: Stage1StateDto,
  base: PairedMatchupDto,
  cards: LeagueMatchupCards | null,
  matchupId: string,
  qualificationSeeds: ReadonlyMap<string, number> = new Map(),
): PairedMatchupDto | null {
  if (!state.week || cards?.weekId !== state.week.id) return null;
  const game = state.schedule.find((game) => game.id === matchupId);
  if (!game) return null;
  if (game.id === state.matchup?.id) return base;
  const a = cards.cards.find((card) => card.entryId === game.sideAEntryId);
  const b = cards.cards.find((card) => card.entryId === game.sideBEntryId);
  if (!a || !b) return null;
  const member = (
    card: typeof a,
    displayName: string,
    side: "A" | "B",
  ): PairedMatchupDto["self"] => {
    const standing = state.standings.find(
      (row) => row.entryId === card.entryId,
    );
    const seed =
      game.postseasonRole === "CHAMPIONSHIP"
        ? qualificationSeeds.get(card.entryId)
        : undefined;
    return {
      entryId: card.entryId,
      displayName,
      record: standing
        ? `${standing.wins}–${standing.losses}${standing.ties ? `–${standing.ties}` : ""}`
        : "0–0",
      seed: seed ?? standing?.seed ?? null,
      seedKind: seed ? "PLAYOFF" : "REGULAR",
      scoreCenticredits:
        (side === "A"
          ? game.result?.sideAPointsForCenticredits
          : game.result?.sideBPointsForCenticredits) ?? card.scoreCenticredits,
      outstanding: card.outstanding ?? null,
      cardStatus:
        card.readiness === "COMPLIANT"
          ? "Sealed"
          : card.readiness === "INCOMPLETE"
            ? "Incomplete"
            : "Status unavailable",
      decision:
        (side === "A"
          ? game.result?.sideADecision
          : game.result?.sideBDecision) ?? null,
    };
  };
  const rows: PositionLedgerItem[] = [a, b].flatMap((card, index) =>
    card.positions.map((position) => {
      const event = state.slate.find((event) => event.id === position.eventId);
      if (
        !event ||
        !["LIVE", "FINAL", "VOID", "CORRECTED"].includes(event.state)
      ) {
        throw new Error("A revealed pick is missing its confirmed event.");
      }
      return {
        id: position.id,
        side: index === 0 ? "SELF" : "OPPONENT",
        memberName: index === 0 ? game.sideAName : game.sideBName,
        eventId: event.id,
        eventLabel: position.eventLabel,
        scheduledStartAt: event.scheduledStartAt,
        eventState: event.state,
        marketType: position.marketType,
        proposition: position.proposition,
        americanOdds: position.americanOdds,
        stakeCredits: position.stakeCredits,
        outcome: position.settlement?.outcome ?? null,
        returnedCenticredits: position.settlement?.returnedCenticredits ?? null,
        section: position.settlement
          ? "SETTLED"
          : event.state === "LIVE"
            ? "IN_PROGRESS"
            : "REMAINING",
        corrected: event.state === "CORRECTED",
      } satisfies PositionLedgerItem;
    }),
  );
  rows.sort(
    (a, b) =>
      a.scheduledStartAt.localeCompare(b.scheduledStartAt) ||
      a.side.localeCompare(b.side) ||
      a.id.localeCompare(b.id),
  );
  const scoreboard = base.scoreboard.map((row) => ({
    ...row,
    selected: row.id === matchupId,
  }));
  const scoreboardState = scoreboard.find((row) => row.id === matchupId)!.state;
  const phase =
    game.result?.status === "FINAL"
      ? "FINAL"
      : game.result?.status === "PROVISIONAL"
        ? "PROVISIONAL"
        : scoreboardState === "Not started"
          ? "PREGAME"
          : scoreboardState === "Delayed"
            ? "DELAYED"
            : scoreboardState === "Locked"
              ? "LOCKED"
              : "LIVE";
  const correctedCount = new Set(
    rows.filter((row) => row.corrected).map((row) => row.eventId),
  ).size;
  return {
    ...base,
    spectator: true,
    week: {
      ...base.week,
      scope: game.scope,
      competition: competitionLabel({
        ...game,
        week: state.week.nflWeek,
        lifecycle: state.league.lifecycle,
      }),
    },
    self: member(a, game.sideAName, "A"),
    opponent: member(b, game.sideBName, "B"),
    phase: correctedCount ? "CORRECTED" : phase,
    phaseLabel: correctedCount
      ? "Corrected"
      : phase === "PREGAME"
        ? "Pregame"
        : phase === "LOCKED"
          ? "Cards locked"
          : phase === "DELAYED"
            ? "Updates delayed"
            : scoreboardState,
    resultStatus: game.result?.status ?? null,
    rows: {
      SETTLED: rows.filter((row) => row.section === "SETTLED"),
      IN_PROGRESS: rows.filter((row) => row.section === "IN_PROGRESS"),
      REMAINING: rows.filter((row) => row.section === "REMAINING"),
    },
    // Based on the public slate, never on a hidden receipt count or allocation.
    futureSealed: state.slate.some((event) => event.state === "SCHEDULED"),
    scorePath: {
      startingAllocationCredits: 1000,
      selfSettledCenticredits: 0,
      opponentSettledCenticredits: 0,
      selfRemainingMaximumCenticredits: 0,
      opponentRemainingMaximumCenticredits: null,
      sentence: null,
    },
    correctedCount,
    scoreboard,
  };
}
