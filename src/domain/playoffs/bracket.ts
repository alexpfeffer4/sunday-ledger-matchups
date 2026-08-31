import type { StandingRow } from "@/domain/standings/rank";

export const REINSTATEMENT_REASON = "MINIMUM_FOUR_CHAMPIONSHIP_FIELD" as const;

export type PlayoffFormat = "FOUR_SLOT" | "SIX_SLOT";
export type PostseasonWeek = 15 | 16 | 17;
export type PostseasonRole =
  "CHAMPIONSHIP" | "THIRD_PLACE" | "PLACEMENT" | "EXHIBITION";

export type QualifiedEntry = {
  entryId: string;
  regularSeasonSeed: number;
  qualificationSeed: number;
  eligibilityStatus: "ELIGIBLE" | "INELIGIBLE";
  selectionReason: "ELIGIBLE_STANDINGS" | typeof REINSTATEMENT_REASON;
  attendanceMissesUsedByQualification: number;
};

export type ChampionshipField = {
  format: PlayoffFormat;
  minimumFieldSize: 4;
  maximumFieldSize: 4 | 6;
  qualifiers: QualifiedEntry[];
};

export type BracketSlot = {
  slot: number;
  state: "OCCUPIED" | "VACANT";
  entry: QualifiedEntry | null;
};

export type AutomaticAdvancement = {
  entry: QualifiedEntry;
  fromWeek: 15;
  toWeek: 16;
  reason: "FOUR_SLOT_EXHIBITION_BYE" | "TOP_TWO_SEED_BYE" | "VACANT_OPPONENT";
};

export type BracketRepresentation = {
  format: PlayoffFormat;
  slots: BracketSlot[];
  automaticWeek15Advancements: AutomaticAdvancement[];
};

export type PostseasonParticipant = {
  entryId: string;
  regularSeasonSeed: number;
  qualificationSeed: number | null;
};

export type BracketGame = {
  week: PostseasonWeek;
  role: PostseasonRole;
  scope: PostseasonRole;
  sideA: PostseasonParticipant;
  sideB: PostseasonParticipant;
  label: string;
  byeExhibition: boolean;
};

export type ChampionshipOutcome = {
  winner: QualifiedEntry;
  loser: QualifiedEntry;
  sourceResultVersionId?: string;
};

function validateEntryOrder(entryIds: readonly string[]) {
  if (
    entryIds.length < 4 ||
    entryIds.length % 2 !== 0 ||
    new Set(entryIds).size !== entryIds.length
  ) {
    throw new Error("A complete, even, uniquely ordered roster is required.");
  }
}

export function selectChampionshipField(params: {
  orderedStandings: readonly StandingRow[];
  playoffIneligibilityAtMisses: number;
  format?: PlayoffFormat;
}): ChampionshipField {
  validateEntryOrder(params.orderedStandings.map((row) => row.entryId));
  const format =
    params.format ??
    (params.orderedStandings.length <= 8 ? "FOUR_SLOT" : "SIX_SLOT");
  const maximumFieldSize = format === "FOUR_SLOT" ? 4 : 6;
  const ranked = params.orderedStandings.map((row, index) => ({
    row,
    regularSeasonSeed: index + 1,
  }));
  const selectedEligible = ranked
    .filter(
      ({ row }) => row.attendanceMisses < params.playoffIneligibilityAtMisses,
    )
    .slice(0, maximumFieldSize);
  const reinstatementCount = Math.max(0, 4 - selectedEligible.length);
  const selectedIneligible = ranked
    .filter(
      ({ row }) => row.attendanceMisses >= params.playoffIneligibilityAtMisses,
    )
    .slice(0, reinstatementCount);

  const qualifiers = [...selectedEligible, ...selectedIneligible].map(
    ({ row, regularSeasonSeed }, index): QualifiedEntry => ({
      entryId: row.entryId,
      regularSeasonSeed,
      qualificationSeed: index + 1,
      eligibilityStatus:
        row.attendanceMisses < params.playoffIneligibilityAtMisses
          ? "ELIGIBLE"
          : "INELIGIBLE",
      selectionReason:
        row.attendanceMisses < params.playoffIneligibilityAtMisses
          ? "ELIGIBLE_STANDINGS"
          : REINSTATEMENT_REASON,
      attendanceMissesUsedByQualification: row.attendanceMisses,
    }),
  );

  if (qualifiers.length < 4 || qualifiers.length > maximumFieldSize) {
    throw new Error("The frozen roster cannot produce the required field.");
  }
  return {
    format,
    minimumFieldSize: 4,
    maximumFieldSize,
    qualifiers,
  };
}

