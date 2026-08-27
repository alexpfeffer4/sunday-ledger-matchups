export type SettlementOutcome = "WIN" | "LOSS" | "PUSH" | "VOID";

function assertAmericanOdds(americanOdds: number): void {
  if (!Number.isInteger(americanOdds) || americanOdds === 0) {
    throw new RangeError("American odds must be a non-zero integer.");
  }
}

function assertStake(stakeCredits: number): void {
  if (!Number.isInteger(stakeCredits) || stakeCredits < 0) {
    throw new RangeError("Stake must be a non-negative whole credit amount.");
  }
}

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n || numerator < 0n) {
    throw new RangeError("Round-half-up requires non-negative values.");
  }

  return (numerator * 2n + denominator) / (denominator * 2n);
}

export function profitCenticredits(
  stakeCredits: number,
  americanOdds: number,
): bigint {
  assertStake(stakeCredits);
  assertAmericanOdds(americanOdds);

  if (americanOdds > 0) {
    return BigInt(stakeCredits) * BigInt(americanOdds);
  }

  return roundHalfUp(
    BigInt(stakeCredits) * 10_000n,
    BigInt(Math.abs(americanOdds)),
  );
}

export function returnedCenticredits(
  stakeCredits: number,
  americanOdds: number,
  outcome: SettlementOutcome,
): bigint {
  assertStake(stakeCredits);
  assertAmericanOdds(americanOdds);

  switch (outcome) {
    case "WIN":
      return (
        BigInt(stakeCredits) * 100n +
        profitCenticredits(stakeCredits, americanOdds)
      );
    case "PUSH":
    case "VOID":
      return BigInt(stakeCredits) * 100n;
    case "LOSS":
      return 0n;
  }
}

export function formatCenticredits(
  value: bigint,
  includeWholeDecimals = false,
): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 100n;
  const cents = absolute % 100n;
  const formattedWhole = new Intl.NumberFormat("en-US").format(whole);

  if (!includeWholeDecimals && cents === 0n) {
    return `${negative ? "−" : ""}${formattedWhole}`;
  }

  return `${negative ? "−" : ""}${formattedWhole}.${cents.toString().padStart(2, "0")}`;
}
