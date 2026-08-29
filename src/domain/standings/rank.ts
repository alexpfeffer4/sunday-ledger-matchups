export type WeeklyStandingInput = {
  week: number;
  entryId: string;
  opponentEntryId: string;
  compliance: "COMPLIANT" | "INCOMPLETE";
  decision: "WIN" | "LOSS" | "TIE";
  pointsForCenticredits: bigint;
};

type StandingDecision = WeeklyStandingInput["decision"];

export type StandingRow = {
  entryId: string;
  wins: number;
  losses: number;
  ties: number;
  pointsForCenticredits: bigint;
  allPlayHalfWinUnits: number;
  allPlayComparisonCount: number;
  attendanceMisses: number;
  highestWeekCenticredits: bigint;
  deterministicTiebreak: string;
};

type HeadToHeadMeeting = {
  firstDecision: StandingDecision;
  secondDecision: StandingDecision;
};

function compareRatioDescending(
  leftNumerator: number,
  leftDenominator: number,
  rightNumerator: number,
  rightDenominator: number,
): number {
  if (leftDenominator === 0 && rightDenominator === 0) return 0;
  if (leftDenominator === 0) return 1;
  if (rightDenominator === 0) return -1;
  const left = leftNumerator * rightDenominator;
  const right = rightNumerator * leftDenominator;
  return right - left;
}

function officialHalfWinUnits(row: StandingRow): number {
  return row.wins * 2 + row.ties;
}

function officialHalfGameUnits(row: StandingRow): number {
  return (row.wins + row.losses + row.ties) * 2;
}

function compareCore(left: StandingRow, right: StandingRow): number {
  const winPercentage = compareRatioDescending(
    officialHalfWinUnits(left),
    officialHalfGameUnits(left),
    officialHalfWinUnits(right),
    officialHalfGameUnits(right),
  );
  if (winPercentage !== 0) return winPercentage;

  if (left.pointsForCenticredits !== right.pointsForCenticredits) {
    return left.pointsForCenticredits > right.pointsForCenticredits ? -1 : 1;
  }

  return compareRatioDescending(
    left.allPlayHalfWinUnits,
    left.allPlayComparisonCount * 2,
    right.allPlayHalfWinUnits,
    right.allPlayComparisonCount * 2,
  );
}

function equalCore(left: StandingRow, right: StandingRow): boolean {
  return compareCore(left, right) === 0;
}

function groupAdjacent<T>(
  items: readonly T[],
  equal: (left: T, right: T) => boolean,
): T[][] {
  const groups: T[][] = [];
  for (const item of items) {
    const group = groups.at(-1);
    if (!group || !equal(group[0] as T, item)) groups.push([item]);
    else group.push(item);
  }
  return groups;
}

function balancedHeadToHeadScores(
  group: readonly StandingRow[],
  meetings: ReadonlyMap<string, readonly HeadToHeadMeeting[]>,
): Map<string, { halfWinUnits: number; halfGameUnits: number }> | null {
  let expectedMeetings: number | null = null;
  const scores = new Map(
    group.map((row) => [row.entryId, { halfWinUnits: 0, halfGameUnits: 0 }]),
  );

  for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < group.length;
      rightIndex += 1
    ) {
      const left = group[leftIndex];
      const right = group[rightIndex];
      if (!left || !right) return null;
      const pairMeetings =
        meetings.get(`${left.entryId}:${right.entryId}`) ?? [];
      if (pairMeetings.length === 0) return null;
      expectedMeetings ??= pairMeetings.length;
      if (pairMeetings.length !== expectedMeetings) return null;
    }
  }

  for (const row of group) {
    for (const opponent of group) {
      if (row.entryId === opponent.entryId) continue;
      const [first, second] = [row.entryId, opponent.entryId].sort();
      const pairMeetings = meetings.get(`${first}:${second}`) ?? [];
      for (const meeting of pairMeetings) {
        const rowWasFirst = row.entryId === first;
        const rowDecision = rowWasFirst
          ? meeting.firstDecision
          : meeting.secondDecision;
        const score = scores.get(row.entryId);
        if (!score) continue;
        score.halfGameUnits += 2;
        if (rowDecision === "WIN") score.halfWinUnits += 2;
        if (rowDecision === "TIE") score.halfWinUnits += 1;
      }
    }
  }

  return scores;
}

