import type { LeagueMatchupCards } from "./league-matchup-dtos";
import type { MarketType } from "@/rulesets/schema";
import { competitionLabel } from "@/application/presentation/competition-label";
import {
  scoreFreshness,
  updateAge,
} from "@/application/queries/score-freshness";
import type { LiveWeekOperations } from "@/application/queries/get-live-week-operations";
import type { Stage1StateDto } from "@/application/queries/stage1-dtos";
import { returnedCenticredits } from "@/domain/odds/american";
import {
  distinctUnrevealedGames,
  rollingSubmissionStatus,
  type SelectedGame,
} from "./rolling-matchup";

export type PairedMatchupPhase =
  | "PREGAME"
  | "LOCKED"
  | "PARTIAL_REVEAL"
  | "LIVE"
  | "DELAYED"
  | "PROVISIONAL"
  | "FINAL"
  | "CORRECTED";

export type PositionLedgerSection = "SETTLED" | "IN_PROGRESS" | "REMAINING";

export type PositionLedgerItem = {
  id: string;
  side: "SELF" | "OPPONENT";
  memberName: string;
  eventId: string;
  eventLabel: string;
  scheduledStartAt: string;
  eventState: Stage1StateDto["slate"][number]["state"];
  marketType: MarketType;
  subjectId?: string | null;
  subjectLabel?: string | null;
  subjectTeam?: string | null;
  statistic?: "PASSING_YARDS" | "RUSHING_YARDS" | "RECEIVING_YARDS" | null;
  period?: "FULL_GAME" | null;
  finalYards?: number | null;
  playerEvidenceVersion?: number | null;
  playerCorrectionReason?: string | null;
  proposition: string;
  americanOdds: number;
  stakeCredits: number;
  outcome: "WIN" | "LOSS" | "PUSH" | "VOID" | null;
  returnedCenticredits: number | null;
  section: PositionLedgerSection;
  corrected: boolean;
};

type MatchupMember = {
  entryId: string;
  displayName: string;
  record: string;
  seed: number | null;
  seedKind: "PLAYOFF" | "REGULAR";
  scoreCenticredits: number | null;
  outstanding: { picks: number; credits: number } | null;
  selectedGames?: SelectedGame[];
  availableCredits?: number | null;
  expiredCredits?: number | null;
  canSubmit?: boolean | null;
  cardStatus: string;
  decision: "WIN" | "LOSS" | "TIE" | null;
};

export type LeagueScoreboardItem = {
  id: string;
  sideAName: string;
  sideBName: string;
  sideAScoreCenticredits: number | null;
  sideBScoreCenticredits: number | null;
  state:
    | "Not started"
    | "Locked"
    | "Live"
    | "Delayed"
    | "Picks settled"
    | "Final"
    | "Corrected";
  competition: string;
  selected: boolean;
  own?: boolean;
  href?: string;
};

export type PairedMatchupDto = {
  spectator?: boolean;
  gameIdentitiesVisible?: boolean;
  league: {
    name: string;
    slug: string;
    mode: "LIVE" | "SIMULATION";
  };
  week: {
    nflWeek: number;
    scope: "REGULAR" | "PLAYOFF" | "PLACEMENT" | "EXHIBITION";
    commonLockAt: string;
    competition?: string;
    rollingSubmissionsEnabled?: boolean;
    entryClosed?: boolean;
    entryClosesAt?: string | null;
  };
  phase: PairedMatchupPhase;
  phaseLabel: string;
  resultStatus: "PROVISIONAL" | "FINAL" | null;
  broadcast: boolean;
  self: MatchupMember;
  opponent: MatchupMember;
  rows: Record<PositionLedgerSection, PositionLedgerItem[]>;
  futureSealed: boolean;
  scorePath: {
    startingAllocationCredits: number;
    selfSettledCenticredits: number;
    opponentSettledCenticredits: number;
    selfRemainingMaximumCenticredits: number;
    opponentRemainingMaximumCenticredits: number | null;
    sentence: string | null;
    furtherSubmissionsPossible?: boolean;
  };
  freshness: {
    updatedAt: string | null;
    ageLabel: string;
    nextCheckAt: string | null;
    delayed: boolean;
    message: string | null;
  };
  correctedCount: number;
  scoreboard: LeagueScoreboardItem[];
};

