// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { projectPairedMatchup } from "@/application/queries/project-paired-matchup";
import { projectLeagueMatchup } from "@/application/queries/project-league-matchup";
import {
  leagueMatchupCardsSchema,
  type LeagueMatchupCards,
} from "@/application/queries/league-matchup-dtos";
import { stage1StateSchema } from "@/application/queries/stage1-dtos";
import { PairedMatchupView } from "@/components/matchup/paired-matchup-view";
import { CommissionerCardStatusPanel } from "@/components/commissioner/card-status";
import { timedCommissionerAction } from "@/application/queries/commissioner-next-action";
import { makePhase6State } from "../fixtures/phase6-paired-matchup";

vi.mock("server-only", () => ({}));
afterEach(cleanup);

function fixture(phase: "PREGAME" | "PARTIAL_REVEAL" | "FINAL" = "PREGAME") {
  const { state, operations, now } = makePhase6State(phase);
  state.week!.rollingSubmissionsEnabled = true;
  state.week!.entryClosed = phase === "FINAL";
  state.week!.entryClosesAt = "2026-09-13T21:00:00.000Z";
  state.ownerCard!.rollingSubmissionsEnabled = true;
  state.ownerCard!.allocatedCredits = 200;
  state.ownerCard!.remainingCredits = 800;
  state.ownerCard!.canSubmit = phase !== "FINAL";
  state.matchup!.opponentSubmitted = true;
  const games = state.slate.map((event) => ({
    eventId: event.id,
    eventLabel: `${event.awayTeam} at ${event.homeTeam}`,
    scheduledStartAt: event.scheduledStartAt,
  }));
  state.matchup!.opponentSelectedGames = games;
  const cards: LeagueMatchupCards = {
    weekId: state.week!.id,
    cards: [state.viewer.entryId, state.matchup!.opponentEntryId].map(
      (entryId) => ({
        entryId,
        readiness: phase === "PREGAME" ? null : "COMPLIANT",
        submitted: true,
        positions: [],
        selectedGames: games,
        scoreCenticredits: phase === "PREGAME" ? null : 0,
        outstanding:
          phase === "PREGAME"
            ? null
            : {
                picks: phase === "FINAL" ? 0 : 1,
                credits: phase === "FINAL" ? 0 : 100,
              },
        availableCredits:
          phase === "PREGAME" ? null : phase === "FINAL" ? 0 : 800,
        expiredCredits:
          phase === "PREGAME" ? null : phase === "FINAL" ? 800 : 0,
        canSubmit: phase === "PREGAME" ? null : phase !== "FINAL",
      }),
    ),
  };
  return {
    state,
    operations,
    now,
    cards,
    project: () =>
      projectPairedMatchup(state, operations, now, new Map(), cards)!,
  };
}

