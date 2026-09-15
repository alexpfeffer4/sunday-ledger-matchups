import { competitionLabel } from "@/application/presentation/competition-label";
import { matchupHref } from "@/application/presentation/matchup-link";
import type { LeagueMatchupCards } from "./league-matchup-dtos";
import type {
  PairedMatchupDto,
  PositionLedgerItem,
} from "./project-paired-matchup";
import type { WeeklyCloseStateDto } from "./weekly-close-dtos";

/** Read-only composition of official history and the existing revealed-card RPC.
 * Never substitutes current-week cards, quotes, records, or inferred settlements.
 */
export function projectHistoricalMatchup(
  state: WeeklyCloseStateDto,
  cards: LeagueMatchupCards | null,
  nflWeek: number,
  matchupId?: string,
): PairedMatchupDto | null {
  const week = state.weeks.find((candidate) => candidate.nflWeek === nflWeek);
  if (!week || week.state !== "FINAL" || cards?.weekId !== week.id) return null;
  const games = state.matchups
    .filter(
      (game) => game.seasonId === state.season.id && game.weekId === week.id,
    )
    .sort(
      (a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id),
    );
  const game = matchupId
    ? games.find((candidate) => candidate.id === matchupId)
    : games.find((candidate) =>
        [candidate.sideAEntryId, candidate.sideBEntryId].includes(
          state.viewer.entryId,
        ),
      );
  if (!game || game.result?.status !== "FINAL") return null;
  const result = game.result;
  const viewerIsB = game.sideBEntryId === state.viewer.entryId;
  const selfId = viewerIsB ? game.sideBEntryId : game.sideAEntryId;
  const opponentId = viewerIsB ? game.sideAEntryId : game.sideBEntryId;
  const selfCard = cards.cards.find((card) => card.entryId === selfId);
  const opponentCard = cards.cards.find((card) => card.entryId === opponentId);
  if (!selfCard || !opponentCard) return null;
  const names = new Map(
    state.members.map((member) => [member.entryId, member.displayName]),
  );
  if (!names.has(selfId) || !names.has(opponentId)) return null;
  const standings =
    state.standings
      .filter(
        (snapshot) =>
          snapshot.status === "FINAL" && snapshot.throughWeek <= nflWeek,
      )
      .sort((a, b) => b.throughWeek - a.throughWeek)[0]?.rows ?? [];
  const corrections = state.corrections.filter(
    (correction) => correction.weekId === week.id,
  );
  const correctedEvents = new Set(
    corrections.map((correction) => correction.eventLabel),
  );
  const member = (
    card: typeof selfCard,
    isA: boolean,
  ): PairedMatchupDto["self"] => {
    const standing = standings.find((row) => row.entryId === card.entryId);
    const seed =
      game.postseasonRole === "CHAMPIONSHIP"
        ? state.playoffField?.qualifiers.find(
            (qualifier) => qualifier.entryId === card.entryId,
          )?.qualificationSeed
        : undefined;
    return {
      entryId: card.entryId,
      displayName: names.get(card.entryId)!,
      record: standing
        ? `${standing.wins}–${standing.losses}${standing.ties ? `–${standing.ties}` : ""}`
        : "Record unavailable",
      seed: seed ?? standing?.seed ?? null,
      seedKind: seed ? "PLAYOFF" : "REGULAR",
      scoreCenticredits: isA
        ? result.sideAPointsForCenticredits
        : result.sideBPointsForCenticredits,
      decision: isA ? result.sideADecision : result.sideBDecision,
      cardStatus: card.readiness === "INCOMPLETE" ? "Incomplete" : "Final",
      outstanding: card.outstanding ?? null,
      selectedGames: [],
    };
  };
  const rows: PositionLedgerItem[] = [];
  for (const [index, card] of [selfCard, opponentCard].entries()) {
    for (const position of card.positions) {
      const event = card.selectedGames?.find(
        (candidate) => candidate.eventId === position.eventId,
      );
      // Missing historical evidence must not appear as an empty/zero card.
      if (!event || !position.settlement) return null;
      const corrected =
        correctedEvents.has(position.eventLabel) ||
        Boolean(position.settlement.playerCorrectionReason);
      rows.push({
        id: position.id,
        side: index === 0 ? "SELF" : "OPPONENT",
        memberName: names.get(card.entryId)!,
        eventId: position.eventId,
        eventLabel: position.eventLabel,
        scheduledStartAt: event.scheduledStartAt,
        eventState: corrected
          ? "CORRECTED"
          : position.settlement.outcome === "VOID"
            ? "VOID"
            : "FINAL",
        marketType: position.marketType,
        subjectId: position.subjectId,
        subjectLabel: position.subjectLabel,
        subjectTeam: position.subjectTeam,
        statistic: position.statistic,
        period: position.period,
        finalYards: position.settlement.finalYards ?? null,
        playerEvidenceVersion:
          position.settlement.playerEvidenceVersion ?? null,
        playerCorrectionReason:
          position.settlement.playerCorrectionReason ?? null,
        proposition: position.proposition,
        americanOdds: position.americanOdds,
        stakeCredits: position.stakeCredits,
        outcome: position.settlement.outcome,
        returnedCenticredits: position.settlement.returnedCenticredits,
        section: "SETTLED",
        corrected,
      });
    }
  }
  rows.sort(
    (a, b) =>
      a.scheduledStartAt.localeCompare(b.scheduledStartAt) ||
      a.eventId.localeCompare(b.eventId) ||
      a.id.localeCompare(b.id),
  );
  const corrected =
    rows.some((row) => Boolean(row.playerCorrectionReason)) ||
    corrections.some((correction) =>
      correction.effects.some((effect) => effect.matchupId === game.id),
    );
  const competition = (item: typeof game) =>
    competitionLabel({
      ...item,
      week: nflWeek,
      lifecycle: state.league.lifecycle,
    });
  return {
    historical: true,
    spectator: selfId !== state.viewer.entryId,
    gameIdentitiesVisible: true,
    league: {
      name: state.league.name,
      slug: state.league.slug,
      mode: state.league.mode,
    },
    week: {
      nflWeek,
      scope: game.scope,
      commonLockAt: "",
      competition: competition(game),
      entryClosed: true,
    },
    phase: corrected ? "CORRECTED" : "FINAL",
    phaseLabel: corrected ? "Corrected final" : "Final",
    resultStatus: "FINAL",
    broadcast: false,
    self: member(selfCard, !viewerIsB),
    opponent: member(opponentCard, viewerIsB),
    rows: { SETTLED: rows, IN_PROGRESS: [], REMAINING: [] },
    futureSealed: false,
    scorePath: {
      startingAllocationCredits: 1000,
      selfSettledCenticredits: rows
        .filter((row) => row.side === "SELF")
        .reduce((sum, row) => sum + (row.returnedCenticredits ?? 0), 0),
      opponentSettledCenticredits: rows
        .filter((row) => row.side === "OPPONENT")
        .reduce((sum, row) => sum + (row.returnedCenticredits ?? 0), 0),
      selfRemainingMaximumCenticredits: 0,
      opponentRemainingMaximumCenticredits: 0,
      furtherSubmissionsPossible: false,
      sentence: null,
    },
    freshness: {
      updatedAt: null,
      ageLabel: "",
      nextCheckAt: null,
      delayed: false,
      message: null,
    },
    correctedCount: new Set(
      rows.filter((row) => row.corrected).map((row) => row.eventId),
    ).size,
    scoreboard: games.map((item) => ({
      id: item.id,
      sideAName: names.get(item.sideAEntryId) ?? "Member",
      sideBName: names.get(item.sideBEntryId) ?? "Member",
      sideAScoreCenticredits: item.result?.sideAPointsForCenticredits ?? null,
      sideBScoreCenticredits: item.result?.sideBPointsForCenticredits ?? null,
      state: item.result?.status === "FINAL" ? "Final" : "Picks settled",
      competition: competition(item),
      selected: item.id === game.id,
      own: [item.sideAEntryId, item.sideBEntryId].includes(
        state.viewer.entryId,
      ),
      href:
        item.result?.status === "FINAL"
          ? matchupHref(state.league.slug, nflWeek, item.id)
          : undefined,
    })),
  };
}