export function calculateStandings(params: {
  entryIds: readonly string[];
  weeklyResults: readonly WeeklyStandingInput[];
  deterministicTiebreaks: Readonly<Record<string, string>>;
}): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    params.entryIds.map((entryId) => [
      entryId,
      {
        entryId,
        wins: 0,
        losses: 0,
        ties: 0,
        pointsForCenticredits: 0n,
        allPlayHalfWinUnits: 0,
        allPlayComparisonCount: 0,
        attendanceMisses: 0,
        highestWeekCenticredits: 0n,
        deterministicTiebreak:
          params.deterministicTiebreaks[entryId] ?? entryId,
      },
    ]),
  );

  for (const result of params.weeklyResults) {
    const row = rows.get(result.entryId);
    if (!row) throw new Error(`Unknown standings entry: ${result.entryId}`);
    if (result.decision === "WIN") row.wins += 1;
    if (result.decision === "LOSS") row.losses += 1;
    if (result.decision === "TIE") row.ties += 1;
    if (result.compliance === "INCOMPLETE") row.attendanceMisses += 1;
    row.pointsForCenticredits += result.pointsForCenticredits;
    if (result.pointsForCenticredits > row.highestWeekCenticredits) {
      row.highestWeekCenticredits = result.pointsForCenticredits;
    }
  }

  const byWeek = Map.groupBy(params.weeklyResults, (result) => result.week);
  for (const weekResults of byWeek.values()) {
    const compliant = weekResults.filter(
      (result) => result.compliance === "COMPLIANT",
    );
    for (const result of compliant) {
      const row = rows.get(result.entryId);
      if (!row) continue;
      for (const comparison of compliant) {
        if (comparison.entryId === result.entryId) continue;
        row.allPlayComparisonCount += 1;
        if (result.pointsForCenticredits > comparison.pointsForCenticredits) {
          row.allPlayHalfWinUnits += 2;
        } else if (
          result.pointsForCenticredits === comparison.pointsForCenticredits
        ) {
          row.allPlayHalfWinUnits += 1;
        }
      }
    }
  }

  const meetingsByPairAndWeek = new Map<
    string,
    Map<number, Partial<HeadToHeadMeeting>>
  >();
  for (const result of params.weeklyResults) {
    const [first, second] = [result.entryId, result.opponentEntryId].sort();
    if (!first || !second) continue;
    const key = `${first}:${second}`;
    const byWeek = meetingsByPairAndWeek.get(key) ?? new Map();
    const meeting = byWeek.get(result.week) ?? {};
    if (result.entryId === first) meeting.firstDecision = result.decision;
    else meeting.secondDecision = result.decision;
    byWeek.set(result.week, meeting);
    meetingsByPairAndWeek.set(key, byWeek);
  }

  const meetingMap = new Map<string, HeadToHeadMeeting[]>();
  for (const [key, byWeek] of meetingsByPairAndWeek) {
    const completeMeetings = [...byWeek.entries()]
      .sort(([leftWeek], [rightWeek]) => leftWeek - rightWeek)
      .flatMap(([, meeting]) =>
        meeting.firstDecision && meeting.secondDecision
          ? [meeting as HeadToHeadMeeting]
          : [],
      );
    meetingMap.set(key, completeMeetings);
  }

  const coreSorted = [...rows.values()].sort(compareCore);
  const coreGroups = groupAdjacent(coreSorted, equalCore);
  const ranked: StandingRow[] = [];

  for (const group of coreGroups) {
    const miniTable =
      group.length > 1 ? balancedHeadToHeadScores(group, meetingMap) : null;
    group.sort((left, right) => {
      if (miniTable) {
        const leftScore = miniTable.get(left.entryId);
        const rightScore = miniTable.get(right.entryId);
        if (leftScore && rightScore) {
          const h2h = compareRatioDescending(
            leftScore.halfWinUnits,
            leftScore.halfGameUnits,
            rightScore.halfWinUnits,
            rightScore.halfGameUnits,
          );
          if (h2h !== 0) return h2h;
        }
      }
      if (left.attendanceMisses !== right.attendanceMisses) {
        return left.attendanceMisses - right.attendanceMisses;
      }
      if (left.highestWeekCenticredits !== right.highestWeekCenticredits) {
        return left.highestWeekCenticredits > right.highestWeekCenticredits
          ? -1
          : 1;
      }
      return left.deterministicTiebreak.localeCompare(
        right.deterministicTiebreak,
      );
    });
    ranked.push(...group);
  }

  return ranked;
}