describe("rolling submission matchup presentation", () => {
  it("shows each selected game once immediately without any per-game bet metadata", () => {
    const f = fixture();
    const hidden = f.cards.cards[1]!;
    hidden.selectedGames!.push({ ...hidden.selectedGames![0]! });
    const projected = f.project();
    render(<PairedMatchupView matchup={projected} refreshControl={null} />);
    const opponentGames = screen.getByRole("region", {
      name: "Jordan Rival selected games",
    });
    expect(within(opponentGames).getAllByRole("listitem")).toHaveLength(2);
    expect(
      within(opponentGames).getAllByText("Harbor Club at Lake Club"),
    ).toHaveLength(1);
    expect(opponentGames).not.toHaveTextContent(
      /credits|MONEYLINE|SPREAD|TOTAL|3 bets|[+]100/,
    );
    expect(projected.opponent.outstanding).toBeNull();
    expect(projected.opponent.availableCredits).toBeNull();
    expect(screen.queryByLabelText("Jordan Rival unused credits")).toBeNull();
    expect(
      screen.getByLabelText("Alex Ledger unused credits"),
    ).toHaveTextContent("800 credits available to bet");
    expect(screen.getByLabelText("Jordan Rival card status")).toHaveTextContent(
      "Submitted",
    );
  });

  it("does not infer a selected game from drafts, general slate or a missing old-server field", () => {
    const f = fixture();
    f.state.ownerCard!.positions = [];
    f.state.matchup!.opponentSelectedGames = [];
    f.cards.cards.forEach((card) => {
      card.selectedGames = [];
      card.submitted = false;
    });
    const projected = f.project();
    expect(projected.self.selectedGames).toEqual([]);
    expect(projected.opponent.selectedGames).toEqual([]);
    render(<PairedMatchupView matchup={projected} refreshControl={null} />);
    expect(
      screen.queryByRole("heading", { name: "Games selected" }),
    ).toBeNull();
  });

  it("strips extra hidden fields from selected-game DTOs", () => {
    const f = fixture();
    const source = {
      ...f.cards,
      cards: f.cards.cards.map((card) => ({
        ...card,
        selectedGames: card.selectedGames!.map((game) => ({
          ...game,
          picks: 3,
          credits: 750,
          marketType: "TOTAL",
          proposition: "SECRET OVER",
          receiptHash: "SECRET HASH",
        })),
      })),
    };
    const parsed = leagueMatchupCardsSchema.parse(source);
    expect(Object.keys(parsed.cards[0]!.selectedGames![0]!)).toEqual([
      "eventId",
      "eventLabel",
      "scheduledStartAt",
    ]);
    expect(JSON.stringify(parsed)).not.toContain("SECRET");
    expect(
      stage1StateSchema.parse({
        ...f.state,
        matchup: {
          ...f.state.matchup,
          opponentSelectedGames: source.cards[0]!.selectedGames,
        },
      }).matchup!.opponentSelectedGames![0],
    ).not.toHaveProperty("credits");
  });

  it("keeps games anonymous at scheduled cutoff until actual start is confirmed", () => {
    const f = fixture();
    const projected = projectPairedMatchup(
      f.state,
      null,
      new Date("2026-09-13T18:30:00Z"),
      new Map(),
      f.cards,
    )!;
    expect(projected.opponent.selectedGames).toHaveLength(2);
    expect(
      Object.values(projected.rows)
        .flat()
        .filter((row) => row.side === "OPPONENT"),
    ).toHaveLength(0);
  });

  it("replaces game preview with actual authorized bets after confirmed kickoff", () => {
    const f = fixture("PARTIAL_REVEAL");
    const projected = f.project();
    expect(projected.opponent.selectedGames).toEqual([
      f.state.matchup!.opponentSelectedGames![1],
    ]);
    expect(
      projected.rows.SETTLED.some(
        (row) => row.proposition === "Lake Club +2.5",
      ),
    ).toBe(true);
    render(<PairedMatchupView matchup={projected} refreshControl={null} />);
    expect(screen.getByText("Lake Club +2.5")).toBeVisible();
    expect(
      screen.getByLabelText("Jordan Rival outstanding picks and credits"),
    ).toHaveTextContent("100 credits outstanding");
    expect(
      screen.getByLabelText("Jordan Rival unused credits"),
    ).toHaveTextContent("800 credits available to bet");
    expect(screen.getByText("More bets can still be submitted")).toBeVisible();
    expect(screen.queryByText(/clinched|remaining upside/)).toBeNull();
  });

  it("suppresses a stale result while either member can submit later bets", () => {
    const f = fixture("FINAL");
    f.state.week!.entryClosed = false;
    f.state.ownerCard!.canSubmit = true;
    f.cards.cards[0]!.canSubmit = true;
    const projected = f.project();
    expect(projected.self.decision).toBeNull();
    expect(projected.resultStatus).toBeNull();
    expect(projected.scorePath.furtherSubmissionsPossible).toBe(true);
    render(<PairedMatchupView matchup={projected} refreshControl={null} />);
    expect(screen.queryByRole("heading", { name: "You won" })).toBeNull();
    expect(screen.getByText("More bets can still be submitted")).toBeVisible();
  });

  it("shows unused allocation as expired alongside normal partial-card final scores", () => {
    const f = fixture("FINAL");
    const projected = f.project();
    expect(projected.self.scoreCenticredits).toBe(40000);
    expect(projected.self.cardStatus).toBe("Submitted");
    render(<PairedMatchupView matchup={projected} refreshControl={null} />);
    expect(screen.getByRole("heading", { name: "You won" })).toBeVisible();
    expect(
      screen.getByLabelText("Alex Ledger unused credits"),
    ).toHaveTextContent("800 credits expired");
    expect(
      screen.getByLabelText("Jordan Rival unused credits"),
    ).toHaveTextContent("800 credits expired");
  });

  it("never marks an absent member incomplete before weekly entry closes", () => {
    const f = fixture("PARTIAL_REVEAL");
    f.state.matchup!.opponentSubmitted = false;
    f.state.matchup!.opponentReadiness = "PENDING";
    f.state.matchup!.opponentSelectedGames = [];
    f.cards.cards[1]!.selectedGames = [];
    f.cards.cards[1]!.submitted = false;
    expect(f.project().opponent.cardStatus).toBe("Not submitted");
    f.state.week!.entryClosed = true;
    expect(f.project().opponent.cardStatus).toBe("No bets submitted");
  });

  it("uses only the selected pairing's neutral games when browsing other league members", () => {
    const f = fixture();
    const game = {
      ...f.state.schedule[0]!,
      id: "10000000-0000-4000-8000-000000000004",
      sideAEntryId: "10000000-0000-4000-8000-000000000005",
      sideBEntryId: "10000000-0000-4000-8000-000000000006",
      sideAName: "Soup",
      sideBName: "Lee",
      result: null,
    };
    f.state.schedule.push(game);
    f.cards.cards.push(
      ...[game.sideAEntryId, game.sideBEntryId].map((entryId) => ({
        ...f.cards.cards[0]!,
        entryId,
        selectedGames: [f.cards.cards[0]!.selectedGames![1]!],
      })),
    );
    const projected = projectLeagueMatchup(
      f.state,
      f.project(),
      f.cards,
      game.id,
    )!;
    render(<PairedMatchupView matchup={projected} refreshControl={null} />);
    expect(
      screen.getByRole("region", { name: "Soup selected games" }),
    ).toHaveTextContent("River Club at Capital Club");
    expect(
      screen.queryByRole("region", { name: "Alex Ledger selected games" }),
    ).toBeNull();
    expect(projected.self.availableCredits).toBeNull();
    expect(projected.opponent.availableCredits).toBeNull();
    expect(Object.values(projected.rows).flat()).toEqual([]);
  });

  it("retains legacy pregame privacy and accepts an old payload with absent optional fields", () => {
    const { state, now } = makePhase6State("PREGAME");
    const projected = projectPairedMatchup(
      stage1StateSchema.parse(state),
      null,
      now,
    )!;
    expect(projected.opponent.selectedGames).toBeUndefined();
    expect(projected.opponent.cardStatus).toBe("Sealed");
  });

  it("uses simple commissioner submission status and removes the common-lock instruction", () => {
    const f = fixture("PARTIAL_REVEAL");
    render(
      <CommissionerCardStatusPanel
        status={{
          weekId: f.state.week!.id,
          nflWeek: 1,
          rollingSubmissionsEnabled: true,
          cards: [
            {
              entryId: f.state.viewer.entryId,
              displayName: "Alex",
              sealed: true,
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("1 of 1 members submitted bets")).toBeVisible();
    expect(screen.getByText("Alex").closest("li")).toHaveTextContent(
      "Submitted",
    );
    expect(
      timedCommissionerAction(
        { league: f.state.league, week: f.state.week, slate: [], members: [] },
        f.operations,
        f.now,
      )?.title,
    ).toBe("Betting continues game by game");
  });
});
