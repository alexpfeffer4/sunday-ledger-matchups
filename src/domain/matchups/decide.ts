export type CardScore = {
  entryId: string;
  compliance: "COMPLIANT" | "INCOMPLETE";
  scoreCenticredits: bigint;
};

export type RegularSeasonDecision = {
  decisions: Record<string, "WIN" | "LOSS" | "TIE">;
  pointsForCenticredits: Record<string, bigint>;
};

export function decideRegularSeasonMatchup(
  sideA: CardScore,
  sideB: CardScore,
): RegularSeasonDecision {
  const pointsForCenticredits = {
    [sideA.entryId]:
      sideA.compliance === "COMPLIANT" ? sideA.scoreCenticredits : 0n,
    [sideB.entryId]:
      sideB.compliance === "COMPLIANT" ? sideB.scoreCenticredits : 0n,
  };

  if (sideA.compliance === "INCOMPLETE" && sideB.compliance === "INCOMPLETE") {
    return {
      decisions: { [sideA.entryId]: "LOSS", [sideB.entryId]: "LOSS" },
      pointsForCenticredits,
    };
  }

  if (sideA.compliance === "INCOMPLETE") {
    return {
      decisions: { [sideA.entryId]: "LOSS", [sideB.entryId]: "WIN" },
      pointsForCenticredits,
    };
  }

  if (sideB.compliance === "INCOMPLETE") {
    return {
      decisions: { [sideA.entryId]: "WIN", [sideB.entryId]: "LOSS" },
      pointsForCenticredits,
    };
  }

  if (sideA.scoreCenticredits === sideB.scoreCenticredits) {
    return {
      decisions: { [sideA.entryId]: "TIE", [sideB.entryId]: "TIE" },
      pointsForCenticredits,
    };
  }

  const sideAWon = sideA.scoreCenticredits > sideB.scoreCenticredits;
  return {
    decisions: {
      [sideA.entryId]: sideAWon ? "WIN" : "LOSS",
      [sideB.entryId]: sideAWon ? "LOSS" : "WIN",
    },
    pointsForCenticredits,
  };
}

export function advancePlayoffMatchup(params: {
  sideA: CardScore & { qualificationSeed: number };
  sideB: CardScore & { qualificationSeed: number };
}): {
  advancingEntryId: string;
  reason: "SCORE" | "INCOMPLETE" | "HIGHER_SEED_TIEBREAK";
} {
  const { sideA, sideB } = params;

  if (sideA.compliance !== sideB.compliance) {
    return {
      advancingEntryId:
        sideA.compliance === "COMPLIANT" ? sideA.entryId : sideB.entryId,
      reason: "INCOMPLETE",
    };
  }

  if (
    sideA.compliance === "COMPLIANT" &&
    sideA.scoreCenticredits !== sideB.scoreCenticredits
  ) {
    return {
      advancingEntryId:
        sideA.scoreCenticredits > sideB.scoreCenticredits
          ? sideA.entryId
          : sideB.entryId,
      reason: "SCORE",
    };
  }

  return {
    advancingEntryId:
      sideA.qualificationSeed < sideB.qualificationSeed
        ? sideA.entryId
        : sideB.entryId,
    reason: "HIGHER_SEED_TIEBREAK",
  };
}
