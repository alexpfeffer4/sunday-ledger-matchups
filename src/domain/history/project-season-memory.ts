import type {
  MatchupScope,
  PostseasonRole,
  WeeklyCloseStandingsRow,
  WeeklyCloseStateDto,
} from "@/application/queries/weekly-close-dtos";

type Decision = "WIN" | "LOSS" | "TIE";

export type MemberFact = {
  entryId: string;
  userId: string;
  displayName: string;
};

export type StandingFact = Pick<
  WeeklyCloseStandingsRow,
  | "wins"
  | "losses"
  | "ties"
  | "pointsForCenticredits"
  | "allPlayHalfWinUnits"
  | "allPlayComparisonCount"
> & { seed: number | null };

export type CorrectionFact = {
  id: string;
  eventLabel: string;
  reason: string;
  actorName: string;
  correctedAt: string;
  beforeEvent: string;
  afterEvent: string;
  beforeSideAScoreCenticredits: number | null;
  beforeSideBScoreCenticredits: number | null;
  afterSideAScoreCenticredits: number;
  afterSideBScoreCenticredits: number;
};

export type FinalizedMatchupFact = {
  id: string;
  seasonId: string;
  nflYear: number;
  weekId: string;
  nflWeek: number;
  scope: MatchupScope;
  postseasonRole: PostseasonRole | null;
  displayOrder: number;
  versionId: string;
  supersedesVersionId: string | null;
  status: "PROVISIONAL" | "FINAL";
  recordedAt: string;
  sideA: {
    entryId: string;
    userId: string;
    name: string;
    decision: Decision;
    scoreCenticredits: number;
    participation: "COMPLETED" | "EXHIBITION_MISS";
  };
  sideB: {
    entryId: string;
    userId: string;
    name: string;
    decision: Decision;
    scoreCenticredits: number;
    participation: "COMPLETED" | "EXHIBITION_MISS";
  };
  marginCenticredits: number;
  corrected: boolean;
  corrections: CorrectionFact[];
};

export type ViewerMatchupFact = FinalizedMatchupFact & {
  self: FinalizedMatchupFact["sideA"];
  opponent: FinalizedMatchupFact["sideA"];
};

export type RecordBridgeFact = {
  matchup: ViewerMatchupFact;
  before: StandingFact | null;
  after: StandingFact | null;
  standingsEffect: "REGULAR" | "NONE";
  correctionWindowClosesAt: string | null;
  nextOpponent: {
    entryId: string;
    name: string;
    nflWeek: number;
    scope: MatchupScope;
  } | null;
};

export type PlayoffCutlineFact = {
  kind: "CURRENT" | "FROZEN";
  qualifierCount: number;
  lastIn: { entryId: string; name: string; seed: number } | null;
  firstOut: { entryId: string; name: string; seed: number } | null;
  viewerState:
    "CURRENTLY_INSIDE" | "CURRENTLY_OUTSIDE" | "QUALIFIED" | "DID_NOT_QUALIFY";
};

export type SeasonMemoryProjection = {
  league: WeeklyCloseStateDto["league"];
  viewer: MemberFact;
  members: MemberFact[];
  recordBridge: RecordBridgeFact | null;
  activeHistory: ViewerMatchupFact[];
  finalizedMatchups: FinalizedMatchupFact[];
  playoffCutline: PlayoffCutlineFact | null;
};

export type RivalryProjection = {
  memberA: MemberFact;
  memberB: MemberFact;
  meetings: FinalizedMatchupFact[];
  competitiveMeetings: FinalizedMatchupFact[];
  memberAWins: number;
  memberBWins: number;
  ties: number;
  streak: { name: string; count: number } | null;
  averageMarginCenticredits: number | null;
  lastMeeting: FinalizedMatchupFact | null;
  playoffMeetings: number;
  thirdPlaceMeetings: number;
  placementMeetings: number;
  exhibitionMeetings: number;
};

export const scopeLabels: Record<MatchupScope, string> = {
  REGULAR: "Regular season",
  PLAYOFF: "Playoff",
  PLACEMENT: "Placement",
  EXHIBITION: "Exhibition",
};

export function matchupScopeLabel(
  matchup: Pick<FinalizedMatchupFact, "scope" | "postseasonRole">,
): string {
  if (matchup.postseasonRole === "CHAMPIONSHIP") return "Championship";
  if (matchup.postseasonRole === "THIRD_PLACE") return "Third place";
  if (matchup.postseasonRole === "PLACEMENT") return "Placement";
  if (matchup.postseasonRole === "EXHIBITION") return "Exhibition";
  return scopeLabels[matchup.scope];
}