type AuthorizedPosition =
  | NonNullable<Stage1StateDto["ownerCard"]>["positions"][number]
  | NonNullable<Stage1StateDto["matchup"]>["opponentRevealedPositions"][number];

function recordLabel(
  row: Stage1StateDto["standings"][number] | undefined,
): string {
  if (!row) return "0–0";
  return row.ties > 0
    ? `${row.wins}–${row.losses}–${row.ties}`
    : `${row.wins}–${row.losses}`;
}

function maxIso(values: Array<string | null | undefined>): string | null {
  const valid = values
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, time: new Date(value).getTime() }))
    .filter(({ time }) => Number.isFinite(time));
  if (valid.length === 0) return null;
  return valid.reduce((latest, value) =>
    value.time > latest.time ? value : latest,
  ).value;
}

function sumSettled(
  rows: PositionLedgerItem[],
  side: PositionLedgerItem["side"],
): number {
  return rows.reduce(
    (total, row) =>
      row.side === side ? total + (row.returnedCenticredits ?? 0) : total,
    0,
  );
}

function sumRemainingMaximum(
  rows: PositionLedgerItem[],
  side: PositionLedgerItem["side"],
): number {
  return rows.reduce((total, row) => {
    if (row.side !== side || row.returnedCenticredits !== null) return total;
    return (
      total +
      Number(returnedCenticredits(row.stakeCredits, row.americanOdds, "WIN"))
    );
  }, 0);
}

function officialScoreFromSettlements(
  compliance: "COMPLIANT" | "INCOMPLETE" | "PENDING" | null,
  settledCenticredits: number,
): number | null {
  if (compliance === "INCOMPLETE") return 0;
  if (compliance === "COMPLIANT") return settledCenticredits;
  return null;
}

function cardStatus(
  card: NonNullable<Stage1StateDto["ownerCard"]>,
  weekState: NonNullable<Stage1StateDto["week"]>["state"],
): string {
  if (card.compliance === "INCOMPLETE") return "Incomplete";
  if (
    card.compliance === "COMPLIANT" ||
    (card.allocatedCredits === card.grantedCredits &&
      card.remainingCredits === 0)
  )
    return "Sealed";
  if (weekState === "OPEN") return "Not started";
  return "Pending";
}

export function opponentCardStatus(
  readiness: NonNullable<Stage1StateDto["matchup"]>["opponentReadiness"],
  sealed: NonNullable<Stage1StateDto["matchup"]>["opponentSealed"],
): string {
  if (readiness === "COMPLIANT") return "Sealed";
  if (readiness === "INCOMPLETE") return "Incomplete";
  if (readiness === "PENDING") return "Pending";
  if (sealed === true) return "Sealed";
  if (sealed === false) return "Not sealed";
  return "Status unavailable";
}

