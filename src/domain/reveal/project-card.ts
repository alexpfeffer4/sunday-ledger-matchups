export type ReceiptProjection = {
  receiptId: string;
  eventId: string;
  proposition: string;
  stakeCredits: number;
  americanOdds: number;
  status: "SEALED" | "REVEALED" | "SETTLED";
};

export type OpponentCardProjection = {
  revealed: ReceiptProjection[];
  futureSealed: boolean;
};

export function projectOpponentCard(params: {
  revealableReceipts: readonly ReceiptProjection[];
  hasAnyFutureSealedReceipt: boolean;
}): OpponentCardProjection {
  return {
    revealed: params.revealableReceipts.map((receipt) => ({ ...receipt })),
    // This is deliberately a single boolean. It cannot reveal hidden count or geometry.
    futureSealed: params.hasAnyFutureSealedReceipt,
  };
}
