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

export type PlayerReceipt = ReceiptBase & {
  marketType:
    "PLAYER_PASSING_YARDS" | "PLAYER_RUSHING_YARDS" | "PLAYER_RECEIVING_YARDS";
  subjectId: string;
  statistic: "PASSING_YARDS" | "RUSHING_YARDS" | "RECEIVING_YARDS";
  period: "FULL_GAME";
  selectedSide: "OVER" | "UNDER";
  lineMilli: number;
};

export type PlayerResultEvidence = {
  eventId: string;
  subjectId: string;
  statistic: PlayerReceipt["statistic"];
  period: "FULL_GAME";
  value: number | null;
  complete: boolean;
  participation: "UNKNOWN" | "OFFENSE" | "NO_OFFENSE";
  participationComplete: boolean;
};

export type PositionReceipt =
  MoneylineReceipt | SpreadReceipt | TotalReceipt | PlayerReceipt;

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