/** Compatibility name retained for the existing Simulation fixture. */
export function qualifyPlayoffs(params: {
  orderedStandings: readonly StandingRow[];
  playoffIneligibilityAtMisses: number;
}): QualifiedEntry[] {
  return selectChampionshipField(params).qualifiers;
}

function bySeed(field: ChampionshipField, seed: number) {
  return (
    field.qualifiers.find((entry) => entry.qualificationSeed === seed) ?? null
  );
}

export function constructBracketRepresentation(
  field: ChampionshipField,
): BracketRepresentation {
  const slotCount = field.format === "FOUR_SLOT" ? 4 : 6;
  const slots = Array.from({ length: slotCount }, (_, index): BracketSlot => {
    const entry = bySeed(field, index + 1);
    return {
      slot: index + 1,
      state: entry ? "OCCUPIED" : "VACANT",
      entry,
    };
  });
  const automaticWeek15Advancements: AutomaticAdvancement[] = [];

  if (field.format === "FOUR_SLOT") {
    for (const entry of field.qualifiers) {
      automaticWeek15Advancements.push({
        entry,
        fromWeek: 15,
        toWeek: 16,
        reason: "FOUR_SLOT_EXHIBITION_BYE",
      });
    }
  } else {
    for (const seed of [1, 2]) {
      const entry = bySeed(field, seed);
      if (entry) {
        automaticWeek15Advancements.push({
          entry,
          fromWeek: 15,
          toWeek: 16,
          reason: "TOP_TWO_SEED_BYE",
        });
      }
    }
    for (const [seed, opponentSeed] of [
      [3, 6],
      [4, 5],
    ] as const) {
      const entry = bySeed(field, seed);
      if (entry && !bySeed(field, opponentSeed)) {
        automaticWeek15Advancements.push({
          entry,
          fromWeek: 15,
          toWeek: 16,
          reason: "VACANT_OPPONENT",
        });
      }
    }
  }
  return { format: field.format, slots, automaticWeek15Advancements };
}

function participant(
  entryId: string,
  frozenOrder: readonly string[],
  field: ChampionshipField,
): PostseasonParticipant {
  const qualifier = field.qualifiers.find((entry) => entry.entryId === entryId);
  const regularSeasonSeed = frozenOrder.indexOf(entryId) + 1;
  if (regularSeasonSeed === 0) throw new Error("Unknown postseason entry.");
  return {
    entryId,
    regularSeasonSeed,
    qualificationSeed: qualifier?.qualificationSeed ?? null,
  };
}

function championshipGame(
  week: PostseasonWeek,
  sideA: QualifiedEntry,
  sideB: QualifiedEntry,
  label: string,
): BracketGame {
  return {
    week,
    role: "CHAMPIONSHIP",
    scope: "CHAMPIONSHIP",
    sideA,
    sideB,
    label,
    byeExhibition: false,
  };
}

