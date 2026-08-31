import type { PostseasonParticipant } from "@/domain/playoffs/bracket";

export type TerminalDecision = "WIN" | "LOSS" | "TIE";

export type TerminalMatchupFact = {
  matchupId: string;
  resultVersionId: string;
  sideAEntryId: string;
  sideBEntryId: string;
  sideADecision: TerminalDecision;
  sideBDecision: TerminalDecision;
};

export type EarlierRoundElimination = {
  entryId: string;
  /** The already-determined postseason place, such as fifth or sixth. */
  placement: number;
  resultVersionId: string;
};

export type FinalPostseasonPlacement = {
  entryId: string;
  placement: number;
  role:
    | "CHAMPION"
    | "RUNNER_UP"
    | "THIRD_PLACE"
    | "FOURTH_PLACE"
    | "EARLIER_ROUND"
    | "NON_QUALIFIER";
  tied: boolean;
};

export type ChampionFinality = {
  championEntryId: string;
  runnerUpEntryId: string;
  thirdPlaceEntryIds: readonly string[];
  thirdPlaceTied: boolean;
  terminalResultVersionIds: readonly string[];
  placements: readonly FinalPostseasonPlacement[];
};

export type Week18Pairing = {
  game: number;
  week: 18;
  role: "EXHIBITION";
  scope: "EXHIBITION";
  sideA: PostseasonParticipant;
  sideB: PostseasonParticipant;
  label: string;
  byeExhibition: false;
};

export type Week18ProtectionFacts = {
  weekState: "PLANNED" | "OPEN" | "LOCKED" | "PROVISIONAL" | "FINAL";
  hasSuccessfulCardSeal: boolean;
  hasReceipt: boolean;
  hasScoreVersion: boolean;
  hasResultVersion: boolean;
};

export type EffectiveWeek18Round = {
  version: number;
  supersedesVersion: number | null;
  placementOrder: readonly string[];
  pairings: readonly Week18Pairing[];
};

function assertUniqueRoster(frozenWeek14Order: readonly string[]) {
  if (
    frozenWeek14Order.length < 4 ||
    frozenWeek14Order.length % 2 !== 0 ||
    new Set(frozenWeek14Order).size !== frozenWeek14Order.length
  ) {
    throw new Error("A complete, even, uniquely ordered roster is required.");
  }
}

function frozenIndex(frozenWeek14Order: readonly string[], entryId: string) {
  const index = frozenWeek14Order.indexOf(entryId);
  if (index < 0)
    throw new Error("A postseason fact contains an unknown entry.");
  return index;
}

function winnerAndLoser(fact: TerminalMatchupFact) {
  if (fact.sideADecision === "WIN" && fact.sideBDecision === "LOSS") {
    return {
      winnerEntryId: fact.sideAEntryId,
      loserEntryId: fact.sideBEntryId,
    };
  }
  if (fact.sideBDecision === "WIN" && fact.sideADecision === "LOSS") {
    return {
      winnerEntryId: fact.sideBEntryId,
      loserEntryId: fact.sideAEntryId,
    };
  }
  return null;
}

function assertDistinctMatchup(fact: TerminalMatchupFact) {
  if (fact.sideAEntryId === fact.sideBEntryId) {
    throw new Error("A terminal matchup requires two distinct entries.");
  }
}

/**
 * Derives champion finality and the complete postseason placement order from
 * terminal Week 17 facts. Frozen Week 14 order is used only inside an equal
 * placement; exhibition facts are deliberately absent from this input.
 */
