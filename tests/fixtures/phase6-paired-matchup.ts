import type { LiveWeekOperations } from "@/application/queries/get-live-week-operations";
import {
  projectPairedMatchup,
  type PairedMatchupDto,
  type PairedMatchupPhase,
} from "@/application/queries/project-paired-matchup";
import type { Stage1StateDto } from "@/application/queries/stage1-dtos";

export const unrevealableReceiptText = "SECRET FUTURE OPPONENT PICK";

const ids = {
  league: "00000000-0000-4000-8000-000000000001",
  season: "00000000-0000-4000-8000-000000000002",
  ruleset: "00000000-0000-4000-8000-000000000003",
  week: "00000000-0000-4000-8000-000000000004",
  matchup: "00000000-0000-4000-8000-000000000005",
  selfUser: "00000000-0000-4000-8000-000000000006",
  selfEntry: "00000000-0000-4000-8000-000000000007",
  opponentUser: "00000000-0000-4000-8000-000000000008",
  opponentEntry: "00000000-0000-4000-8000-000000000009",
  selfCard: "00000000-0000-4000-8000-000000000010",
  eventOne: "00000000-0000-4000-8000-000000000011",
  eventTwo: "00000000-0000-4000-8000-000000000012",
  selfOne: "00000000-0000-4000-8000-000000000013",
  selfTwo: "00000000-0000-4000-8000-000000000014",
  opponentOne: "00000000-0000-4000-8000-000000000015",
  opponentTwo: "00000000-0000-4000-8000-000000000016",
  resultOne: "00000000-0000-4000-8000-000000000017",
  resultTwo: "00000000-0000-4000-8000-000000000018",
};

type FixtureVariant = PairedMatchupPhase;

const revealedStates = new Set<FixtureVariant>([
  "PARTIAL_REVEAL",
  "LIVE",
  "PROVISIONAL",
  "FINAL",
  "CORRECTED",
]);
const completedStates = new Set<FixtureVariant>([
  "PROVISIONAL",
  "FINAL",
  "CORRECTED",
]);

function settlement(outcome: "WIN" | "LOSS", returnedCenticredits: number) {
  return { outcome, returnedCenticredits } as const;
}

