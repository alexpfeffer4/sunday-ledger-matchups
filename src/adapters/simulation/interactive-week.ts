import { maximumStakeForOdds } from "@/domain/cards/validate-position";
import { settleReceipt } from "@/domain/settlement/settle";
import type {
  EventResult,
  PositionReceipt,
  ReceiptSettlement,
} from "@/domain/settlement/types";
import { simulationSeason1Ruleset } from "@/rulesets/simulation-season-1";
import type { MarketType } from "@/rulesets/schema";

type OpportunityBase = {
  id: string;
  eventId: string;
  eventLabel: string;
  marketType: MarketType;
  proposition: string;
  displayLine: string;
  americanOdds: number;
};

export type InteractiveDemoOpportunity =
  | (OpportunityBase & {
      marketType: "MONEYLINE";
      selectedSide: "HOME" | "AWAY";
      lineMilli: null;
    })
  | (OpportunityBase & {
      marketType: "SPREAD";
      selectedSide: "HOME" | "AWAY";
      lineMilli: number;
    })
  | (OpportunityBase & {
      marketType: "TOTAL";
      selectedSide: "OVER" | "UNDER";
      lineMilli: number;
    });

export type InteractiveDemoMarket = {
  label: "Winner" | "Spread" | "Total";
  marketType: MarketType;
  opportunities: [InteractiveDemoOpportunity, InteractiveDemoOpportunity];
};

export type InteractiveDemoEvent = {
  id: string;
  awayTeam: string;
  homeTeam: string;
  kickoffLabel: string;
  markets: InteractiveDemoMarket[];
};

export type InteractiveDemoPosition = {
  id: string;
  opportunityId: string;
  stakeCredits: number;
};

export type SettledInteractiveDemoPosition = InteractiveDemoPosition & {
  opportunity: InteractiveDemoOpportunity;
  settlement: ReceiptSettlement;
};