export function deriveChampionFinality(params: {
  frozenWeek14Order: readonly string[];
  qualifierEntryIds: readonly string[];
  championship: TerminalMatchupFact;
  thirdPlace: TerminalMatchupFact;
  earlierRoundEliminations: readonly EarlierRoundElimination[];
}): ChampionFinality {
  assertUniqueRoster(params.frozenWeek14Order);
  assertDistinctMatchup(params.championship);
  assertDistinctMatchup(params.thirdPlace);

  const roster = new Set(params.frozenWeek14Order);
  const qualifierSet = new Set(params.qualifierEntryIds);
  if (
    qualifierSet.size !== params.qualifierEntryIds.length ||
    params.qualifierEntryIds.length < 4 ||
    params.qualifierEntryIds.some((entryId) => !roster.has(entryId))
  ) {
    throw new Error("The terminal championship field is invalid.");
  }

  const title = winnerAndLoser(params.championship);
  if (!title) {
    throw new Error("The championship must have a deterministic winner.");
  }

  const thirdPlaceOutcome = winnerAndLoser(params.thirdPlace);
  const thirdPlaceTied = thirdPlaceOutcome === null;
  if (
    thirdPlaceTied &&
    !(
      params.thirdPlace.sideADecision === "TIE" &&
      params.thirdPlace.sideBDecision === "TIE"
    )
  ) {
    throw new Error("The third-place result is internally inconsistent.");
  }

  const podiumIds = new Set([
    title.winnerEntryId,
    title.loserEntryId,
    params.thirdPlace.sideAEntryId,
    params.thirdPlace.sideBEntryId,
  ]);
  if (
    podiumIds.size !== 4 ||
    [...podiumIds].some(
      (entryId) => !roster.has(entryId) || !qualifierSet.has(entryId),
    )
  ) {
    throw new Error("Week 17 must contain four distinct qualified entries.");
  }

  const placements: FinalPostseasonPlacement[] = [
    {
      entryId: title.winnerEntryId,
      placement: 1,
      role: "CHAMPION",
      tied: false,
    },
    {
      entryId: title.loserEntryId,
      placement: 2,
      role: "RUNNER_UP",
      tied: false,
    },
  ];

  if (thirdPlaceTied) {
    for (const entryId of [
      params.thirdPlace.sideAEntryId,
      params.thirdPlace.sideBEntryId,
    ].toSorted(
      (left, right) =>
        frozenIndex(params.frozenWeek14Order, left) -
        frozenIndex(params.frozenWeek14Order, right),
    )) {
      placements.push({
        entryId,
        placement: 3,
        role: "THIRD_PLACE",
        tied: true,
      });
    }
  } else {
    placements.push(
      {
        entryId: thirdPlaceOutcome.winnerEntryId,
        placement: 3,
        role: "THIRD_PLACE",
        tied: false,
      },
      {
        entryId: thirdPlaceOutcome.loserEntryId,
        placement: 4,
        role: "FOURTH_PLACE",
        tied: false,
      },
    );
  }

  const eliminationIds = new Set<string>();
  const eliminations = [...params.earlierRoundEliminations].toSorted(
    (left, right) =>
      left.placement - right.placement ||
      frozenIndex(params.frozenWeek14Order, left.entryId) -
        frozenIndex(params.frozenWeek14Order, right.entryId),
  );
  for (const elimination of eliminations) {
    if (
      !qualifierSet.has(elimination.entryId) ||
      podiumIds.has(elimination.entryId) ||
      eliminationIds.has(elimination.entryId) ||
      elimination.placement < 5
    ) {
      throw new Error("Earlier-round placement evidence is invalid.");
    }
    eliminationIds.add(elimination.entryId);
    placements.push({
      entryId: elimination.entryId,
      placement: elimination.placement,
      role: "EARLIER_ROUND",
      tied:
        eliminations.filter(
          (candidate) => candidate.placement === elimination.placement,
        ).length > 1,
    });
  }

  const representedQualifiers = new Set([...podiumIds, ...eliminationIds]);
  if (
    representedQualifiers.size !== qualifierSet.size ||
    [...qualifierSet].some((entryId) => !representedQualifiers.has(entryId))
  ) {
    throw new Error("Every qualifier requires a determined final placement.");
  }

  for (const entryId of params.frozenWeek14Order) {
    if (!qualifierSet.has(entryId)) {
      placements.push({
        entryId,
        placement: placements.length + 1,
        role: "NON_QUALIFIER",
        tied: false,
      });
    }
  }

  const thirdPlaceEntryIds = placements
    .filter((placement) => placement.placement === 3)
    .map((placement) => placement.entryId);
  const terminalResultVersionIds = [
    params.championship.resultVersionId,
    params.thirdPlace.resultVersionId,
    ...eliminations.map((elimination) => elimination.resultVersionId),
  ];
  if (
    new Set(terminalResultVersionIds).size !== terminalResultVersionIds.length
  ) {
    throw new Error("Terminal result version evidence must be unique.");
  }

  return {
    championEntryId: title.winnerEntryId,
    runnerUpEntryId: title.loserEntryId,
    thirdPlaceEntryIds,
    thirdPlaceTied,
    terminalResultVersionIds,
    placements,
  };
}