export function makePhase6State(variant: FixtureVariant): {
  now: Date;
  operations: LiveWeekOperations;
  state: Stage1StateDto;
} {
  const complete = completedStates.has(variant);
  const eventOneState =
    variant === "LIVE"
      ? ("LIVE" as const)
      : variant === "CORRECTED"
        ? ("CORRECTED" as const)
        : variant === "PARTIAL_REVEAL" || complete
          ? ("FINAL" as const)
          : ("SCHEDULED" as const);
  const eventTwoState = complete ? ("FINAL" as const) : ("SCHEDULED" as const);
  const weekState =
    variant === "PREGAME"
      ? ("OPEN" as const)
      : variant === "PROVISIONAL"
        ? ("PROVISIONAL" as const)
        : variant === "FINAL" || variant === "CORRECTED"
          ? ("FINAL" as const)
          : ("LOCKED" as const);
  const eventOneSettled =
    eventOneState === "FINAL" || eventOneState === "CORRECTED";
  const now = new Date(
    variant === "DELAYED"
      ? "2026-09-13T18:30:00.000Z"
      : variant === "PREGAME" || variant === "LOCKED"
        ? "2026-09-13T16:30:00.000Z"
        : "2026-09-13T19:00:00.000Z",
  );

  const ownerPositions: NonNullable<Stage1StateDto["ownerCard"]>["positions"] =
    [
      {
        id: ids.selfOne,
        eventId: ids.eventOne,
        eventKey: "harbor-lake",
        eventLabel: "Harbor Club at Lake Club",
        scheduledStartAt: "2026-09-13T18:00:00.000Z",
        marketType: "MONEYLINE",
        outcomeKey: "AWAY",
        proposition: "Harbor Club",
        lineMilli: null,
        americanOdds: 100,
        stakeCredits: 100,
        quoteObservedAt: "2026-09-08T14:00:00.000Z",
        acceptedAt: "2026-09-13T16:00:00.000Z",
        receiptHash: "a".repeat(64),
        settlement: eventOneSettled ? settlement("WIN", 20_000) : null,
      },
      {
        id: ids.selfTwo,
        eventId: ids.eventTwo,
        eventKey: "river-capital",
        eventLabel: "River Club at Capital Club",
        scheduledStartAt: "2026-09-13T21:00:00.000Z",
        marketType: "TOTAL",
        outcomeKey: "OVER",
        proposition: "Over 42.5",
        lineMilli: 42_500,
        americanOdds: -100,
        stakeCredits: 100,
        quoteObservedAt: "2026-09-08T14:00:00.000Z",
        acceptedAt: "2026-09-13T16:00:01.000Z",
        receiptHash: "b".repeat(64),
        settlement: complete ? settlement("WIN", 20_000) : null,
      },
    ];
  const opponentPositions: NonNullable<
    Stage1StateDto["matchup"]
  >["opponentRevealedPositions"] = [];

  if (revealedStates.has(variant)) {
    opponentPositions.push({
      id: ids.opponentOne,
      eventId: ids.eventOne,
      eventLabel: "Harbor Club at Lake Club",
      marketType: "SPREAD",
      proposition: "Lake Club +2.5",
      americanOdds: -110,
      stakeCredits: 100,
      settlement: eventOneSettled ? settlement("LOSS", 0) : null,
    });
  }
  if (complete) {
    opponentPositions.push({
      id: ids.opponentTwo,
      eventId: ids.eventTwo,
      eventLabel: "River Club at Capital Club",
      marketType: "MONEYLINE",
      proposition: "Capital Club",
      americanOdds: 100,
      stakeCredits: 100,
      settlement: settlement("WIN", 20_000),
    });
  }

  const officialResult = complete
    ? {
        selfDecision: "WIN" as const,
        opponentDecision: "LOSS" as const,
        selfPointsForCenticredits: 40_000,
        opponentPointsForCenticredits: 20_000,
        status:
          variant === "PROVISIONAL"
            ? ("PROVISIONAL" as const)
            : ("FINAL" as const),
      }
    : null;

  const state: Stage1StateDto = {
    league: {
      id: ids.league,
      name: "Sunday Friends",
      slug: "sunday-friends",
      role: "MEMBER",
      mode: "LIVE",
      nflYear: 2026,
      lifecycle: "REGULAR",
      memberCount: 4,
    },
    season: {
      id: ids.season,
      scheduleSeed: "phase-6-fixture",
      rosterLockedAt: "2026-09-01T14:00:00.000Z",
      simulatedNow: null,
      rulesetSnapshotId: ids.ruleset,
    },
    viewer: {
      userId: ids.selfUser,
      entryId: ids.selfEntry,
      displayName: "Alex Ledger",
      avatarUrl: null,
    },
    members: [
      {
        userId: ids.selfUser,
        entryId: ids.selfEntry,
        displayName: "Alex Ledger",
        role: "MEMBER",
        joinedAt: "2026-08-20T14:00:00.000Z",
      },
      {
        userId: ids.opponentUser,
        entryId: ids.opponentEntry,
        displayName: "Jordan Rival",
        role: "MEMBER",
        joinedAt: "2026-08-20T14:00:00.000Z",
      },
    ],
    week: {
      id: ids.week,
      nflWeek: 1,
      scope: "REGULAR",
      state: weekState,
      opensAt: "2026-09-08T10:00:00.000Z",
      commonLockAt: "2026-09-13T17:55:00.000Z",
      lockedAt: weekState === "OPEN" ? null : "2026-09-13T17:55:00.000Z",
      correctionWindowClosesAt: "2026-09-16T16:00:00.000Z",
    },
    schedule: [
      {
        id: ids.matchup,
        displayOrder: 1,
        scope: "REGULAR",
        sideAEntryId: ids.selfEntry,
        sideAName: "Alex Ledger",
        sideBEntryId: ids.opponentEntry,
        sideBName: "Jordan Rival",
        result: officialResult
          ? {
              sideADecision: officialResult.selfDecision,
              sideBDecision: officialResult.opponentDecision,
              sideAPointsForCenticredits:
                officialResult.selfPointsForCenticredits,
              sideBPointsForCenticredits:
                officialResult.opponentPointsForCenticredits,
              status: officialResult.status,
            }
          : null,
      },
    ],
    slate: [
      {
        id: ids.eventOne,
        key: "harbor-lake",
        awayTeam: "Harbor Club",
        homeTeam: "Lake Club",
        scheduledStartAt: "2026-09-13T18:00:00.000Z",
        actualStartedAt:
          eventOneState === "SCHEDULED" ? null : "2026-09-13T18:03:00.000Z",
        state: eventOneState,
        providerHealth: "HEALTHY",
        markets: [],
      },
      {
        id: ids.eventTwo,
        key: "river-capital",
        awayTeam: "River Club",
        homeTeam: "Capital Club",
        scheduledStartAt: "2026-09-13T21:00:00.000Z",
        actualStartedAt: complete ? "2026-09-13T21:02:00.000Z" : null,
        state: eventTwoState,
        providerHealth: "HEALTHY",
        markets: [],
      },
    ],
    ownerCard: {
      id: ids.selfCard,
      entryId: ids.selfEntry,
      grantedCredits: 1000,
      grantedAt: "2026-09-08T10:00:00.000Z",
      compliance: "COMPLIANT",
      lockedAt: "2026-09-13T16:00:02.000Z",
      allocatedCredits: 1000,
      remainingCredits: 0,
      positions: ownerPositions,
    },
    matchup: {
      id: ids.matchup,
      selfEntryId: ids.selfEntry,
      opponentEntryId: ids.opponentEntry,
      opponentName: "Jordan Rival",
      opponentReadiness: weekState === "OPEN" ? null : "COMPLIANT",
      opponentRevealedPositions: opponentPositions,
      futureSealed: !complete,
      result: officialResult,
    },
    standings: [
      {
        seed: 1,
        entryId: ids.selfEntry,
        displayName: "Alex Ledger",
        wins: 2,
        losses: 0,
        ties: 0,
        pointsForCenticredits: 50_000,
        allPlayHalfWinUnits: 6,
        allPlayComparisonCount: 3,
        attendanceMisses: 0,
        highestWeekCenticredits: 30_000,
        deterministicTiebreak: "self",
      },
      {
        seed: 2,
        entryId: ids.opponentEntry,
        displayName: "Jordan Rival",
        wins: 1,
        losses: 1,
        ties: 0,
        pointsForCenticredits: 40_000,
        allPlayHalfWinUnits: 4,
        allPlayComparisonCount: 3,
        attendanceMisses: 0,
        highestWeekCenticredits: 25_000,
        deterministicTiebreak: "opponent",
      },
    ],
    commissioner: {
      isCommissioner: false,
      readyCount: null,
      cardCount: 4,
      correctionCount: variant === "CORRECTED" ? 1 : 0,
    },
  };

  const resultForEvent = (
    resultId: string,
    eventState: Stage1StateDto["slate"][number]["state"],
  ) =>
    eventState === "FINAL" || eventState === "CORRECTED"
      ? {
          id: resultId,
          version: eventState === "CORRECTED" ? 2 : 1,
          status: "FINAL" as const,
          awayScore: 24,
          homeScore: 20,
          source: "THE_ODDS_API" as const,
          reason: "Official stored result",
          recordedAt: "2026-09-13T22:00:00.000Z",
        }
      : null;

  const operations: LiveWeekOperations = {
    weekState,
    correctionWindowClosesAt: "2026-09-16T16:00:00.000Z",
    latestImportAt:
      variant === "PREGAME" || variant === "LOCKED" ? null : now.toISOString(),
    events: state.slate.map((event, index) => ({
      id: event.id,
      externalEventId: event.key,
      awayTeam: event.awayTeam,
      homeTeam: event.homeTeam,
      scheduledStartAt: event.scheduledStartAt,
      state: event.state,
      canVoidAfterPostponement: false,
      correctionCount:
        variant === "CORRECTED" && event.id === ids.eventOne ? 1 : 0,
      result: resultForEvent(
        index === 0 ? ids.resultOne : ids.resultTwo,
        event.state,
      ),
    })),
  };

  return { now, operations, state };
}

