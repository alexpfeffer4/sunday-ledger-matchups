import type { PostseasonRole } from "@/domain/playoffs/bracket";

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
  eliminatedEntryId: string;
  reason: "SCORE" | "INCOMPLETE" | "HIGHER_SEED_TIEBREAK";
} {
  const { sideA, sideB } = params;
  let advancingEntryId: string;
  let reason: "SCORE" | "INCOMPLETE" | "HIGHER_SEED_TIEBREAK";
  if (sideA.compliance !== sideB.compliance) {
    advancingEntryId =
      sideA.compliance === "COMPLIANT" ? sideA.entryId : sideB.entryId;
    reason = "INCOMPLETE";
  } else if (
    sideA.compliance === "COMPLIANT" &&
    sideA.scoreCenticredits !== sideB.scoreCenticredits
  ) {
    advancingEntryId =
      sideA.scoreCenticredits > sideB.scoreCenticredits
        ? sideA.entryId
        : sideB.entryId;
    reason = "SCORE";
  } else {
    advancingEntryId =
      sideA.qualificationSeed < sideB.qualificationSeed
        ? sideA.entryId
        : sideB.entryId;
    reason = "HIGHER_SEED_TIEBREAK";
  }
  return {
    advancingEntryId,
    eliminatedEntryId:
      advancingEntryId === sideA.entryId ? sideB.entryId : sideA.entryId,
    reason,
  };
}

export type NonChampionshipDecision = {
  role: Exclude<PostseasonRole, "CHAMPIONSHIP">;
  decisions: Record<string, "WIN" | "LOSS" | "TIE" | "NONE">;
  exhibitionScoresCenticredits: Record<string, bigint>;
  participationMarkers: Record<string, "COMPLETED" | "EXHIBITION_MISS">;
  advancingEntryId: null;
  affectsOfficialCompetition: false;
};

export function decideNonChampionshipMatchup(params: {
  role: Exclude<PostseasonRole, "CHAMPIONSHIP">;
  sideA: CardScore;
  sideB: CardScore;
}): NonChampionshipDecision {
  const { sideA, sideB } = params;
  let decisions: NonChampionshipDecision["decisions"];
  if (sideA.compliance === "INCOMPLETE" || sideB.compliance === "INCOMPLETE") {
    decisions = { [sideA.entryId]: "NONE", [sideB.entryId]: "NONE" };
  } else if (sideA.scoreCenticredits === sideB.scoreCenticredits) {
    decisions = { [sideA.entryId]: "TIE", [sideB.entryId]: "TIE" };
  } else {
    const sideAWon = sideA.scoreCenticredits > sideB.scoreCenticredits;
    decisions = {
      [sideA.entryId]: sideAWon ? "WIN" : "LOSS",
      [sideB.entryId]: sideAWon ? "LOSS" : "WIN",
    };
  }
  return {
    role: params.role,
    decisions,
    exhibitionScoresCenticredits: {
      [sideA.entryId]:
        sideA.compliance === "COMPLIANT" ? sideA.scoreCenticredits : 0n,
      [sideB.entryId]:
        sideB.compliance === "COMPLIANT" ? sideB.scoreCenticredits : 0n,
    },
    participationMarkers: {
      [sideA.entryId]:
        sideA.compliance === "INCOMPLETE" ? "EXHIBITION_MISS" : "COMPLETED",
      [sideB.entryId]:
        sideB.compliance === "INCOMPLETE" ? "EXHIBITION_MISS" : "COMPLETED",
    },
    advancingEntryId: null,
    affectsOfficialCompetition: false,
  };
}