function memberName(
  membersByUser: Map<string, MemberFact>,
  userId: string,
): string {
  return membersByUser.get(userId)?.displayName ?? "Former league member";
}

function eventScore(event: {
  status: "FINAL" | "VOID";
  awayScore: number | null;
  homeScore: number | null;
}): string {
  return event.status === "VOID"
    ? "Void"
    : `${event.awayScore ?? 0}–${event.homeScore ?? 0}`;
}

function standingFact(
  row: WeeklyCloseStandingsRow | undefined,
): StandingFact | null {
  if (!row) return null;
  return {
    seed: row.seed,
    wins: row.wins,
    losses: row.losses,
    ties: row.ties,
    pointsForCenticredits: row.pointsForCenticredits,
    allPlayHalfWinUnits: row.allPlayHalfWinUnits,
    allPlayComparisonCount: row.allPlayComparisonCount,
  };
}

function correctionFacts(
  state: WeeklyCloseStateDto,
  matchup: WeeklyCloseStateDto["matchups"][number],
): CorrectionFact[] {
  return state.corrections.flatMap((correction) => {
    const effect = correction.effects.find(
      (candidate) => candidate.matchupId === matchup.id,
    );
    if (!effect) return [];
    return [
      {
        id: correction.id,
        eventLabel: correction.eventLabel,
        reason: correction.reason,
        actorName: correction.actorName,
        correctedAt: correction.correctedAt,
        beforeEvent: eventScore(correction.originalEvent),
        afterEvent: eventScore(correction.correctedEvent),
        beforeSideAScoreCenticredits:
          effect.before?.sideAPointsForCenticredits ?? null,
        beforeSideBScoreCenticredits:
          effect.before?.sideBPointsForCenticredits ?? null,
        afterSideAScoreCenticredits: effect.after.sideAPointsForCenticredits,
        afterSideBScoreCenticredits: effect.after.sideBPointsForCenticredits,
      },
    ];
  });
}

function matchupFact(
  state: WeeklyCloseStateDto,
  matchup: WeeklyCloseStateDto["matchups"][number],
  membersByUser: Map<string, MemberFact>,
): FinalizedMatchupFact | null {
  const { result } = matchup;
  if (!result) return null;
  const corrections = correctionFacts(state, matchup);
  return {
    id: matchup.id,
    seasonId: matchup.seasonId,
    nflYear: matchup.nflYear,
    weekId: matchup.weekId,
    nflWeek: matchup.nflWeek,
    scope: matchup.scope,
    postseasonRole: matchup.postseasonRole ?? null,
    displayOrder: matchup.displayOrder,
    versionId: result.versionId,
    supersedesVersionId: result.supersedesVersionId,
    status: result.status,
    recordedAt: result.recordedAt,
    sideA: {
      entryId: matchup.sideAEntryId,
      userId: matchup.sideAUserId,
      name: memberName(membersByUser, matchup.sideAUserId),
      decision: result.sideADecision,
      scoreCenticredits: result.sideAPointsForCenticredits,
      participation: result.sideAParticipation ?? "COMPLETED",
    },
    sideB: {
      entryId: matchup.sideBEntryId,
      userId: matchup.sideBUserId,
      name: memberName(membersByUser, matchup.sideBUserId),
      decision: result.sideBDecision,
      scoreCenticredits: result.sideBPointsForCenticredits,
      participation: result.sideBParticipation ?? "COMPLETED",
    },
    marginCenticredits: Math.abs(
      result.sideAPointsForCenticredits - result.sideBPointsForCenticredits,
    ),
    corrected: corrections.length > 0,
    corrections,
  };
}

function asViewerMatchup(
  matchup: FinalizedMatchupFact,
  viewerUserId: string,
): ViewerMatchupFact | null {
  if (matchup.sideA.userId === viewerUserId) {
    return { ...matchup, self: matchup.sideA, opponent: matchup.sideB };
  }
  if (matchup.sideB.userId === viewerUserId) {
    return { ...matchup, self: matchup.sideB, opponent: matchup.sideA };
  }
  return null;
}

function matchupOrder(
  left: FinalizedMatchupFact,
  right: FinalizedMatchupFact,
): number {
  return (
    left.nflYear - right.nflYear ||
    left.nflWeek - right.nflWeek ||
    left.displayOrder - right.displayOrder ||
    left.id.localeCompare(right.id)
  );
}