function remainingPathSentence(params: {
  selfName: string;
  opponentName: string;
  selfScore: number;
  opponentScore: number;
  selfRemainingMaximum: number;
  opponentRemainingMaximum: number | null;
  result: NonNullable<Stage1StateDto["matchup"]>["result"];
  scope: NonNullable<Stage1StateDto["week"]>["scope"];
}): string | null {
  if (params.result) {
    const margin = Math.abs(params.selfScore - params.opponentScore);
    if (params.result.selfDecision === "TIE") {
      return params.scope === "PLAYOFF"
        ? "The official score is tied; the higher frozen seed advances."
        : "The official matchup score is tied.";
    }
    const leader =
      params.result.selfDecision === "WIN"
        ? params.selfName
        : params.opponentName;
    return `${leader} leads the official result by ${formatCredits(margin)} credits.`;
  }

  if (params.opponentRemainingMaximum === null) {
    return "Future picks remain sealed, so an exact remaining path is not available yet.";
  }

  if (
    params.selfRemainingMaximum === 0 &&
    params.opponentRemainingMaximum === 0
  ) {
    return "All authorized picks have settled. The official matchup result is pending.";
  }

  if (
    params.selfScore >
    params.opponentScore + params.opponentRemainingMaximum
  ) {
    return `${params.selfName} has clinched; the remaining authorized picks cannot erase the lead.`;
  }
  if (params.opponentScore > params.selfScore + params.selfRemainingMaximum) {
    return `${params.opponentName} has clinched; the remaining authorized picks cannot erase the lead.`;
  }

  if (params.selfScore === params.opponentScore) {
    return params.scope === "PLAYOFF"
      ? "Returned credits from the remaining picks decide the score; an exact tie advances the higher frozen seed."
      : "Returned credits from the remaining picks decide the matchup; equal remaining returns preserve the tie.";
  }

  const selfLeads = params.selfScore > params.opponentScore;
  const leader = selfLeads ? params.selfName : params.opponentName;
  const trailer = selfLeads ? params.opponentName : params.selfName;
  const margin = Math.abs(params.selfScore - params.opponentScore);
  return `${leader} leads by ${formatCredits(margin)} credits. ${trailer} must out-return ${leader} by more than that across the remaining picks to win.`;
}

function formatCredits(value: number): string {
  const whole = Math.trunc(value / 100);
  const cents = Math.abs(value % 100);
  return `${new Intl.NumberFormat("en-US").format(whole)}.${cents
    .toString()
    .padStart(2, "0")}`;
}

