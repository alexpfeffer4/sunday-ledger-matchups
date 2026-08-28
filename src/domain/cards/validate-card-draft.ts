import {
  cardCompliance,
  validateProposedPosition,
  type AcceptedCardPosition,
  type EligibleCardOpportunity,
  type PositionValidationCode,
  type ProposedCardPosition,
} from "@/domain/cards/validate-position";
import type { SeasonRuleset } from "@/rulesets/schema";

export type DraftCardValidation =
  | {
      accepted: true;
      allocatedCredits: number;
      positionCount: number;
      positions: AcceptedCardPosition[];
    }
  | {
      accepted: false;
      code: PositionValidationCode | "EMPTY_DRAFT" | "INCOMPLETE_CARD";
      message: string;
      positionIndex?: number;
    };

export function validateDraftCard(params: {
  acceptedPositions?: readonly AcceptedCardPosition[];
  draftPositions: readonly ProposedCardPosition[];
  eligibleOpportunities: readonly EligibleCardOpportunity[];
  ruleset: SeasonRuleset;
}): DraftCardValidation {
  const positions = [...(params.acceptedPositions ?? [])];

  if (params.draftPositions.length === 0) {
    return {
      accepted: false,
      code: "EMPTY_DRAFT",
      message: "Add at least one pick before reviewing the card.",
    };
  }

  for (const [
    positionIndex,
    proposedPosition,
  ] of params.draftPositions.entries()) {
    const validation = validateProposedPosition({
      acceptedPositions: positions,
      proposedPosition,
      eligibleOpportunities: params.eligibleOpportunities,
      ruleset: params.ruleset,
    });
    if (!validation.accepted) {
      return {
        accepted: false,
        code: validation.code,
        message: validation.message,
        positionIndex,
      };
    }
    positions.push(proposedPosition);
  }

  const allocatedCredits = positions.reduce(
    (total, position) => total + position.stakeCredits,
    0,
  );
  if (cardCompliance(positions, params.ruleset) !== "COMPLIANT") {
    return {
      accepted: false,
      code: "INCOMPLETE_CARD",
      message: `Allocate exactly ${params.ruleset.card.weeklyAllocationCredits.toLocaleString()} credits before sealing the card.`,
    };
  }

  return {
    accepted: true,
    allocatedCredits,
    positionCount: positions.length,
    positions,
  };
}