export function pairWeek18Exhibitions(params: {
  placements: readonly FinalPostseasonPlacement[];
  frozenWeek14Order: readonly string[];
  qualificationSeeds?: ReadonlyMap<string, number>;
}): Week18Pairing[] {
  assertUniqueRoster(params.frozenWeek14Order);
  if (
    params.placements.length !== params.frozenWeek14Order.length ||
    new Set(params.placements.map((placement) => placement.entryId)).size !==
      params.placements.length ||
    params.frozenWeek14Order.some(
      (entryId) =>
        !params.placements.some((placement) => placement.entryId === entryId),
    )
  ) {
    throw new Error("Week 18 requires a complete final-placement order.");
  }

  const placementOrder = [...params.placements]
    .toSorted(
      (left, right) =>
        left.placement - right.placement ||
        frozenIndex(params.frozenWeek14Order, left.entryId) -
          frozenIndex(params.frozenWeek14Order, right.entryId),
    )
    .map((placement) => placement.entryId);

  const pairings: Week18Pairing[] = [];
  for (let index = 0; index < placementOrder.length; index += 2) {
    const sideAEntryId = placementOrder[index];
    const sideBEntryId = placementOrder[index + 1];
    if (!sideAEntryId || !sideBEntryId) {
      throw new Error("Week 18 left a member unpaired.");
    }
    const participantFor = (entryId: string): PostseasonParticipant => ({
      entryId,
      regularSeasonSeed: frozenIndex(params.frozenWeek14Order, entryId) + 1,
      qualificationSeed: params.qualificationSeeds?.get(entryId) ?? null,
    });
    pairings.push({
      game: index / 2 + 1,
      week: 18,
      role: "EXHIBITION",
      scope: "EXHIBITION",
      sideA: participantFor(sideAEntryId),
      sideB: participantFor(sideBEntryId),
      label: `Exhibition · final places ${index + 1} and ${index + 2}`,
      byeExhibition: false,
    });
  }
  return pairings;
}

export function week18PairingsRemainReplaceable(
  facts: Week18ProtectionFacts,
): boolean {
  return (
    (facts.weekState === "PLANNED" || facts.weekState === "OPEN") &&
    !facts.hasSuccessfulCardSeal &&
    !facts.hasReceipt &&
    !facts.hasScoreVersion &&
    !facts.hasResultVersion
  );
}

export function rebuildEffectiveWeek18Round(params: {
  currentRound: EffectiveWeek18Round;
  nextPlacements: readonly FinalPostseasonPlacement[];
  frozenWeek14Order: readonly string[];
  qualificationSeeds?: ReadonlyMap<string, number>;
  protection: Week18ProtectionFacts;
}):
  | { status: "UNCHANGED" | "FROZEN"; round: EffectiveWeek18Round }
  | { status: "SUPERSEDED"; round: EffectiveWeek18Round } {
  const nextPairings = pairWeek18Exhibitions({
    placements: params.nextPlacements,
    frozenWeek14Order: params.frozenWeek14Order,
    qualificationSeeds: params.qualificationSeeds,
  });
  const nextOrder = nextPairings.flatMap((pairing) => [
    pairing.sideA.entryId,
    pairing.sideB.entryId,
  ]);
  if (
    nextOrder.length === params.currentRound.placementOrder.length &&
    nextOrder.every(
      (entryId, index) => entryId === params.currentRound.placementOrder[index],
    )
  ) {
    return { status: "UNCHANGED", round: params.currentRound };
  }
  if (!week18PairingsRemainReplaceable(params.protection)) {
    return { status: "FROZEN", round: params.currentRound };
  }
  return {
    status: "SUPERSEDED",
    round: {
      version: params.currentRound.version + 1,
      supersedesVersion: params.currentRound.version,
      placementOrder: nextOrder,
      pairings: nextPairings,
    },
  };
}
