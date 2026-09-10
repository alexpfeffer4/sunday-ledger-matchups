import type { Stage1StateDto } from "@/application/queries/stage1-dtos";
import { makePhase6State } from "./phase6-paired-matchup";

export function makeStage3CardState(eventCount = 2): Stage1StateDto {
  const { state } = makePhase6State("PREGAME");
  state.league.mode = "SIMULATION";
  state.season.simulatedNow = "2026-09-13T16:30:00.000Z";
  state.ownerCard = {
    ...state.ownerCard!,
    positions: [],
    compliance: "PENDING",
    allocatedCredits: 0,
    remainingCredits: 1000,
    lockedAt: null,
  };
  state.slate = Array.from({ length: eventCount }, (_, index) => ({
    ...state.slate[index % 2],
    id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    awayTeam: index % 2 ? "River Club" : "Harbor Club",
    homeTeam: index % 2 ? "Capital Club" : "Lake Club",
    markets: (["MONEYLINE", "SPREAD", "TOTAL"] as const).map(
      (marketType, market) => ({
        id: `20000000-0000-4000-8000-${String(index * 3 + market).padStart(12, "0")}`,
        americanOdds: -200,
        lineMilli:
          marketType === "MONEYLINE"
            ? null
            : marketType === "SPREAD"
              ? -3500
              : 47500,
        marketType,
        outcomeKey:
          marketType === "TOTAL" ? ("OVER" as const) : ("AWAY" as const),
        proposition:
          marketType === "TOTAL"
            ? "Over 47.5"
            : marketType === "SPREAD"
              ? "Away -3.5"
              : "Away to win",
        qualityStatus: "HEALTHY" as const,
        observedAt: "2026-09-13T16:29:00.000Z",
        payloadHash: String(market).repeat(64),
        maximumStakeCredits: 1000,
      }),
    ),
  }));
  return state;
}

export function savedStage3Draft(
  state: Stage1StateDto,
  stakes = [500, 500],
  marketIndex = 2,
) {
  return JSON.stringify({
    version: 1,
    drafts: stakes.map((stakeCredits, index) => {
      const event = state.slate[index % state.slate.length];
      const market = event.markets[marketIndex];
      return {
        eventId: event.id,
        marketType: market.marketType,
        outcomeKey: market.outcomeKey,
        reviewedAmericanOdds: market.americanOdds,
        reviewedProposition: market.proposition,
        reviewedPayloadHash: market.payloadHash,
        stakeCredits,
      };
    }),
  });
}