export const interactiveDemoEvents: InteractiveDemoEvent[] = [
  {
    id: "demo-phi-dal",
    awayTeam: "Philadelphia",
    homeTeam: "Dallas",
    kickoffLabel: "Sunday · 1:00 PM ET",
    markets: [
      {
        label: "Winner",
        marketType: "MONEYLINE",
        opportunities: [
          {
            id: "demo-phi-ml",
            eventId: "demo-phi-dal",
            eventLabel: "Philadelphia at Dallas",
            marketType: "MONEYLINE",
            proposition: "Philadelphia wins the game",
            displayLine: "Philadelphia",
            americanOdds: -185,
            selectedSide: "AWAY",
            lineMilli: null,
          },
          {
            id: "demo-dal-ml",
            eventId: "demo-phi-dal",
            eventLabel: "Philadelphia at Dallas",
            marketType: "MONEYLINE",
            proposition: "Dallas wins the game",
            displayLine: "Dallas",
            americanOdds: 160,
            selectedSide: "HOME",
            lineMilli: null,
          },
        ],
      },
      {
        label: "Spread",
        marketType: "SPREAD",
        opportunities: [
          {
            id: "demo-phi-spread",
            eventId: "demo-phi-dal",
            eventLabel: "Philadelphia at Dallas",
            marketType: "SPREAD",
            proposition: "Philadelphia −3.5 must win by 4 or more",
            displayLine: "Philadelphia −3.5",
            americanOdds: -110,
            selectedSide: "AWAY",
            lineMilli: -3_500,
          },
          {
            id: "demo-dal-spread",
            eventId: "demo-phi-dal",
            eventLabel: "Philadelphia at Dallas",
            marketType: "SPREAD",
            proposition: "Dallas +3.5 may win or lose by 3 or fewer",
            displayLine: "Dallas +3.5",
            americanOdds: -110,
            selectedSide: "HOME",
            lineMilli: 3_500,
          },
        ],
      },
      {
        label: "Total",
        marketType: "TOTAL",
        opportunities: [
          {
            id: "demo-phi-dal-over",
            eventId: "demo-phi-dal",
            eventLabel: "Philadelphia at Dallas",
            marketType: "TOTAL",
            proposition: "Philadelphia and Dallas combine for over 50.5",
            displayLine: "Over 50.5",
            americanOdds: -105,
            selectedSide: "OVER",
            lineMilli: 50_500,
          },
          {
            id: "demo-phi-dal-under",
            eventId: "demo-phi-dal",
            eventLabel: "Philadelphia at Dallas",
            marketType: "TOTAL",
            proposition: "Philadelphia and Dallas combine for under 50.5",
            displayLine: "Under 50.5",
            americanOdds: -115,
            selectedSide: "UNDER",
            lineMilli: 50_500,
          },
        ],
      },
    ],
  },
  {
    id: "demo-buf-kc",
    awayTeam: "Buffalo",
    homeTeam: "Kansas City",
    kickoffLabel: "Sunday · 4:25 PM ET",
    markets: [
      {
        label: "Winner",
        marketType: "MONEYLINE",
        opportunities: [
          {
            id: "demo-buf-ml",
            eventId: "demo-buf-kc",
            eventLabel: "Buffalo at Kansas City",
            marketType: "MONEYLINE",
            proposition: "Buffalo wins the game",
            displayLine: "Buffalo",
            americanOdds: 175,
            selectedSide: "AWAY",
            lineMilli: null,
          },
          {
            id: "demo-kc-ml",
            eventId: "demo-buf-kc",
            eventLabel: "Buffalo at Kansas City",
            marketType: "MONEYLINE",
            proposition: "Kansas City wins the game",
            displayLine: "Kansas City",
            americanOdds: -205,
            selectedSide: "HOME",
            lineMilli: null,
          },
        ],
      },
      {
        label: "Spread",
        marketType: "SPREAD",
        opportunities: [
          {
            id: "demo-buf-spread",
            eventId: "demo-buf-kc",
            eventLabel: "Buffalo at Kansas City",
            marketType: "SPREAD",
            proposition: "Buffalo +4.5 may win or lose by 4 or fewer",
            displayLine: "Buffalo +4.5",
            americanOdds: -110,
            selectedSide: "AWAY",
            lineMilli: 4_500,
          },
          {
            id: "demo-kc-spread",
            eventId: "demo-buf-kc",
            eventLabel: "Buffalo at Kansas City",
            marketType: "SPREAD",
            proposition: "Kansas City −4.5 must win by 5 or more",
            displayLine: "Kansas City −4.5",
            americanOdds: -110,
            selectedSide: "HOME",
            lineMilli: -4_500,
          },
        ],
      },
      {
        label: "Total",
        marketType: "TOTAL",
        opportunities: [
          {
            id: "demo-buf-kc-over",
            eventId: "demo-buf-kc",
            eventLabel: "Buffalo at Kansas City",
            marketType: "TOTAL",
            proposition: "Buffalo and Kansas City combine for over 47.5",
            displayLine: "Over 47.5",
            americanOdds: -108,
            selectedSide: "OVER",
            lineMilli: 47_500,
          },
          {
            id: "demo-buf-kc-under",
            eventId: "demo-buf-kc",
            eventLabel: "Buffalo at Kansas City",
            marketType: "TOTAL",
            proposition: "Buffalo and Kansas City combine for under 47.5",
            displayLine: "Under 47.5",
            americanOdds: -112,
            selectedSide: "UNDER",
            lineMilli: 47_500,
          },
        ],
      },
    ],
  },
  {
    id: "demo-nyg-chi",
    awayTeam: "New York",
    homeTeam: "Chicago",
    kickoffLabel: "Monday · 8:15 PM ET",
    markets: [
      {
        label: "Winner",
        marketType: "MONEYLINE",
        opportunities: [
          {
            id: "demo-nyg-ml",
            eventId: "demo-nyg-chi",
            eventLabel: "New York at Chicago",
            marketType: "MONEYLINE",
            proposition: "New York wins the game",
            displayLine: "New York",
            americanOdds: 240,
            selectedSide: "AWAY",
            lineMilli: null,
          },
          {
            id: "demo-chi-ml",
            eventId: "demo-nyg-chi",
            eventLabel: "New York at Chicago",
            marketType: "MONEYLINE",
            proposition: "Chicago wins the game",
            displayLine: "Chicago",
            americanOdds: -280,
            selectedSide: "HOME",
            lineMilli: null,
          },
        ],
      },
      {
        label: "Spread",
        marketType: "SPREAD",
        opportunities: [
          {
            id: "demo-nyg-spread",
            eventId: "demo-nyg-chi",
            eventLabel: "New York at Chicago",
            marketType: "SPREAD",
            proposition: "New York +6.5 may win or lose by 6 or fewer",
            displayLine: "New York +6.5",
            americanOdds: -105,
            selectedSide: "AWAY",
            lineMilli: 6_500,
          },
          {
            id: "demo-chi-spread",
            eventId: "demo-nyg-chi",
            eventLabel: "New York at Chicago",
            marketType: "SPREAD",
            proposition: "Chicago −6.5 must win by 7 or more",
            displayLine: "Chicago −6.5",
            americanOdds: -115,
            selectedSide: "HOME",
            lineMilli: -6_500,
          },
        ],
      },
      {
        label: "Total",
        marketType: "TOTAL",
        opportunities: [
          {
            id: "demo-nyg-chi-over",
            eventId: "demo-nyg-chi",
            eventLabel: "New York at Chicago",
            marketType: "TOTAL",
            proposition: "New York and Chicago combine for over 42.5",
            displayLine: "Over 42.5",
            americanOdds: -110,
            selectedSide: "OVER",
            lineMilli: 42_500,
          },
          {
            id: "demo-nyg-chi-under",
            eventId: "demo-nyg-chi",
            eventLabel: "New York at Chicago",
            marketType: "TOTAL",
            proposition: "New York and Chicago combine for under 42.5",
            displayLine: "Under 42.5",
            americanOdds: -110,
            selectedSide: "UNDER",
            lineMilli: 42_500,
          },
        ],
      },
    ],
  },
];

