export type CompletionOpportunity = {
  eventId: string;
  marketType: "MONEYLINE" | "SPREAD" | "TOTAL";
  maximumStakeCredits: number;
};

export type CompletionCheck =
  | { possible: true; positionsNeeded: number }
  | {
      possible: false;
      reason: "BELOW_MINIMUM" | "NO_SLOTS" | "INSUFFICIENT_CAPACITY";
    };

export function canCompleteCard(params: {
  remainderCredits: number;
  minimumStakeCredits: number;
  remainingPositionSlots: number;
  opportunities: readonly CompletionOpportunity[];
}): CompletionCheck {
  const {
    remainderCredits,
    minimumStakeCredits,
    remainingPositionSlots,
    opportunities,
  } = params;

  if (remainderCredits === 0) {
    return { possible: true, positionsNeeded: 0 };
  }

  if (remainderCredits < minimumStakeCredits) {
    return { possible: false, reason: "BELOW_MINIMUM" };
  }

  if (remainingPositionSlots <= 0 || opportunities.length === 0) {
    return { possible: false, reason: "NO_SLOTS" };
  }

  const caps = opportunities
    .map((opportunity) => opportunity.maximumStakeCredits)
    .filter((cap) => cap >= minimumStakeCredits)
    .sort((left, right) => right - left);
  const maximumPositions = Math.min(remainingPositionSlots, caps.length);
  let cumulativeCapacity = 0;

  for (let positions = 1; positions <= maximumPositions; positions += 1) {
    cumulativeCapacity += caps[positions - 1] ?? 0;
    const minimumRequired = minimumStakeCredits * positions;
    if (
      minimumRequired <= remainderCredits &&
      remainderCredits <= cumulativeCapacity
    ) {
      return { possible: true, positionsNeeded: positions };
    }
  }

  return { possible: false, reason: "INSUFFICIENT_CAPACITY" };
}