function pairRemaining(params: {
  week: PostseasonWeek;
  field: ChampionshipField;
  frozenWeek14Order: readonly string[];
  reservedEntryIds: ReadonlySet<string>;
  byeEntryIds?: ReadonlySet<string>;
}): BracketGame[] {
  const remaining = params.frozenWeek14Order.filter(
    (entryId) => !params.reservedEntryIds.has(entryId),
  );
  if (remaining.length % 2 !== 0) {
    throw new Error("Every-member postseason pairing left an unpaired member.");
  }
  const qualifiers = new Set(
    params.field.qualifiers.map((entry) => entry.entryId),
  );
  const games: BracketGame[] = [];
  for (let index = 0; index < remaining.length; index += 2) {
    const sideAId = remaining[index];
    const sideBId = remaining[index + 1];
    if (!sideAId || !sideBId) throw new Error("Missing postseason member.");
    const containsBye = Boolean(
      params.byeEntryIds?.has(sideAId) || params.byeEntryIds?.has(sideBId),
    );
    const role: PostseasonRole =
      params.week !== 15 &&
      !containsBye &&
      qualifiers.has(sideAId) &&
      qualifiers.has(sideBId)
        ? "PLACEMENT"
        : "EXHIBITION";
    const byeExhibition = role === "EXHIBITION" && containsBye;
    games.push({
      week: params.week,
      role,
      scope: role,
      sideA: participant(sideAId, params.frozenWeek14Order, params.field),
      sideB: participant(sideBId, params.frozenWeek14Order, params.field),
      label:
        role === "PLACEMENT"
          ? "Placement matchup"
          : byeExhibition
            ? "Bye exhibition"
            : "Exhibition",
      byeExhibition,
    });
  }
  return games;
}

function assertEveryMember(
  games: readonly BracketGame[],
  frozenWeek14Order: readonly string[],
) {
  const appearances = games.flatMap((game) => [
    game.sideA.entryId,
    game.sideB.entryId,
  ]);
  if (
    games.length !== frozenWeek14Order.length / 2 ||
    new Set(appearances).size !== frozenWeek14Order.length ||
    frozenWeek14Order.some((entryId) => !appearances.includes(entryId))
  ) {
    throw new Error("Every postseason member must appear exactly once.");
  }
}

export function reseedLargeLeagueSemifinals(params: {
  seedOne: QualifiedEntry;
  seedTwo: QualifiedEntry;
  openingRoundWinners: readonly [QualifiedEntry, QualifiedEntry];
}): readonly [BracketGame, BracketGame] {
  const [lowestRankedRemaining, otherWinner] = [
    ...params.openingRoundWinners,
  ].sort((left, right) => right.qualificationSeed - left.qualificationSeed);
  if (!lowestRankedRemaining || !otherWinner) {
    throw new Error("Two Week 15 survivors are required.");
  }
  return [
    championshipGame(
      16,
      params.seedOne,
      lowestRankedRemaining,
      "Semifinal · No. 1 seed vs lowest remaining seed",
    ),
    championshipGame(16, params.seedTwo, otherWinner, "Semifinal · No. 2 seed"),
  ];
}