export function projectPairedMatchup(
  state: Stage1StateDto,
  operations: LiveWeekOperations | null,
  now: Date = new Date(),
  qualificationSeeds: ReadonlyMap<string, number> = new Map(),
  leagueCards: LeagueMatchupCards | null = null,
): PairedMatchupDto | null {
  if (!state.week || !state.matchup || !state.ownerCard) return null;
  if (state.league.mode === "SIMULATION" && state.season.simulatedNow) {
    now = new Date(state.season.simulatedNow);
  }
  const rolling = state.week.rollingSubmissionsEnabled === true;
  const entryClosed = state.week.entryClosed === true;
  const cardsByEntry = new Map(
    (leagueCards?.weekId === state.week.id ? leagueCards.cards : []).map(
      (card) => [card.entryId, card],
    ),
  );
  const opponentPublicCard = cardsByEntry.get(state.matchup.opponentEntryId);
  const gameIdentitiesVisible =
    opponentPublicCard?.selectedGames !== undefined ||
    state.matchup.opponentSelectedGames !== undefined;
  const opponentCanSubmit =
    opponentPublicCard?.canSubmit ?? state.matchup.opponentCanSubmit;
  // Unknown public availability is not proof that a member is finished.
  const furtherSubmissionsPossible =
    rolling &&
    !entryClosed &&
    (state.ownerCard.canSubmit !== false ||
      opponentCanSubmit !== false ||
      state.ownerCard.positions.length === 0 ||
      state.matchup.opponentSubmitted !== true);
  // A stale result must not claim a win while another accepted bet is possible.
  const result = furtherSubmissionsPossible ? null : state.matchup.result;

  const eventById = new Map(state.slate.map((event) => [event.id, event]));
  const operationByEventId = new Map(
    (operations?.events ?? []).map((event) => [event.id, event]),
  );
  const correctedEventIds = new Set(
    state.slate
      .filter(
        (event) =>
          event.state === "CORRECTED" ||
          (operationByEventId.get(event.id)?.correctionCount ?? 0) > 0,
      )
      .map((event) => event.id),
  );

  const toLedgerItem = (
    position: AuthorizedPosition,
    side: PositionLedgerItem["side"],
    memberName: string,
  ): PositionLedgerItem => {
    const event = eventById.get(position.eventId);
    if (!event) {
      throw new Error(
        "A paired matchup receipt is missing its authorized event.",
      );
    }
    const settlement = position.settlement ?? null;
    if (
      ["FINAL", "VOID", "CORRECTED"].includes(event.state) &&
      !settlement &&
      !position.subjectId
    ) {
      throw new Error(
        "An authorized completed event is missing its official settlement.",
      );
    }
    return {
      id: position.id,
      side,
      memberName,
      eventId: position.eventId,
      eventLabel: position.eventLabel,
      scheduledStartAt: event.scheduledStartAt,
      eventState: event.state,
      marketType: position.marketType,
      subjectId: position.subjectId,
      subjectLabel: position.subjectLabel,
      subjectTeam: position.subjectTeam,
      statistic: position.statistic,
      period: position.period,
      finalYards: settlement?.finalYards ?? null,
      playerEvidenceVersion: settlement?.playerEvidenceVersion ?? null,
      playerCorrectionReason: settlement?.playerCorrectionReason ?? null,
      proposition: position.proposition,
      americanOdds: position.americanOdds,
      stakeCredits: position.stakeCredits,
      outcome: settlement?.outcome ?? null,
      returnedCenticredits: settlement?.returnedCenticredits ?? null,
      section: settlement
        ? "SETTLED"
        : event.state === "LIVE"
          ? "IN_PROGRESS"
          : "REMAINING",
      corrected:
        correctedEventIds.has(position.eventId) ||
        Boolean(settlement?.playerCorrectionReason),
    };
  };

  const ownerRows = state.ownerCard.positions.map((position) =>
    toLedgerItem(position, "SELF", state.viewer.displayName),
  );
  const opponentRows = state.matchup.opponentRevealedPositions.map((position) =>
    toLedgerItem(position, "OPPONENT", state.matchup!.opponentName),
  );
  const marketOrder = new Map([
    ["MONEYLINE", 0],
    ["SPREAD", 1],
    ["TOTAL", 2],
  ]);
  const allRows = [...ownerRows, ...opponentRows].sort((left, right) => {
    const eventDifference =
      new Date(left.scheduledStartAt).getTime() -
      new Date(right.scheduledStartAt).getTime();
    if (eventDifference !== 0) return eventDifference;
    if (left.side !== right.side) return left.side === "SELF" ? -1 : 1;
    const marketDifference =
      (marketOrder.get(left.marketType) ?? 99) -
      (marketOrder.get(right.marketType) ?? 99);
    return marketDifference === 0
      ? left.id.localeCompare(right.id)
      : marketDifference;
  });

  const selfSettled = sumSettled(allRows, "SELF");
  const opponentSettled = sumSettled(allRows, "OPPONENT");
  const derivedSelfScore =
    officialScoreFromSettlements(state.ownerCard.compliance, selfSettled) ??
    selfSettled;
  const derivedOpponentScore =
    officialScoreFromSettlements(
      state.matchup.opponentReadiness,
      opponentSettled,
    ) ?? opponentSettled;
  const selfScore = result?.selfPointsForCenticredits ?? derivedSelfScore;
  const opponentScore =
    result?.opponentPointsForCenticredits ?? derivedOpponentScore;
  if (result) {
    const expectedSelfScore = officialScoreFromSettlements(
      state.ownerCard.compliance,
      selfSettled,
    );
    const expectedOpponentScore = officialScoreFromSettlements(
      state.matchup.opponentReadiness,
      opponentSettled,
    );
    if (
      expectedSelfScore === null ||
      expectedOpponentScore === null ||
      selfScore !== expectedSelfScore ||
      opponentScore !== expectedOpponentScore
    ) {
      throw new Error(
        "The official paired score does not reproduce from authorized settlements and card compliance.",
      );
    }
  }
  const selfRemainingMaximum =
    state.ownerCard.compliance === "INCOMPLETE"
      ? 0
      : sumRemainingMaximum(allRows, "SELF");
  const opponentRemainingMaximum = furtherSubmissionsPossible
    ? null
    : state.matchup.opponentReadiness === "INCOMPLETE"
      ? 0
      : state.matchup.futureSealed
        ? null
        : sumRemainingMaximum(allRows, "OPPONENT");

  const relevantEventIds = new Set(allRows.map((row) => row.eventId));
  const correctedCount = [...correctedEventIds].filter((eventId) =>
    relevantEventIds.has(eventId),
  ).length;
  const hasLiveEvent = state.slate.some((event) => event.state === "LIVE");
  const hasRevealedEvent = state.slate.some((event) =>
    ["LIVE", "FINAL", "VOID", "CORRECTED"].includes(event.state),
  );
  const scoresAvailable = hasRevealedEvent || Boolean(result);
  const hasDegradedProvider = state.slate.some(
    (event) => event.providerHealth === "DEGRADED",
  );
  const hasUnconfirmedPastStart = state.slate.some(
    (event) =>
      event.state === "SCHEDULED" &&
      new Date(event.scheduledStartAt).getTime() <= now.getTime(),
  );
  const scoreUpdate = scoreFreshness(operations, now);
  const delayed =
    hasDegradedProvider ||
    (state.league.mode === "LIVE" && operations
      ? scoreUpdate.delayed
      : hasUnconfirmedPastStart);

  let phase: PairedMatchupPhase;
  if (correctedCount > 0) phase = "CORRECTED";
  else if (
    result?.status === "FINAL" ||
    (!furtherSubmissionsPossible && state.week.state === "FINAL")
  )
    phase = "FINAL";
  else if (
    result?.status === "PROVISIONAL" ||
    (!furtherSubmissionsPossible && state.week.state === "PROVISIONAL")
  )
    phase = "PROVISIONAL";
  else if (delayed) phase = "DELAYED";
  else if (hasLiveEvent) phase = "LIVE";
  else if (hasRevealedEvent) phase = "PARTIAL_REVEAL";
  else if (
    rolling
      ? entryClosed
      : state.week.state === "LOCKED" ||
        now.getTime() >= new Date(state.week.commonLockAt).getTime()
  )
    phase = "LOCKED";
  else phase = "PREGAME";

  const phaseLabels: Record<PairedMatchupPhase, string> = {
    PREGAME: "Pregame",
    LOCKED: rolling ? "Betting closed" : "Cards locked",
    PARTIAL_REVEAL: "Partial reveal",
    LIVE: "Live",
    DELAYED: "Updates delayed",
    PROVISIONAL: "Picks settled",
    FINAL: "Final",
    CORRECTED: "Corrected",
  };
  const operationResultTimes = operations?.events.map(
    (event) => event.result?.recordedAt,
  );
  const updatedAt =
    state.league.mode === "LIVE"
      ? scoreUpdate.latestFetch
      : maxIso([
          ...(operationResultTimes ?? []),
          ...state.slate.map((event) => event.actualStartedAt),
        ]);
  const freshnessMessage = hasDegradedProvider
    ? "Game updates are delayed. Your last confirmed scores are shown."
    : state.league.mode === "LIVE" && operations
      ? scoreUpdate.message
      : hasUnconfirmedPastStart
        ? "Start confirmation is delayed. Picks stay sealed until play is confirmed."
        : null;

  const selfStanding = state.standings.find(
    (row) => row.entryId === state.viewer.entryId,
  );
  const opponentStanding = state.standings.find(
    (row) => row.entryId === state.matchup!.opponentEntryId,
  );
  const usesPlayoffSeeds = state.matchup.postseasonRole === "CHAMPIONSHIP";
  const selfPlayoffSeed = usesPlayoffSeeds
    ? (qualificationSeeds.get(state.viewer.entryId) ?? null)
    : null;
  const opponentPlayoffSeed = usesPlayoffSeeds
    ? (qualificationSeeds.get(state.matchup.opponentEntryId) ?? null)
    : null;
  const self: MatchupMember = {
    entryId: state.viewer.entryId,
    displayName: state.viewer.displayName,
    record: recordLabel(selfStanding),
    seed: selfPlayoffSeed ?? selfStanding?.seed ?? null,
    seedKind: selfPlayoffSeed === null ? "REGULAR" : "PLAYOFF",
    scoreCenticredits: scoresAvailable ? selfScore : null,
    outstanding: cardsByEntry.get(state.viewer.entryId)?.outstanding ?? null,
    selectedGames: gameIdentitiesVisible
      ? distinctUnrevealedGames(state.ownerCard.positions, state.slate)
      : undefined,
    availableCredits: rolling
      ? entryClosed
        ? 0
        : state.ownerCard.remainingCredits
      : undefined,
    expiredCredits: rolling
      ? entryClosed
        ? state.ownerCard.remainingCredits
        : 0
      : undefined,
    canSubmit: rolling ? state.ownerCard.canSubmit : undefined,
    cardStatus: rolling
      ? rollingSubmissionStatus(
          state.ownerCard.positions.length > 0,
          entryClosed,
        )
      : cardStatus(state.ownerCard, state.week.state),
    decision: result?.selfDecision ?? null,
  };
  const opponent: MatchupMember = {
    entryId: state.matchup.opponentEntryId,
    displayName: state.matchup.opponentName,
    record: recordLabel(opponentStanding),
    seed: opponentPlayoffSeed ?? opponentStanding?.seed ?? null,
    seedKind: opponentPlayoffSeed === null ? "REGULAR" : "PLAYOFF",
    scoreCenticredits: scoresAvailable ? opponentScore : null,
    outstanding:
      cardsByEntry.get(state.matchup.opponentEntryId)?.outstanding ?? null,
    selectedGames: gameIdentitiesVisible
      ? distinctUnrevealedGames(
          opponentPublicCard?.selectedGames ??
            state.matchup.opponentSelectedGames,
          state.slate,
        )
      : undefined,
    availableCredits: rolling
      ? (opponentPublicCard?.availableCredits ??
        state.matchup.opponentAvailableCredits ??
        null)
      : undefined,
    expiredCredits: rolling
      ? (opponentPublicCard?.expiredCredits ??
        state.matchup.opponentExpiredCredits ??
        null)
      : undefined,
    canSubmit: rolling ? (opponentCanSubmit ?? null) : undefined,
    cardStatus: rolling
      ? rollingSubmissionStatus(
          state.matchup.opponentSubmitted ?? opponentPublicCard?.submitted,
          entryClosed,
        )
      : opponentCardStatus(
          state.matchup.opponentReadiness,
          state.matchup.opponentSealed,
        ),
    decision: result?.opponentDecision ?? null,
  };

  const scoreboardState = (
    selected: boolean,
    scheduleResult: Stage1StateDto["schedule"][number]["result"],
  ): LeagueScoreboardItem["state"] => {
    if (selected && phase === "CORRECTED") return "Corrected";
    if (selected && furtherSubmissionsPossible) scheduleResult = null;
    if (scheduleResult?.status === "FINAL") return "Final";
    if (scheduleResult?.status === "PROVISIONAL") return "Picks settled";
    if (delayed) return "Delayed";
    if (hasLiveEvent || hasRevealedEvent) return "Live";
    if (phase === "PREGAME") return "Not started";
    return "Locked";
  };

  return {
    gameIdentitiesVisible,
    league: {
      name: state.league.name,
      slug: state.league.slug,
      mode: state.league.mode,
    },
    week: {
      nflWeek: state.week.nflWeek,
      scope: state.week.scope,
      commonLockAt: state.week.commonLockAt,
      rollingSubmissionsEnabled: rolling,
      entryClosed: rolling ? entryClosed : undefined,
      entryClosesAt: state.week.entryClosesAt,
      competition: competitionLabel({
        scope: state.week.scope,
        postseasonRole: state.matchup.postseasonRole,
        week: state.week.nflWeek,
        lifecycle: state.league.lifecycle,
      }),
    },
    phase,
    phaseLabel: phaseLabels[phase],
    resultStatus: result?.status ?? null,
    broadcast: hasLiveEvent,
    self,
    opponent,
    rows: {
      SETTLED: allRows.filter((row) => row.section === "SETTLED"),
      IN_PROGRESS: allRows.filter((row) => row.section === "IN_PROGRESS"),
      REMAINING: allRows.filter((row) => row.section === "REMAINING"),
    },
    futureSealed: state.matchup.futureSealed,
    scorePath: {
      startingAllocationCredits: state.ownerCard.grantedCredits,
      selfSettledCenticredits: selfSettled,
      opponentSettledCenticredits: opponentSettled,
      selfRemainingMaximumCenticredits: selfRemainingMaximum,
      opponentRemainingMaximumCenticredits: opponentRemainingMaximum,
      furtherSubmissionsPossible,
      sentence: furtherSubmissionsPossible
        ? "More bets can still be submitted on games that have not started. The matchup remains open."
        : remainingPathSentence({
            selfName: self.displayName,
            opponentName: opponent.displayName,
            selfScore,
            opponentScore,
            selfRemainingMaximum,
            opponentRemainingMaximum,
            result,
            scope: state.week.scope,
          }),
    },
    freshness: {
      updatedAt,
      delayed,
      message: freshnessMessage,
      ageLabel: updatedAt ? updateAge(updatedAt, now) : "Not checked yet",
      nextCheckAt: scoreUpdate.nextCheckAt,
    },
    correctedCount,
    scoreboard: state.schedule.map((matchup) => {
      const sideA = cardsByEntry.get(matchup.sideAEntryId);
      const sideB = cardsByEntry.get(matchup.sideBEntryId);
      const resultVisible =
        !rolling ||
        entryClosed ||
        (sideA?.submitted === true &&
          sideB?.submitted === true &&
          sideA.canSubmit === false &&
          sideB.canSubmit === false);
      const matchupResult = resultVisible ? matchup.result : null;
      return {
        id: matchup.id,
        sideAName: matchup.sideAName,
        sideBName: matchup.sideBName,
        sideAScoreCenticredits:
          matchup.id === state.matchup!.id && scoresAvailable
            ? state.matchup!.selfEntryId === matchup.sideAEntryId
              ? selfScore
              : opponentScore
            : (matchupResult?.sideAPointsForCenticredits ??
              cardsByEntry.get(matchup.sideAEntryId)?.scoreCenticredits ??
              null),
        sideBScoreCenticredits:
          matchup.id === state.matchup!.id && scoresAvailable
            ? state.matchup!.selfEntryId === matchup.sideBEntryId
              ? selfScore
              : opponentScore
            : (matchupResult?.sideBPointsForCenticredits ??
              cardsByEntry.get(matchup.sideBEntryId)?.scoreCenticredits ??
              null),
        state: scoreboardState(matchup.id === state.matchup!.id, matchupResult),
        competition: competitionLabel({
          ...matchup,
          week: state.week!.nflWeek,
          lifecycle: state.league.lifecycle,
        }),
        selected: matchup.id === state.matchup!.id,
        own: matchup.id === state.matchup!.id,
        href:
          matchup.id === state.matchup!.id
            ? `/l/${state.league.slug}/matchup`
            : cardsByEntry.has(matchup.sideAEntryId) &&
                cardsByEntry.has(matchup.sideBEntryId)
              ? `/l/${state.league.slug}/matchup?matchup=${matchup.id}`
              : undefined,
      };
    }),
  };
}