export const interactiveDemoResults: Record<string, EventResult> = {
  "demo-phi-dal": {
    eventId: "demo-phi-dal",
    status: "FINAL",
    awayScore: 27,
    homeScore: 24,
  },
  "demo-buf-kc": {
    eventId: "demo-buf-kc",
    status: "FINAL",
    awayScore: 24,
    homeScore: 30,
  },
  "demo-nyg-chi": {
    eventId: "demo-nyg-chi",
    status: "FINAL",
    awayScore: 17,
    homeScore: 21,
  },
};

export const interactiveDemoOpponentPositions: InteractiveDemoPosition[] = [
  {
    id: "demo-opponent-receipt-1",
    opportunityId: "demo-phi-spread",
    stakeCredits: 250,
  },
  {
    id: "demo-opponent-receipt-2",
    opportunityId: "demo-kc-ml",
    stakeCredits: 500,
  },
  {
    id: "demo-opponent-receipt-3",
    opportunityId: "demo-nyg-chi-over",
    stakeCredits: 250,
  },
];

export const interactiveDemoEligibleOpportunities = interactiveDemoEvents
  .flatMap((event) => event.markets)
  .map((market) => {
    const opportunity =
      market.opportunities.find(
        (candidate) =>
          maximumStakeForOdds(
            candidate.americanOdds,
            simulationSeason1Ruleset,
          ) === simulationSeason1Ruleset.card.weeklyAllocationCredits,
      ) ?? market.opportunities[0];
    return {
      eventId: opportunity.eventId,
      marketType: opportunity.marketType,
      americanOdds: opportunity.americanOdds,
    };
  });

export function getInteractiveDemoOpportunity(
  opportunityId: string,
): InteractiveDemoOpportunity | null {
  return (
    interactiveDemoEvents
      .flatMap((event) => event.markets)
      .flatMap((market) => market.opportunities)
      .find((opportunity) => opportunity.id === opportunityId) ?? null
  );
}

export function toInteractiveDemoReceipt(
  position: InteractiveDemoPosition,
): PositionReceipt {
  const opportunity = getInteractiveDemoOpportunity(position.opportunityId);
  if (!opportunity) throw new Error("The demo opportunity does not exist.");

  switch (opportunity.marketType) {
    case "MONEYLINE":
      return {
        id: position.id,
        eventId: opportunity.eventId,
        marketType: opportunity.marketType,
        selectedSide: opportunity.selectedSide,
        americanOdds: opportunity.americanOdds,
        stakeCredits: position.stakeCredits,
      };
    case "SPREAD":
      return {
        id: position.id,
        eventId: opportunity.eventId,
        marketType: opportunity.marketType,
        selectedSide: opportunity.selectedSide,
        lineMilli: opportunity.lineMilli,
        americanOdds: opportunity.americanOdds,
        stakeCredits: position.stakeCredits,
      };
    case "TOTAL":
      return {
        id: position.id,
        eventId: opportunity.eventId,
        marketType: opportunity.marketType,
        selectedSide: opportunity.selectedSide,
        lineMilli: opportunity.lineMilli,
        americanOdds: opportunity.americanOdds,
        stakeCredits: position.stakeCredits,
      };
  }
}

export function settleInteractiveDemoPositions(
  positions: readonly InteractiveDemoPosition[],
): SettledInteractiveDemoPosition[] {
  return positions.map((position) => {
    const opportunity = getInteractiveDemoOpportunity(position.opportunityId);
    if (!opportunity) throw new Error("The demo opportunity does not exist.");
    const result = interactiveDemoResults[opportunity.eventId];
    if (!result) throw new Error("The demo event result does not exist.");
    return {
      ...position,
      opportunity,
      settlement: settleReceipt(toInteractiveDemoReceipt(position), result),
    };
  });
}