export function constructEffectivePostseasonMatchups(params: {
  week: PostseasonWeek;
  field: ChampionshipField;
  frozenWeek14Order: readonly string[];
  priorChampionshipOutcomes?: readonly ChampionshipOutcome[];
}): BracketGame[] {
  validateEntryOrder(params.frozenWeek14Order);
  const championship: BracketGame[] = [];
  const byeEntryIds = new Set<string>();

  if (params.week === 15 && params.field.format === "SIX_SLOT") {
    for (const [seedA, seedB] of [
      [3, 6],
      [4, 5],
    ] as const) {
      const sideA = bySeed(params.field, seedA);
      const sideB = bySeed(params.field, seedB);
      if (sideA && sideB) {
        championship.push(
          championshipGame(
            15,
            sideA,
            sideB,
            `Opening round · ${seedA} vs ${seedB}`,
          ),
        );
      }
    }
  } else if (params.week === 16 && params.field.format === "FOUR_SLOT") {
    const seed1 = bySeed(params.field, 1);
    const seed2 = bySeed(params.field, 2);
    const seed3 = bySeed(params.field, 3);
    const seed4 = bySeed(params.field, 4);
    if (!seed1 || !seed2 || !seed3 || !seed4) {
      throw new Error("The four-slot semifinal field is incomplete.");
    }
    championship.push(
      championshipGame(16, seed1, seed4, "Semifinal · 1 vs 4"),
      championshipGame(16, seed2, seed3, "Semifinal · 2 vs 3"),
    );
  } else if (params.week === 16) {
    const outcomes = params.priorChampionshipOutcomes ?? [];
    const automatic = constructBracketRepresentation(params.field)
      .automaticWeek15Advancements.filter(
        (advance) => advance.reason === "VACANT_OPPONENT",
      )
      .map((advance) => advance.entry);
    const survivors = [
      ...outcomes.map((outcome) => outcome.winner),
      ...automatic,
    ]
      .filter(
        (entry, index, entries) =>
          entries.findIndex(
            (candidate) => candidate.entryId === entry.entryId,
          ) === index,
      )
      .sort((left, right) => left.qualificationSeed - right.qualificationSeed);
    const seedOne = bySeed(params.field, 1);
    const seedTwo = bySeed(params.field, 2);
    if (!seedOne || !seedTwo || survivors.length !== 2) {
      throw new Error("Week 16 requires two terminal Week 15 survivors.");
    }
    championship.push(
      ...reseedLargeLeagueSemifinals({
        seedOne,
        seedTwo,
        openingRoundWinners: [survivors[0]!, survivors[1]!],
      }),
    );
  } else if (params.week === 17) {
    const outcomes = params.priorChampionshipOutcomes ?? [];
    if (outcomes.length !== 2) {
      throw new Error("Week 17 requires two terminal semifinal outcomes.");
    }
    championship.push(
      championshipGame(
        17,
        outcomes[0]!.winner,
        outcomes[1]!.winner,
        "Championship",
      ),
      {
        week: 17,
        role: "THIRD_PLACE",
        scope: "THIRD_PLACE",
        sideA: outcomes[0]!.loser,
        sideB: outcomes[1]!.loser,
        label: "Third place",
        byeExhibition: false,
      },
    );
  }

  if (params.week === 15) {
    for (const advancement of constructBracketRepresentation(params.field)
      .automaticWeek15Advancements) {
      byeEntryIds.add(advancement.entry.entryId);
    }
  }

  const reservedEntryIds = new Set(
    championship.flatMap((game) => [game.sideA.entryId, game.sideB.entryId]),
  );
  const games = [
    ...championship,
    ...pairRemaining({
      week: params.week,
      field: params.field,
      frozenWeek14Order: params.frozenWeek14Order,
      reservedEntryIds,
      byeEntryIds,
    }),
  ];
  assertEveryMember(games, params.frozenWeek14Order);
  return games;
}

/** Legacy bracket-plan adapter retained for the existing non-authoritative fixture. */
export function createInitialBracket(params: {
  rosterSize: number;
  qualifiers: readonly QualifiedEntry[];
  allEntriesByFinalStanding: readonly string[];
}): BracketGame[] {
  return constructEffectivePostseasonMatchups({
    week: 15,
    field: {
      format: params.rosterSize <= 8 ? "FOUR_SLOT" : "SIX_SLOT",
      minimumFieldSize: 4,
      maximumFieldSize: params.rosterSize <= 8 ? 4 : 6,
      qualifiers: [...params.qualifiers],
    },
    frozenWeek14Order: params.allEntriesByFinalStanding,
  });
}

/** Compatibility adapter retained for the existing non-authoritative fixture. */
export function createWeek18Exhibitions(
  entryIdsByFinalPlacement: readonly string[],
) {
  const games: Array<{
    week: 18;
    scope: "EXHIBITION";
    sideA: PostseasonParticipant;
    sideB: PostseasonParticipant;
    label: string;
  }> = [];
  for (let index = 0; index < entryIdsByFinalPlacement.length; index += 2) {
    const sideAEntryId = entryIdsByFinalPlacement[index];
    const sideBEntryId = entryIdsByFinalPlacement[index + 1];
    if (!sideAEntryId || !sideBEntryId) continue;
    games.push({
      week: 18,
      scope: "EXHIBITION",
      sideA: {
        entryId: sideAEntryId,
        regularSeasonSeed: index + 1,
        qualificationSeed: index + 1,
      },
      sideB: {
        entryId: sideBEntryId,
        regularSeasonSeed: index + 2,
        qualificationSeed: index + 2,
      },
      label: `Week 18 placement exhibition · ${index + 1} vs ${index + 2}`,
    });
  }
  return games;
}
