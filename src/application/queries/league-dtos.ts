export type MemberSummaryDto = {
  id: string;
  displayName: string;
  initials: string;
  record: string;
  seed: number;
};

export type MatchupHomeDto = {
  league: {
    name: string;
    slug: string;
    seasonLabel: string;
    mode: "SIMULATION";
    week: number;
    weekState: "CARDS_OPEN" | "LOCKED" | "LIVE" | "FINAL";
    commonLockLabel: string;
  };
  self: MemberSummaryDto;
  opponent: MemberSummaryDto;
  rivalryLabel: string;
  allocation: {
    allocatedCredits: number;
    remainingCredits: number;
    positionCount: number;
    maximumPositions: number;
    weeklyAllocationCredits: number;
  };
  consequence: {
    record: string;
    playoff: string;
    context: string;
  };
  nextKickoff: {
    id: string;
    awayTeam: string;
    homeTeam: string;
    kickoffLabel: string;
    updateLabel: string;
    existingPositionLabel: string | null;
  };
  leagueMatchups: {
    id: string;
    sideA: string;
    sideB: string;
    status: string;
    isViewerMatchup: boolean;
  }[];
};

export type SlateOutcomeDto = {
  id: string;
  proposition: string;
  displayLine: string;
  americanOdds: number;
  maximumStakeCredits: number;
};

export type SlateGameDto = {
  id: string;
  awayTeam: string;
  homeTeam: string;
  kickoffWindow: "SUN_EARLY" | "SUN_LATE" | "SUN_NIGHT" | "MON_NIGHT";
  kickoffLabel: string;
  updateLabel: string;
  markets: {
    label: "Winner" | "Spread" | "Total";
    outcomes: SlateOutcomeDto[];
  }[];
};

export type StandingDto = {
  id: string;
  seed: number;
  memberName: string;
  initials: string;
  record: string;
  pointsFor: string;
  allPlay: string;
  misses: number;
  movement: string;
  state: string | null;
  isViewer: boolean;
};

export type CardPositionDto = {
  id: string;
  eventId: string;
  eventLabel: string;
  kickoffLabel: string;
  marketLabel: "Winner" | "Spread" | "Total";
  displayLine: string;
  proposition: string;
  americanOdds: number;
  stakeCredits: number;
  maximumReturnLabel: string;
  acceptedAtLabel: string;
  quoteAtLabel: string;
  status: "SEALED";
  receiptHash: string;
};

export type LeagueScoreboardDto = {
  id: string;
  sideA: { name: string; record: string; cardState: string };
  sideB: { name: string; record: string; cardState: string };
  isViewerMatchup: boolean;
};

export type HistoryMeetingDto = {
  week: number;
  scope: "Regular season";
  opponent: string;
  viewerScore: string;
  opponentScore: string;
  result: "W" | "L" | "T";
  note: string;
};
