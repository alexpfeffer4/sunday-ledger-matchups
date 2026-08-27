import type { MarketType } from "@/rulesets/schema";

type ReceiptBase = {
  id: string;
  eventId: string;
  marketType: MarketType;
  americanOdds: number;
  stakeCredits: number;
};

export type MoneylineReceipt = ReceiptBase & {
  marketType: "MONEYLINE";
  selectedSide: "HOME" | "AWAY";
};

export type SpreadReceipt = ReceiptBase & {
  marketType: "SPREAD";
  selectedSide: "HOME" | "AWAY";
  lineMilli: number;
};

export type TotalReceipt = ReceiptBase & {
  marketType: "TOTAL";
  selectedSide: "OVER" | "UNDER";
  lineMilli: number;
};

export type PositionReceipt = MoneylineReceipt | SpreadReceipt | TotalReceipt;

export type EventResult =
  | {
      eventId: string;
      status: "FINAL";
      homeScore: number;
      awayScore: number;
    }
  | { eventId: string; status: "VOID" }
  | { eventId: string; status: "SCHEDULED" | "LIVE" | "POSTPONED" };

export type ReceiptSettlement = {
  receiptId: string;
  outcome: "WIN" | "LOSS" | "PUSH" | "VOID" | "PENDING";
  returnedCenticredits: bigint | null;
};
