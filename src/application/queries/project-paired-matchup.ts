import type { LiveWeekOperations } from "@/application/queries/get-live-week-operations";
import type { Stage1StateDto } from "@/application/queries/stage1-dtos";
import { returnedCenticredits } from "@/domain/odds/american";

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
  marketType: "MONEYLINE" | "SPREAD" | "TOTAL";
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
  scoreCenticredits: number;
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
    | "Pregame"
    | "Locked"
    | "Live"
    | "Delayed"
    | "Provisional"
    | "Final"
    | "Corrected";
  selected: boolean;
};

export type PairedMatchupDto = {
  league: {
    name: string;
    slug: string;
    mode: "LIVE" | "SIMULATION";
  };
  week: {
    nflWeek: number;
    scope: "REGULAR" | "PLAYOFF" | "PLACEMENT" | "EXHIBITION";
    commonLockAt: string;
  };
  phase: PairedMatchupPhase;
  phaseLabel: string;
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
  };
  freshness: {
    updatedAt: string;
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
  if (card.compliance === "COMPLIANT") return "Sealed";
  if (card.compliance === "INCOMPLETE") return "Incomplete";
  if (weekState === "OPEN") return "Draft";
  return "Pending";
}

function opponentCardStatus(
  readiness: NonNullable<Stage1StateDto["matchup"]>["opponentReadiness"],
): string {
  if (readiness === "COMPLIANT") return "Sealed";
  if (readiness === "INCOMPLETE") return "Incomplete";
  if (readiness === "PENDING") return "Pending";
  return "Private";
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
): PairedMatchupDto | null {
  if (!state.week || !state.matchup || !state.ownerCard) return null;

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
    if (["FINAL", "VOID", "CORRECTED"].includes(event.state) && !settlement) {
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
      corrected: correctedEventIds.has(position.eventId),
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
  const selfScore =
    state.matchup.result?.selfPointsForCenticredits ?? derivedSelfScore;
  const opponentScore =
    state.matchup.result?.opponentPointsForCenticredits ?? derivedOpponentScore;
  if (state.matchup.result) {
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
  const opponentRemainingMaximum =
    state.matchup.opponentReadiness === "INCOMPLETE"
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
  const hasDegradedProvider = state.slate.some(
    (event) => event.providerHealth === "DEGRADED",
  );
  const hasUnconfirmedPastStart = state.slate.some(
    (event) =>
      event.state === "SCHEDULED" &&
      new Date(event.scheduledStartAt).getTime() <= now.getTime(),
  );
  const delayed = hasDegradedProvider || hasUnconfirmedPastStart;

  let phase: PairedMatchupPhase;
  if (correctedCount > 0) phase = "CORRECTED";
  else if (
    state.matchup.result?.status === "FINAL" ||
    state.week.state === "FINAL"
  )
    phase = "FINAL";
  else if (
    state.matchup.result?.status === "PROVISIONAL" ||
    state.week.state === "PROVISIONAL"
  )
    phase = "PROVISIONAL";
  else if (hasLiveEvent) phase = "LIVE";
  else if (delayed) phase = "DELAYED";
  else if (hasRevealedEvent) phase = "PARTIAL_REVEAL";
  else if (state.week.state === "LOCKED") phase = "LOCKED";
  else phase = "PREGAME";

  const phaseLabels: Record<PairedMatchupPhase, string> = {
    PREGAME: "Pregame",
    LOCKED: "Cards locked",
    PARTIAL_REVEAL: "Partial reveal",
    LIVE: "Live",
    DELAYED: "Updates delayed",
    PROVISIONAL: "Provisional",
    FINAL: "Final",
    CORRECTED: "Corrected",
  };
  const operationResultTimes = operations?.events.map(
    (event) => event.result?.recordedAt,
  );
  const updatedAt =
    maxIso([
      operations?.latestImportAt,
      ...(operationResultTimes ?? []),
      ...state.slate.map((event) => event.actualStartedAt),
      state.week.lockedAt,
      state.week.opensAt,
    ]) ?? state.week.opensAt;
  const freshnessMessage = hasDegradedProvider
    ? "The provider has marked this feed degraded. Stored facts remain visible while new updates may be delayed."
    : hasUnconfirmedPastStart
      ? "Scheduled kickoff has passed, but reliable Live state has not arrived. Future picks remain sealed."
      : operations &&
          operations.latestImportAt === null &&
          state.week.state !== "OPEN"
        ? "No score update has been stored yet. Scheduled time alone does not reveal picks."
        : null;

  const selfStanding = state.standings.find(
    (row) => row.entryId === state.viewer.entryId,
  );
  const opponentStanding = state.standings.find(
    (row) => row.entryId === state.matchup!.opponentEntryId,
  );
  const result = state.matchup.result;
  const self: MatchupMember = {
    entryId: state.viewer.entryId,
    displayName: state.viewer.displayName,
    record: recordLabel(selfStanding),
    seed: selfStanding?.seed ?? null,
    scoreCenticredits: selfScore,
    cardStatus: cardStatus(state.ownerCard, state.week.state),
    decision: result?.selfDecision ?? null,
  };
  const opponent: MatchupMember = {
    entryId: state.matchup.opponentEntryId,
    displayName: state.matchup.opponentName,
    record: recordLabel(opponentStanding),
    seed: opponentStanding?.seed ?? null,
    scoreCenticredits: opponentScore,
    cardStatus: opponentCardStatus(state.matchup.opponentReadiness),
    decision: result?.opponentDecision ?? null,
  };

  const scoreboardState = (
    selected: boolean,
    scheduleResult: Stage1StateDto["schedule"][number]["result"],
  ): LeagueScoreboardItem["state"] => {
    if (selected && phase === "CORRECTED") return "Corrected";
    if (scheduleResult?.status === "FINAL") return "Final";
    if (scheduleResult?.status === "PROVISIONAL") return "Provisional";
    if (hasLiveEvent || hasRevealedEvent) return "Live";
    if (delayed) return "Delayed";
    if (phase === "PREGAME") return "Pregame";
    return "Locked";
  };

  return {
    league: {
      name: state.league.name,
      slug: state.league.slug,
      mode: state.league.mode,
    },
    week: {
      nflWeek: state.week.nflWeek,
      scope: state.week.scope,
      commonLockAt: state.week.commonLockAt,
    },
    phase,
    phaseLabel: phaseLabels[phase],
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
      sentence: remainingPathSentence({
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
    freshness: { updatedAt, delayed, message: freshnessMessage },
    correctedCount,
    scoreboard: state.schedule.map((matchup) => ({
      id: matchup.id,
      sideAName: matchup.sideAName,
      sideBName: matchup.sideBName,
      sideAScoreCenticredits:
        matchup.id === state.matchup!.id
          ? state.matchup!.selfEntryId === matchup.sideAEntryId
            ? selfScore
            : opponentScore
          : (matchup.result?.sideAPointsForCenticredits ?? null),
      sideBScoreCenticredits:
        matchup.id === state.matchup!.id
          ? state.matchup!.selfEntryId === matchup.sideBEntryId
            ? selfScore
            : opponentScore
          : (matchup.result?.sideBPointsForCenticredits ?? null),
      state: scoreboardState(matchup.id === state.matchup!.id, matchup.result),
      selected: matchup.id === state.matchup!.id,
    })),
  };
}