function projectCutline(
  state: WeeklyCloseStateDto,
  viewerEntryId: string,
): PlayoffCutlineFact | null {
  const latest = state.standings
    .toSorted(
      (left, right) =>
        left.throughWeek - right.throughWeek ||
        left.snapshotId.localeCompare(right.snapshotId),
    )
    .at(-1);
  const qualifierCount =
    state.playoffField?.qualifierCount ?? state.season.qualifierCount;
  if (!latest || !qualifierCount || latest.rows.length < qualifierCount) {
    return null;
  }

  const frozen = state.playoffField !== null;
  const qualifiedIds = new Set(
    state.playoffField?.qualifiers.map((qualifier) => qualifier.entryId) ?? [],
  );
  const viewerSeed = latest.rows.find(
    (row) => row.entryId === viewerEntryId,
  )?.seed;
  const lastIn = latest.rows[qualifierCount - 1];
  const firstOut = latest.rows[qualifierCount];

  return {
    kind: frozen ? "FROZEN" : "CURRENT",
    qualifierCount,
    lastIn: lastIn
      ? { entryId: lastIn.entryId, name: lastIn.displayName, seed: lastIn.seed }
      : null,
    firstOut: firstOut
      ? {
          entryId: firstOut.entryId,
          name: firstOut.displayName,
          seed: firstOut.seed,
        }
      : null,
    viewerState: frozen
      ? qualifiedIds.has(viewerEntryId)
        ? "QUALIFIED"
        : "DID_NOT_QUALIFY"
      : (viewerSeed ?? Number.POSITIVE_INFINITY) <= qualifierCount
        ? "CURRENTLY_INSIDE"
        : "CURRENTLY_OUTSIDE",
  };
}

export function projectSeasonMemory(
  state: WeeklyCloseStateDto,
): SeasonMemoryProjection {
  const members = state.members.map((member) => ({ ...member }));
  const membersByUser = new Map(
    members.map((member) => [member.userId, member] as const),
  );
  const viewer = members.find(
    (member) => member.entryId === state.viewer.entryId,
  );
  if (!viewer)
    throw new Error("The authorized viewer is not in the season roster.");

  const allResults = state.matchups
    .map((matchup) => matchupFact(state, matchup, membersByUser))
    .filter((matchup): matchup is FinalizedMatchupFact => matchup !== null)
    .sort(matchupOrder);
  const finalizedMatchups = allResults.filter(
    (matchup) => matchup.status === "FINAL",
  );
  const activeViewerResults = allResults
    .filter((matchup) => matchup.seasonId === state.season.id)
    .map((matchup) => asViewerMatchup(matchup, viewer.userId))
    .filter((matchup): matchup is ViewerMatchupFact => matchup !== null);
  const activeHistory = activeViewerResults
    .filter((matchup) => matchup.status === "FINAL")
    .toReversed();
  const target = activeViewerResults.at(-1) ?? null;

  let recordBridge: RecordBridgeFact | null = null;
  if (target) {
    const week = state.weeks.find(
      (candidate) => candidate.id === target.weekId,
    );
    const targetSnapshot = state.standings.find(
      (snapshot) => snapshot.throughWeek === target.nflWeek,
    );
    const priorSnapshot = state.standings
      .filter((snapshot) => snapshot.throughWeek < target.nflWeek)
      .toSorted(
        (left, right) =>
          left.throughWeek - right.throughWeek ||
          left.snapshotId.localeCompare(right.snapshotId),
      )
      .at(-1);
    const after = standingFact(
      targetSnapshot?.rows.find((row) => row.entryId === viewer.entryId),
    );
    const before =
      standingFact(
        priorSnapshot?.rows.find((row) => row.entryId === viewer.entryId),
      ) ??
      (target.scope === "REGULAR"
        ? {
            seed: null,
            wins: 0,
            losses: 0,
            ties: 0,
            pointsForCenticredits: 0,
            allPlayHalfWinUnits: 0,
            allPlayComparisonCount: 0,
          }
        : null);
    const nextStored = state.matchups
      .filter(
        (matchup) =>
          matchup.seasonId === state.season.id &&
          matchup.nflWeek > target.nflWeek &&
          [matchup.sideAUserId, matchup.sideBUserId].includes(viewer.userId),
      )
      .sort(
        (left, right) =>
          left.nflWeek - right.nflWeek ||
          left.displayOrder - right.displayOrder ||
          left.id.localeCompare(right.id),
      )[0];
    const nextOpponentUserId = nextStored
      ? nextStored.sideAUserId === viewer.userId
        ? nextStored.sideBUserId
        : nextStored.sideAUserId
      : null;
    const nextOpponent = nextOpponentUserId
      ? membersByUser.get(nextOpponentUserId)
      : null;

    recordBridge = {
      matchup: target,
      before: target.scope === "REGULAR" ? before : null,
      after: target.scope === "REGULAR" ? after : null,
      standingsEffect: target.scope === "REGULAR" ? "REGULAR" : "NONE",
      correctionWindowClosesAt:
        state.weeks.find((candidate) => candidate.nflWeek === target.nflWeek)
          ?.correctionWindowClosesAt ??
        week?.correctionWindowClosesAt ??
        null,
      nextOpponent:
        nextStored && nextOpponent
          ? {
              entryId: nextOpponent.entryId,
              name: nextOpponent.displayName,
              nflWeek: nextStored.nflWeek,
              scope: nextStored.scope,
            }
          : null,
    };
  }

  return {
    league: state.league,
    viewer,
    members,
    recordBridge,
    activeHistory,
    finalizedMatchups,
    playoffCutline: projectCutline(state, viewer.entryId),
  };
}

