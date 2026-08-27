import type { StandingRow } from "@/domain/standings/rank";

export type QualifiedEntry = {
  entryId: string;
  qualificationSeed: number;
};

export type BracketGame = {
  week: 15 | 16 | 17 | 18;
  scope: "CHAMPIONSHIP" | "THIRD_PLACE" | "PLACEMENT" | "EXHIBITION";
  sideA: QualifiedEntry | null;
  sideB: QualifiedEntry | null;
  label: string;
};

export function qualifyPlayoffs(params: {
  orderedStandings: readonly StandingRow[];
  playoffIneligibilityAtMisses: number;
}): QualifiedEntry[] {
  const qualifierCount = params.orderedStandings.length <= 8 ? 4 : 6;
  return params.orderedStandings
    .map((row, index) => ({ row, qualificationSeed: index + 1 }))
    .filter(
      ({ row }) => row.attendanceMisses < params.playoffIneligibilityAtMisses,
    )
    .slice(0, qualifierCount)
    .map(({ row, qualificationSeed }) => ({
      entryId: row.entryId,
      qualificationSeed,
    }));
}

function bySeed(
  qualifiers: readonly QualifiedEntry[],
  seed: number,
): QualifiedEntry | null {
  return qualifiers.find((entry) => entry.qualificationSeed === seed) ?? null;
}

export function createInitialBracket(params: {
  rosterSize: number;
  qualifiers: readonly QualifiedEntry[];
  allEntriesByFinalStanding: readonly string[];
}): BracketGame[] {
  if (params.rosterSize <= 8) {
    const exhibitions: BracketGame[] = [];
    for (
      let index = 0;
      index < params.allEntriesByFinalStanding.length;
      index += 2
    ) {
      const sideAEntryId = params.allEntriesByFinalStanding[index];
      const sideBEntryId = params.allEntriesByFinalStanding[index + 1];
      if (!sideAEntryId || !sideBEntryId) continue;
      exhibitions.push({
        week: 15,
        scope: "EXHIBITION",
        sideA: { entryId: sideAEntryId, qualificationSeed: index + 1 },
        sideB: { entryId: sideBEntryId, qualificationSeed: index + 2 },
        label: "Week 15 exhibition",
      });
    }
    return [
      ...exhibitions,
      {
        week: 16,
        scope: "CHAMPIONSHIP",
        sideA: bySeed(params.qualifiers, 1),
        sideB: bySeed(params.qualifiers, 4),
        label: "Semifinal · 1 vs 4",
      },
      {
        week: 16,
        scope: "CHAMPIONSHIP",
        sideA: bySeed(params.qualifiers, 2),
        sideB: bySeed(params.qualifiers, 3),
        label: "Semifinal · 2 vs 3",
      },
      {
        week: 17,
        scope: "CHAMPIONSHIP",
        sideA: null,
        sideB: null,
        label: "Championship",
      },
      {
        week: 17,
        scope: "THIRD_PLACE",
        sideA: null,
        sideB: null,
        label: "Third place",
      },
    ];
  }

  return [
    {
      week: 15,
      scope: "CHAMPIONSHIP",
      sideA: bySeed(params.qualifiers, 3),
      sideB: bySeed(params.qualifiers, 6),
      label: "Opening round · 3 vs 6",
    },
    {
      week: 15,
      scope: "CHAMPIONSHIP",
      sideA: bySeed(params.qualifiers, 4),
      sideB: bySeed(params.qualifiers, 5),
      label: "Opening round · 4 vs 5",
    },
    {
      week: 16,
      scope: "CHAMPIONSHIP",
      sideA: bySeed(params.qualifiers, 1),
      sideB: null,
      label: "Semifinal · No. 1 seed",
    },
    {
      week: 16,
      scope: "CHAMPIONSHIP",
      sideA: bySeed(params.qualifiers, 2),
      sideB: null,
      label: "Semifinal · No. 2 seed",
    },
    {
      week: 17,
      scope: "CHAMPIONSHIP",
      sideA: null,
      sideB: null,
      label: "Championship",
    },
    {
      week: 17,
      scope: "THIRD_PLACE",
      sideA: null,
      sideB: null,
      label: "Third place",
    },
  ];
}

export function reseedLargeLeagueSemifinals(params: {
  seedOne: QualifiedEntry;
  seedTwo: QualifiedEntry;
  openingRoundWinners: readonly [QualifiedEntry, QualifiedEntry];
}): readonly [BracketGame, BracketGame] {
  const [lowestRankedRemaining, otherWinner] = [
    ...params.openingRoundWinners,
  ].sort((left, right) => right.qualificationSeed - left.qualificationSeed);
  if (!lowestRankedRemaining || !otherWinner)
    throw new Error("Two winners are required.");

  return [
    {
      week: 16,
      scope: "CHAMPIONSHIP",
      sideA: params.seedOne,
      sideB: lowestRankedRemaining,
      label: "Semifinal · No. 1 seed vs lowest remaining seed",
    },
    {
      week: 16,
      scope: "CHAMPIONSHIP",
      sideA: params.seedTwo,
      sideB: otherWinner,
      label: "Semifinal · No. 2 seed",
    },
  ];
}

export function createWeek18Exhibitions(
  entryIdsByFinalPlacement: readonly string[],
): BracketGame[] {
  const games: BracketGame[] = [];
  for (let index = 0; index < entryIdsByFinalPlacement.length; index += 2) {
    const sideAEntryId = entryIdsByFinalPlacement[index];
    const sideBEntryId = entryIdsByFinalPlacement[index + 1];
    if (!sideAEntryId || !sideBEntryId) continue;
    games.push({
      week: 18,
      scope: "EXHIBITION",
      sideA: { entryId: sideAEntryId, qualificationSeed: index + 1 },
      sideB: { entryId: sideBEntryId, qualificationSeed: index + 2 },
      label: `Week 18 placement exhibition · ${index + 1} vs ${index + 2}`,
    });
  }
  return games;
}
