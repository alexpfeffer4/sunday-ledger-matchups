import { createHash } from "node:crypto";
import {
  advancePlayoffMatchup,
  decideRegularSeasonMatchup,
  type CardScore,
} from "@/domain/matchups/decide";
import {
  createInitialBracket,
  createWeek18Exhibitions,
  qualifyPlayoffs,
  reseedLargeLeagueSemifinals,
  type QualifiedEntry,
} from "@/domain/playoffs/bracket";
import {
  generateRegularSeasonSchedule,
  type SchedulePublication,
} from "@/domain/schedule/generate";
import { settleReceipt, weeklyScore } from "@/domain/settlement/settle";
import type { EventResult, PositionReceipt } from "@/domain/settlement/types";
import {
  calculateStandings,
  type StandingRow,
  type WeeklyStandingInput,
} from "@/domain/standings/rank";
import { simulationSeason1Ruleset } from "@/rulesets/simulation-season-1";

export type SimulationMember = {
  entryId: string;
  displayName: string;
  initials: string;
  deterministicTiebreak: string;
};

export type ArchivedReceipt = {
  id: string;
  receiptHash: string;
  eventId: string;
  marketType: "MONEYLINE" | "SPREAD" | "TOTAL";
  selection: "HOME" | "AWAY" | "OVER" | "UNDER";
  americanOdds: number;
  lineMilli: number | null;
  stakeCredits: number;
  outcome: "WIN" | "LOSS" | "PUSH" | "VOID";
  returnedCenticredits: number;
};

export type ArchivedCard = {
  entryId: string;
  compliance: "COMPLIANT" | "INCOMPLETE";
  allocatedCredits: number;
  scoreCenticredits: number;
  receipts: ArchivedReceipt[];
};

export type ArchivedMatchup = {
  id: string;
  week: number;
  scope: "REGULAR" | "PLAYOFF" | "PLACEMENT" | "EXHIBITION";
  label: string;
  sideAEntryId: string;
  sideBEntryId: string;
  sideAScoreCenticredits: number;
  sideBScoreCenticredits: number;
  sideADecision: "WIN" | "LOSS" | "TIE";
  sideBDecision: "WIN" | "LOSS" | "TIE";
  winnerEntryId: string | null;
  advancementReason: "SCORE" | "INCOMPLETE" | "HIGHER_SEED_TIEBREAK" | null;
  cards: [ArchivedCard, ArchivedCard];
};

export type ArchivedStanding = {
  seed: number;
  entryId: string;
  displayName: string;
  wins: number;
  losses: number;
  ties: number;
  pointsForCenticredits: number;
  allPlayHalfWinUnits: number;
  allPlayComparisonCount: number;
  attendanceMisses: number;
  highestWeekCenticredits: number;
  playoffEligible: boolean;
};