export function makePhase6Matchup(variant: FixtureVariant): PairedMatchupDto {
  const { now, operations, state } = makePhase6State(variant);
  const matchup = projectPairedMatchup(state, operations, now);
  if (!matchup) throw new Error("Phase 6 fixture must project a matchup.");
  return matchup;
}

export function makePhase6LiveUpdate(): PairedMatchupDto {
  const { operations, state } = makePhase6State("FINAL");
  if (!state.week || !state.matchup || !state.ownerCard) {
    throw new Error("Phase 6 fixture must contain a paired card.");
  }

  state.week.state = "LOCKED";
  state.matchup.result = null;
  state.schedule[0].result = null;
  state.slate[1].state = "LIVE";
  state.slate[1].actualStartedAt = "2026-09-13T21:02:00.000Z";
  state.ownerCard.positions[1].settlement = null;
  state.matchup.opponentRevealedPositions[1].settlement = null;
  state.matchup.futureSealed = false;
  operations.weekState = "LOCKED";
  operations.events[1].state = "LIVE";
  operations.events[1].result = null;

  const matchup = projectPairedMatchup(
    state,
    operations,
    new Date("2026-09-13T21:30:00.000Z"),
  );
  if (!matchup) throw new Error("Live update fixture must project a matchup.");
  return matchup;
}