export function projectRivalry(
  memory: SeasonMemoryProjection,
  memberAEntryId: string,
  memberBEntryId: string,
): RivalryProjection | null {
  const memberA = memory.members.find(
    (member) => member.entryId === memberAEntryId,
  );
  const memberB = memory.members.find(
    (member) => member.entryId === memberBEntryId,
  );
  if (!memberA || !memberB || memberA.userId === memberB.userId) return null;

  const meetings = memory.finalizedMatchups
    .filter(
      (matchup) =>
        [matchup.sideA.userId, matchup.sideB.userId].includes(memberA.userId) &&
        [matchup.sideA.userId, matchup.sideB.userId].includes(memberB.userId),
    )
    .toSorted(matchupOrder);
  const competitiveMeetings = meetings.filter(
    (matchup) =>
      matchup.scope === "REGULAR" ||
      matchup.postseasonRole === "CHAMPIONSHIP" ||
      (matchup.scope === "PLAYOFF" && matchup.postseasonRole === null),
  );
  const decisionForA = (matchup: FinalizedMatchupFact) =>
    matchup.sideA.userId === memberA.userId
      ? matchup.sideA.decision
      : matchup.sideB.decision;
  const memberAWins = competitiveMeetings.filter(
    (matchup) => decisionForA(matchup) === "WIN",
  ).length;
  const memberBWins = competitiveMeetings.filter(
    (matchup) => decisionForA(matchup) === "LOSS",
  ).length;
  const ties = competitiveMeetings.length - memberAWins - memberBWins;
  const latestCompetitive = competitiveMeetings.at(-1);
  let streak: RivalryProjection["streak"] = null;
  if (latestCompetitive) {
    const lastDecision = decisionForA(latestCompetitive);
    if (lastDecision !== "TIE") {
      let count = 0;
      for (const matchup of competitiveMeetings.toReversed()) {
        if (decisionForA(matchup) !== lastDecision) break;
        count += 1;
      }
      streak = {
        name:
          lastDecision === "WIN" ? memberA.displayName : memberB.displayName,
        count,
      };
    }
  }

  return {
    memberA,
    memberB,
    meetings,
    competitiveMeetings,
    memberAWins,
    memberBWins,
    ties,
    streak,
    averageMarginCenticredits:
      competitiveMeetings.length === 0
        ? null
        : Math.round(
            competitiveMeetings.reduce(
              (total, matchup) => total + matchup.marginCenticredits,
              0,
            ) / competitiveMeetings.length,
          ),
    lastMeeting: meetings.at(-1) ?? null,
    playoffMeetings: meetings.filter(
      (matchup) =>
        matchup.postseasonRole === "CHAMPIONSHIP" ||
        (matchup.scope === "PLAYOFF" && matchup.postseasonRole === null),
    ).length,
    thirdPlaceMeetings: meetings.filter(
      (matchup) => matchup.postseasonRole === "THIRD_PLACE",
    ).length,
    placementMeetings: meetings.filter(
      (matchup) =>
        matchup.postseasonRole === "PLACEMENT" ||
        (matchup.scope === "PLACEMENT" && matchup.postseasonRole === null),
    ).length,
    exhibitionMeetings: meetings.filter(
      (matchup) => matchup.scope === "EXHIBITION",
    ).length,
  };
}