export type SimulationSeasonArchive = {
  schemaVersion: 1;
  mode: "SIMULATION";
  seasonLabel: string;
  nflYear: number;
  generatedAt: string;
  viewerEntryId: string;
  ruleset: {
    id: string;
    version: string;
    playoffIneligibilityAtMisses: number;
  };
  members: SimulationMember[];
  schedule: SchedulePublication;
  regularSeason: {
    weeks: Array<{
      week: number;
      matchups: ArchivedMatchup[];
      standings: ArchivedStanding[];
    }>;
    finalStandings: ArchivedStanding[];
  };
  playoffs: {
    qualifierCount: number;
    qualifiers: QualifiedEntry[];
    games: ArchivedMatchup[];
    championEntryId: string;
    runnerUpEntryId: string;
    thirdPlaceEntryId: string;
  };
  week18: ArchivedMatchup[];
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashNumber(value: string): number {
  return Number.parseInt(sha256(value).slice(0, 12), 16);
}

function toSafeNumber(value: bigint): number {
  const converted = Number(value);
  if (!Number.isSafeInteger(converted)) {
    throw new RangeError("The simulated centicredit value is not JSON-safe.");
  }
  return converted;
}

function buildCard(params: {
  entryId: string;
  week: number;
  scope: ArchivedMatchup["scope"];
  forceIncomplete?: boolean;
}): ArchivedCard {
  const seed = `${params.scope}:${params.week}:${params.entryId}`;
  const incomplete = params.forceIncomplete ?? false;
  const firstEventId = `${seed}:event:moneyline`;
  const secondEventId = `${seed}:event:total`;
  const selectedSide = hashNumber(`${seed}:side`) % 2 === 0 ? "HOME" : "AWAY";
  const homeWon = hashNumber(`${seed}:winner`) % 3 !== 0;
  const moneylineOdds = [-200, -125, 110, 150][
    hashNumber(`${seed}:odds`) % 4
  ] as number;
  const combinedScore = [41, 45, 48][hashNumber(`${seed}:total`) % 3] as number;
  const totalSelection =
    hashNumber(`${seed}:total-side`) % 2 === 0 ? "OVER" : "UNDER";

  const positions: Array<{
    receipt: PositionReceipt;
    result: EventResult;
  }> = [
    {
      receipt: {
        id: `${seed}:receipt:1`,
        eventId: firstEventId,
        marketType: "MONEYLINE",
        selectedSide,
        americanOdds: moneylineOdds,
        stakeCredits: incomplete ? 600 : 500,
      },
      result: {
        eventId: firstEventId,
        status: "FINAL",
        homeScore: homeWon ? 27 : 20,
        awayScore: homeWon ? 20 : 27,
      },
    },
  ];

  if (!incomplete) {
    positions.push({
      receipt: {
        id: `${seed}:receipt:2`,
        eventId: secondEventId,
        marketType: "TOTAL",
        selectedSide: totalSelection,
        lineMilli: 44_500,
        americanOdds: -110,
        stakeCredits: 500,
      },
      result: {
        eventId: secondEventId,
        status: "FINAL",
        homeScore: Math.floor(combinedScore / 2),
        awayScore: Math.ceil(combinedScore / 2),
      },
    });
  }

  const settled = positions.map(({ receipt, result }) => ({
    receipt,
    settlement: settleReceipt(receipt, result),
  }));
  const rawScore = weeklyScore(settled.map(({ settlement }) => settlement));
  if (rawScore === null)
    throw new Error("A completed simulation card cannot be pending.");

  return {
    entryId: params.entryId,
    compliance: incomplete ? "INCOMPLETE" : "COMPLIANT",
    allocatedCredits: positions.reduce(
      (total, { receipt }) => total + receipt.stakeCredits,
      0,
    ),
    scoreCenticredits: incomplete ? 0 : toSafeNumber(rawScore),
    receipts: settled.map(({ receipt, settlement }) => ({
      id: receipt.id,
      receiptHash: sha256(
        JSON.stringify({
          receipt,
          rulesetId: simulationSeason1Ruleset.id,
          rulesetVersion: simulationSeason1Ruleset.version,
        }),
      ),
      eventId: receipt.eventId,
      marketType: receipt.marketType,
      selection:
        receipt.marketType === "TOTAL"
          ? receipt.selectedSide
          : receipt.selectedSide,
      americanOdds: receipt.americanOdds,
      lineMilli: receipt.marketType === "MONEYLINE" ? null : receipt.lineMilli,
      stakeCredits: receipt.stakeCredits,
      outcome: settlement.outcome as "WIN" | "LOSS" | "PUSH" | "VOID",
      returnedCenticredits: toSafeNumber(settlement.returnedCenticredits ?? 0n),
    })),
  };
}

function forcedRegularSeasonMiss(params: {
  memberIndex: number;
  memberCount: number;
  week: number;
}): boolean {
  if (
    params.memberCount >= 6 &&
    params.memberIndex === params.memberCount - 1
  ) {
    return [3, 8, 13].includes(params.week);
  }
  return params.memberIndex === params.memberCount - 2 && params.week === 5;
}

function standingArchive(
  rows: readonly StandingRow[],
  membersById: ReadonlyMap<string, SimulationMember>,
): ArchivedStanding[] {
  return rows.map((row, index) => ({
    seed: index + 1,
    entryId: row.entryId,
    displayName: membersById.get(row.entryId)?.displayName ?? "Unknown member",
    wins: row.wins,
    losses: row.losses,
    ties: row.ties,
    pointsForCenticredits: toSafeNumber(row.pointsForCenticredits),
    allPlayHalfWinUnits: row.allPlayHalfWinUnits,
    allPlayComparisonCount: row.allPlayComparisonCount,
    attendanceMisses: row.attendanceMisses,
    highestWeekCenticredits: toSafeNumber(row.highestWeekCenticredits),
    playoffEligible:
      row.attendanceMisses <
      simulationSeason1Ruleset.attendance.playoffIneligibilityAtMisses,
  }));
}

function regularMatchup(params: {
  week: number;
  sideAEntryId: string;
  sideBEntryId: string;
  memberIndexes: ReadonlyMap<string, number>;
  memberCount: number;
}): ArchivedMatchup {
  const sideA = buildCard({
    entryId: params.sideAEntryId,
    week: params.week,
    scope: "REGULAR",
    forceIncomplete: forcedRegularSeasonMiss({
      memberIndex: params.memberIndexes.get(params.sideAEntryId) ?? 0,
      memberCount: params.memberCount,
      week: params.week,
    }),
  });
  const sideB = buildCard({
    entryId: params.sideBEntryId,
    week: params.week,
    scope: "REGULAR",
    forceIncomplete: forcedRegularSeasonMiss({
      memberIndex: params.memberIndexes.get(params.sideBEntryId) ?? 0,
      memberCount: params.memberCount,
      week: params.week,
    }),
  });
  const result = decideRegularSeasonMatchup(
    {
      entryId: sideA.entryId,
      compliance: sideA.compliance,
      scoreCenticredits: BigInt(sideA.scoreCenticredits),
    },
    {
      entryId: sideB.entryId,
      compliance: sideB.compliance,
      scoreCenticredits: BigInt(sideB.scoreCenticredits),
    },
  );
  const sideADecision = result.decisions[sideA.entryId];
  const sideBDecision = result.decisions[sideB.entryId];
  if (!sideADecision || !sideBDecision) {
    throw new Error("A regular-season matchup must decide both sides.");
  }

  return {
    id: `regular:${params.week}:${params.sideAEntryId}:${params.sideBEntryId}`,
    week: params.week,
    scope: "REGULAR",
    label: `Week ${params.week}`,
    sideAEntryId: sideA.entryId,
    sideBEntryId: sideB.entryId,
    sideAScoreCenticredits: toSafeNumber(
      result.pointsForCenticredits[sideA.entryId] ?? 0n,
    ),
    sideBScoreCenticredits: toSafeNumber(
      result.pointsForCenticredits[sideB.entryId] ?? 0n,
    ),
    sideADecision,
    sideBDecision,
    winnerEntryId:
      sideADecision === "WIN"
        ? sideA.entryId
        : sideBDecision === "WIN"
          ? sideB.entryId
          : null,
    advancementReason: null,
    cards: [sideA, sideB],
  };
}

function playoffMatchup(params: {
  week: 15 | 16 | 17 | 18;
  scope: "PLAYOFF" | "PLACEMENT" | "EXHIBITION";
  label: string;
  sideA: QualifiedEntry;
  sideB: QualifiedEntry;
}): ArchivedMatchup {
  const sideACard = buildCard({
    entryId: params.sideA.entryId,
    week: params.week,
    scope: params.scope,
  });
  const sideBCard = buildCard({
    entryId: params.sideB.entryId,
    week: params.week,
    scope: params.scope,
  });
  const sideA: CardScore & { qualificationSeed: number } = {
    entryId: sideACard.entryId,
    compliance: sideACard.compliance,
    scoreCenticredits: BigInt(sideACard.scoreCenticredits),
    qualificationSeed: params.sideA.qualificationSeed,
  };
  const sideB: CardScore & { qualificationSeed: number } = {
    entryId: sideBCard.entryId,
    compliance: sideBCard.compliance,
    scoreCenticredits: BigInt(sideBCard.scoreCenticredits),
    qualificationSeed: params.sideB.qualificationSeed,
  };
  const advancement = advancePlayoffMatchup({ sideA, sideB });
  const sideAWon = advancement.advancingEntryId === sideA.entryId;

  return {
    id: `${params.scope.toLowerCase()}:${params.week}:${sideA.entryId}:${sideB.entryId}`,
    week: params.week,
    scope: params.scope,
    label: params.label,
    sideAEntryId: sideA.entryId,
    sideBEntryId: sideB.entryId,
    sideAScoreCenticredits: sideACard.scoreCenticredits,
    sideBScoreCenticredits: sideBCard.scoreCenticredits,
    sideADecision: sideAWon ? "WIN" : "LOSS",
    sideBDecision: sideAWon ? "LOSS" : "WIN",
    winnerEntryId: advancement.advancingEntryId,
    advancementReason: advancement.reason,
    cards: [sideACard, sideBCard],
  };
}

function loserOf(game: ArchivedMatchup): string {
  if (!game.winnerEntryId) throw new Error("A playoff game requires a winner.");
  return game.winnerEntryId === game.sideAEntryId
    ? game.sideBEntryId
    : game.sideAEntryId;
}

function requireQualifier(
  qualifiers: readonly QualifiedEntry[],
  seed: number,
): QualifiedEntry {
  const qualifier = qualifiers.find(
    (candidate) => candidate.qualificationSeed === seed,
  );
  if (!qualifier) throw new Error(`Playoff seed ${seed} is unavailable.`);
  return qualifier;
}

function qualifiedEntry(
  entryId: string,
  seedsByEntryId: ReadonlyMap<string, number>,
): QualifiedEntry {
  const qualificationSeed = seedsByEntryId.get(entryId);
  if (!qualificationSeed) {
    throw new Error(`No qualification seed exists for ${entryId}.`);
  }
  return { entryId, qualificationSeed };
}

export function simulateSeason(params: {
  members: readonly SimulationMember[];
  scheduleSeed: string;
  nflYear: number;
  viewerEntryId?: string;
}): SimulationSeasonArchive {
  if (
    params.members.length < 4 ||
    params.members.length > 16 ||
    params.members.length % 2 !== 0
  ) {
    throw new RangeError(
      "A simulation season requires 4–16 members and an even roster.",
    );
  }
  if (
    new Set(params.members.map((member) => member.entryId)).size !==
    params.members.length
  ) {
    throw new Error("Simulation member entry IDs must be unique.");
  }

  const members = [...params.members];
  const membersById = new Map(
    members.map((member) => [member.entryId, member]),
  );
  const memberIndexes = new Map(
    members.map((member, index) => [member.entryId, index]),
  );
  const deterministicTiebreaks = Object.fromEntries(
    members.map((member) => [member.entryId, member.deterministicTiebreak]),
  );
  const schedule = generateRegularSeasonSchedule({
    entryIds: members.map((member) => member.entryId),
    seed: params.scheduleSeed,
  });
  const standingInputs: WeeklyStandingInput[] = [];
  const regularSeasonWeeks: SimulationSeasonArchive["regularSeason"]["weeks"] =
    [];

  for (let week = 1; week <= 14; week += 1) {
    const matchups = schedule.matchups
      .filter((matchup) => matchup.week === week)
      .map((matchup) =>
        regularMatchup({
          week,
          sideAEntryId: matchup.sideAEntryId,
          sideBEntryId: matchup.sideBEntryId,
          memberIndexes,
          memberCount: members.length,
        }),
      );

    for (const matchup of matchups) {
      standingInputs.push(
        {
          week,
          entryId: matchup.sideAEntryId,
          opponentEntryId: matchup.sideBEntryId,
          compliance: matchup.cards[0].compliance,
          decision: matchup.sideADecision,
          pointsForCenticredits: BigInt(matchup.sideAScoreCenticredits),
        },
        {
          week,
          entryId: matchup.sideBEntryId,
          opponentEntryId: matchup.sideAEntryId,
          compliance: matchup.cards[1].compliance,
          decision: matchup.sideBDecision,
          pointsForCenticredits: BigInt(matchup.sideBScoreCenticredits),
        },
      );
    }

    regularSeasonWeeks.push({
      week,
      matchups,
      standings: standingArchive(
        calculateStandings({
          entryIds: members.map((member) => member.entryId),
          weeklyResults: standingInputs,
          deterministicTiebreaks,
        }),
        membersById,
      ),
    });
  }

  const finalStandingRows = calculateStandings({
    entryIds: members.map((member) => member.entryId),
    weeklyResults: standingInputs,
    deterministicTiebreaks,
  });
  const finalStandings = standingArchive(finalStandingRows, membersById);
  const qualifiers = qualifyPlayoffs({
    orderedStandings: finalStandingRows,
    playoffIneligibilityAtMisses:
      simulationSeason1Ruleset.attendance.playoffIneligibilityAtMisses,
  });
  const qualifierCount = members.length <= 8 ? 4 : 6;
  if (qualifiers.length !== qualifierCount) {
    throw new Error(
      "The deterministic fixture did not produce a complete playoff field.",
    );
  }
  const seedsByEntryId = new Map(
    finalStandings.map((standing) => [standing.entryId, standing.seed]),
  );
  const playoffSeedsByEntryId = new Map(
    qualifiers.map((qualifier) => [
      qualifier.entryId,
      qualifier.qualificationSeed,
    ]),
  );
  const initialBracket = createInitialBracket({
    rosterSize: members.length,
    qualifiers,
    allEntriesByFinalStanding: finalStandings.map(
      (standing) => standing.entryId,
    ),
  });
  const games: ArchivedMatchup[] = [];
  let championship: ArchivedMatchup;
  let thirdPlace: ArchivedMatchup;

  if (members.length <= 8) {
    for (const game of initialBracket.filter(
      (candidate) => candidate.week === 15 && candidate.scope === "EXHIBITION",
    )) {
      if (!game.sideA || !game.sideB) continue;
      games.push(
        playoffMatchup({
          week: 15,
          scope: "EXHIBITION",
          label: game.label,
          sideA: qualifiedEntry(game.sideA.entryId, seedsByEntryId),
          sideB: qualifiedEntry(game.sideB.entryId, seedsByEntryId),
        }),
      );
    }
    const semifinalOne = playoffMatchup({
      week: 16,
      scope: "PLAYOFF",
      label: "Semifinal · 1 vs 4",
      sideA: requireQualifier(qualifiers, 1),
      sideB: requireQualifier(qualifiers, 4),
    });
    const semifinalTwo = playoffMatchup({
      week: 16,
      scope: "PLAYOFF",
      label: "Semifinal · 2 vs 3",
      sideA: requireQualifier(qualifiers, 2),
      sideB: requireQualifier(qualifiers, 3),
    });
    games.push(semifinalOne, semifinalTwo);
    championship = playoffMatchup({
      week: 17,
      scope: "PLAYOFF",
      label: "Championship",
      sideA: qualifiedEntry(
        semifinalOne.winnerEntryId as string,
        playoffSeedsByEntryId,
      ),
      sideB: qualifiedEntry(
        semifinalTwo.winnerEntryId as string,
        playoffSeedsByEntryId,
      ),
    });
    thirdPlace = playoffMatchup({
      week: 17,
      scope: "PLACEMENT",
      label: "Third place",
      sideA: qualifiedEntry(loserOf(semifinalOne), playoffSeedsByEntryId),
      sideB: qualifiedEntry(loserOf(semifinalTwo), playoffSeedsByEntryId),
    });
  } else {
    const openingOne = playoffMatchup({
      week: 15,
      scope: "PLAYOFF",
      label: "Opening round · 3 vs 6",
      sideA: requireQualifier(qualifiers, 3),
      sideB: requireQualifier(qualifiers, 6),
    });
    const openingTwo = playoffMatchup({
      week: 15,
      scope: "PLAYOFF",
      label: "Opening round · 4 vs 5",
      sideA: requireQualifier(qualifiers, 4),
      sideB: requireQualifier(qualifiers, 5),
    });
    games.push(openingOne, openingTwo);
    const semifinalPlan = reseedLargeLeagueSemifinals({
      seedOne: requireQualifier(qualifiers, 1),
      seedTwo: requireQualifier(qualifiers, 2),
      openingRoundWinners: [
        qualifiedEntry(
          openingOne.winnerEntryId as string,
          playoffSeedsByEntryId,
        ),
        qualifiedEntry(
          openingTwo.winnerEntryId as string,
          playoffSeedsByEntryId,
        ),
      ],
    });
    const semifinalOne = playoffMatchup({
      week: 16,
      scope: "PLAYOFF",
      label: semifinalPlan[0].label,
      sideA: semifinalPlan[0].sideA as QualifiedEntry,
      sideB: semifinalPlan[0].sideB as QualifiedEntry,
    });
    const semifinalTwo = playoffMatchup({
      week: 16,
      scope: "PLAYOFF",
      label: semifinalPlan[1].label,
      sideA: semifinalPlan[1].sideA as QualifiedEntry,
      sideB: semifinalPlan[1].sideB as QualifiedEntry,
    });
    games.push(semifinalOne, semifinalTwo);
    championship = playoffMatchup({
      week: 17,
      scope: "PLAYOFF",
      label: "Championship",
      sideA: qualifiedEntry(
        semifinalOne.winnerEntryId as string,
        playoffSeedsByEntryId,
      ),
      sideB: qualifiedEntry(
        semifinalTwo.winnerEntryId as string,
        playoffSeedsByEntryId,
      ),
    });
    thirdPlace = playoffMatchup({
      week: 17,
      scope: "PLACEMENT",
      label: "Third place",
      sideA: qualifiedEntry(loserOf(semifinalOne), playoffSeedsByEntryId),
      sideB: qualifiedEntry(loserOf(semifinalTwo), playoffSeedsByEntryId),
    });
  }

  games.push(championship, thirdPlace);
  const championEntryId = championship.winnerEntryId as string;
  const runnerUpEntryId = loserOf(championship);
  const thirdPlaceEntryId = thirdPlace.winnerEntryId as string;
  const fourthPlaceEntryId = loserOf(thirdPlace);
  const finalPlacement = [
    championEntryId,
    runnerUpEntryId,
    thirdPlaceEntryId,
    fourthPlaceEntryId,
    ...finalStandings
      .map((standing) => standing.entryId)
      .filter(
        (entryId) =>
          ![
            championEntryId,
            runnerUpEntryId,
            thirdPlaceEntryId,
            fourthPlaceEntryId,
          ].includes(entryId),
      ),
  ];
  const week18 = createWeek18Exhibitions(finalPlacement).map((game) => {
    if (!game.sideA || !game.sideB) {
      throw new Error("Week 18 requires two exhibition sides.");
    }
    return playoffMatchup({
      week: 18,
      scope: "EXHIBITION",
      label: game.label,
      sideA: qualifiedEntry(game.sideA.entryId, seedsByEntryId),
      sideB: qualifiedEntry(game.sideB.entryId, seedsByEntryId),
    });
  });

  return {
    schemaVersion: 1,
    mode: "SIMULATION",
    seasonLabel: `${params.nflYear} Full-Season Simulation`,
    nflYear: params.nflYear,
    generatedAt: `${params.nflYear}-02-15T23:00:00.000Z`,
    viewerEntryId: params.viewerEntryId ?? members[0]?.entryId ?? "",
    ruleset: {
      id: simulationSeason1Ruleset.id,
      version: simulationSeason1Ruleset.version,
      playoffIneligibilityAtMisses:
        simulationSeason1Ruleset.attendance.playoffIneligibilityAtMisses,
    },
    members,
    schedule,
    regularSeason: { weeks: regularSeasonWeeks, finalStandings },
    playoffs: {
      qualifierCount,
      qualifiers,
      games,
      championEntryId,
      runnerUpEntryId,
      thirdPlaceEntryId,
    },
    week18,
  };
}
