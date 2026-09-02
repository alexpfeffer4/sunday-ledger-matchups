import {
  canCompleteCard,
  type CompletionOpportunity,
} from "@/domain/cards/completion";
import { formatCredits } from "@/domain/odds/american";
import type { MarketType, SeasonRuleset } from "@/rulesets/schema";

export type AcceptedCardPosition = {
  eventId: string;
  marketType: MarketType;
  stakeCredits: number;
  americanOdds: number;
};

export type ProposedCardPosition = AcceptedCardPosition;

export type EligibleCardOpportunity = Omit<
  CompletionOpportunity,
  "maximumStakeCredits"
> & {
  americanOdds: number;
};

export type PositionValidationCode =
  | "INVALID_STAKE"
  | "BELOW_MINIMUM"
  | "ABOVE_POSITION_CAP"
  | "OVER_ALLOCATION"
  | "POSITION_LIMIT"
  | "DUPLICATE_OR_OPPOSING_MARKET"
  | "NO_LEGAL_COMPLETION";

export type PositionValidation =
  | {
      accepted: true;
      allocatedCredits: number;
      remainingCredits: number;
      positionCount: number;
      maximumStakeCredits: number;
    }
  | {
      accepted: false;
      code: PositionValidationCode;
      message: string;
      maximumStakeCredits?: number;
    };

export function maximumStakeForOdds(
  americanOdds: number,
  ruleset: Pick<SeasonRuleset, "concentration">,
): number {
  return americanOdds < ruleset.concentration.heavyFavoriteThresholdAmerican
    ? ruleset.concentration.heavyFavoriteSinglePositionCapCredits
    : ruleset.concentration.standardSinglePositionCapCredits;
}

function marketKey(
  position: Pick<AcceptedCardPosition, "eventId" | "marketType">,
): string {
  return `${position.eventId}:${position.marketType}`;
}

export function validateProposedPosition(params: {
  acceptedPositions: readonly AcceptedCardPosition[];
  proposedPosition: ProposedCardPosition;
  eligibleOpportunities: readonly EligibleCardOpportunity[];
  ruleset: SeasonRuleset;
}): PositionValidation {
  const { acceptedPositions, proposedPosition, ruleset } = params;
  const { weeklyAllocationCredits, minimumStakeCredits, maximumPositions } =
    ruleset.card;
  const currentAllocated = acceptedPositions.reduce(
    (total, position) => total + position.stakeCredits,
    0,
  );

  if (
    !Number.isInteger(proposedPosition.stakeCredits) ||
    proposedPosition.stakeCredits <= 0
  ) {
    return {
      accepted: false,
      code: "INVALID_STAKE",
      message: "Picks use positive whole-credit amounts.",
    };
  }

  if (proposedPosition.stakeCredits < minimumStakeCredits) {
    return {
      accepted: false,
      code: "BELOW_MINIMUM",
      message: `This pick must use at least ${formatCredits(minimumStakeCredits)} credits.`,
    };
  }

  const maximumStakeCredits = maximumStakeForOdds(
    proposedPosition.americanOdds,
    ruleset,
  );
  if (proposedPosition.stakeCredits > maximumStakeCredits) {
    return {
      accepted: false,
      code: "ABOVE_POSITION_CAP",
      maximumStakeCredits,
      message: `At these odds, this pick may use at most ${formatCredits(maximumStakeCredits)} credits.`,
    };
  }

  if (acceptedPositions.length >= maximumPositions) {
    return {
      accepted: false,
      code: "POSITION_LIMIT",
      message: `A weekly card may contain at most ${maximumPositions} picks.`,
    };
  }

  const proposedKey = marketKey(proposedPosition);
  if (
    acceptedPositions.some((position) => marketKey(position) === proposedKey)
  ) {
    return {
      accepted: false,
      code: "DUPLICATE_OR_OPPOSING_MARKET",
      message:
        "You already have a pick for this game and market. Opposing picks are not allowed.",
    };
  }

  const allocatedCredits = currentAllocated + proposedPosition.stakeCredits;
  if (allocatedCredits > weeklyAllocationCredits) {
    return {
      accepted: false,
      code: "OVER_ALLOCATION",
      message: `This pick exceeds the ${formatCredits(weeklyAllocationCredits)}-credit weekly allocation.`,
    };
  }

  const remainingCredits = weeklyAllocationCredits - allocatedCredits;
  const usedKeys = new Set([...acceptedPositions.map(marketKey), proposedKey]);
  const remainingOpportunities = params.eligibleOpportunities
    .filter((opportunity) => !usedKeys.has(marketKey(opportunity)))
    .map((opportunity) => ({
      eventId: opportunity.eventId,
      marketType: opportunity.marketType,
      maximumStakeCredits: maximumStakeForOdds(
        opportunity.americanOdds,
        ruleset,
      ),
    }));
  const completion = canCompleteCard({
    remainderCredits: remainingCredits,
    minimumStakeCredits,
    remainingPositionSlots: maximumPositions - acceptedPositions.length - 1,
    opportunities: remainingOpportunities,
  });

  if (!completion.possible) {
    return {
      accepted: false,
      code: "NO_LEGAL_COMPLETION",
      message:
        remainingCredits > 0 && remainingCredits < minimumStakeCredits
          ? `${formatCredits(proposedPosition.stakeCredits)} would leave ${formatCredits(remainingCredits)} credits, below the ${formatCredits(minimumStakeCredits)}-credit minimum.`
          : `This pick would leave no way to use all ${formatCredits(weeklyAllocationCredits)} credits.`,
    };
  }

  return {
    accepted: true,
    allocatedCredits,
    remainingCredits,
    positionCount: acceptedPositions.length + 1,
    maximumStakeCredits,
  };
}

export function cardCompliance(
  positions: readonly AcceptedCardPosition[],
  ruleset: SeasonRuleset,
): "COMPLIANT" | "INCOMPLETE" {
  const acceptedCredits = positions.reduce(
    (total, position) => total + position.stakeCredits,
    0,
  );
  return acceptedCredits === ruleset.card.weeklyAllocationCredits &&
    positions.length >= ruleset.card.minimumPositions &&
    positions.length <= ruleset.card.maximumPositions
    ? "COMPLIANT"
    : "INCOMPLETE";
}
