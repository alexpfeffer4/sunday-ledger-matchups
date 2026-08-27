import { returnedCenticredits } from "@/domain/odds/american";
import type {
  EventResult,
  PositionReceipt,
  ReceiptSettlement,
} from "@/domain/settlement/types";

function compare(left: number, right: number): "WIN" | "LOSS" | "PUSH" {
  if (left > right) return "WIN";
  if (left < right) return "LOSS";
  return "PUSH";
}

export function settleReceipt(
  receipt: PositionReceipt,
  result: EventResult,
): ReceiptSettlement {
  if (receipt.eventId !== result.eventId) {
    throw new Error("Receipt and event result do not refer to the same event.");
  }

  if (result.status === "VOID") {
    return {
      receiptId: receipt.id,
      outcome: "VOID",
      returnedCenticredits: returnedCenticredits(
        receipt.stakeCredits,
        receipt.americanOdds,
        "VOID",
      ),
    };
  }

  if (result.status !== "FINAL") {
    return {
      receiptId: receipt.id,
      outcome: "PENDING",
      returnedCenticredits: null,
    };
  }

  let outcome: "WIN" | "LOSS" | "PUSH";

  switch (receipt.marketType) {
    case "MONEYLINE": {
      const selectedScore =
        receipt.selectedSide === "HOME" ? result.homeScore : result.awayScore;
      const opponentScore =
        receipt.selectedSide === "HOME" ? result.awayScore : result.homeScore;
      outcome = compare(selectedScore, opponentScore);
      break;
    }
    case "SPREAD": {
      const selectedScore =
        receipt.selectedSide === "HOME" ? result.homeScore : result.awayScore;
      const opponentScore =
        receipt.selectedSide === "HOME" ? result.awayScore : result.homeScore;
      outcome = compare(
        selectedScore * 1_000 + receipt.lineMilli,
        opponentScore * 1_000,
      );
      break;
    }
    case "TOTAL": {
      const combinedScoreMilli = (result.homeScore + result.awayScore) * 1_000;
      outcome =
        receipt.selectedSide === "OVER"
          ? compare(combinedScoreMilli, receipt.lineMilli)
          : compare(receipt.lineMilli, combinedScoreMilli);
      break;
    }
  }

  return {
    receiptId: receipt.id,
    outcome,
    returnedCenticredits: returnedCenticredits(
      receipt.stakeCredits,
      receipt.americanOdds,
      outcome,
    ),
  };
}

export function weeklyScore(
  settlements: readonly ReceiptSettlement[],
): bigint | null {
  if (settlements.some((settlement) => settlement.outcome === "PENDING")) {
    return null;
  }

  return settlements.reduce(
    (total, settlement) => total + (settlement.returnedCenticredits ?? 0n),
    0n,
  );
}
