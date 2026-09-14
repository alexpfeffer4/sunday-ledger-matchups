// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { projectPairedMatchup } from "@/application/queries/project-paired-matchup";
import { projectLeagueMatchup } from "@/application/queries/project-league-matchup";
import type { LeagueMatchupCards } from "@/application/queries/league-matchup-dtos";
import { PairedMatchupView } from "@/components/matchup/paired-matchup-view";
import { Stage1LiveView } from "@/components/stage1/live-views";
import { makePhase6State } from "../fixtures/phase6-paired-matchup";

vi.mock("server-only", () => ({}));
afterEach(cleanup);

function legacyFixture(phase: "PREGAME" | "PARTIAL_REVEAL" = "PREGAME") {
  const { state, operations, now } = makePhase6State(phase);
  expect(state.week!.rollingSubmissionsEnabled).toBeUndefined();
  const selectedGames = state.slate.map((event) => ({
    eventId: event.id,
    eventLabel: `${event.awayTeam} at ${event.homeTeam}`,
    scheduledStartAt: event.scheduledStartAt,
  }));
  state.matchup!.opponentSelectedGames = selectedGames;
  state.matchup!.opponentSubmitted = true;
  const cards: LeagueMatchupCards = {
    weekId: state.week!.id,
    cards: [state.viewer.entryId, state.matchup!.opponentEntryId].map(
      (entryId) => ({
        entryId,
        readiness: phase === "PREGAME" ? null : "COMPLIANT",
        scoreCenticredits: null,
        selectedGames,
        submitted: true,
        positions: [],
        outstanding: phase === "PREGAME" ? null : { picks: 2, credits: 600 },
      }),
    ),
  };
  const project = () =>
    projectPairedMatchup(state, operations, now, new Map(), cards)!;
  return { state, cards, now, project };
}

describe("immediate current-week game visibility with legacy betting rules", () => {
  it("shows distinct games before common lock without enabling rolling budget or exposing per-game details", () => {
    const f = legacyFixture();
    f.cards.cards[1]!.selectedGames!.push({
      ...f.cards.cards[1]!.selectedGames![0]!,
    });
    const matchup = f.project();
    expect(matchup.gameIdentitiesVisible).toBe(true);
    expect(matchup.week.rollingSubmissionsEnabled).toBe(false);
    expect(matchup.self.cardStatus).toBe("Sealed");
    expect(matchup.opponent.cardStatus).toBe("Sealed");
    expect(matchup.self.availableCredits).toBeUndefined();
    expect(matchup.opponent.availableCredits).toBeUndefined();
    expect(matchup.self.canSubmit).toBeUndefined();
    render(<PairedMatchupView matchup={matchup} refreshControl={null} />);
    const game = screen.getByRole("region", {
      name: "Harbor Club at Lake Club",
    });
    expect(within(game).getAllByText("Harbor Club at Lake Club")).toHaveLength(
      1,
    );
    const games = screen.getAllByLabelText(/^Jordan Rival · .*Club$/);
    expect(games).toHaveLength(2);
    for (const lane of games) {
      expect(within(lane).getAllByText("Bet placed")).toHaveLength(1);
      expect(lane).toHaveTextContent("Bets hidden until confirmed kickoff");
      expect(lane).not.toHaveTextContent(
        /credits|moneyline|spread|total|[+]100|2 bets/i,
      );
    }
    expect(
      screen.queryByLabelText("Jordan Rival outstanding picks and credits"),
    ).toBeNull();
    expect(screen.queryByLabelText("Jordan Rival unused credits")).toBeNull();
    expect(screen.queryByText("More bets can still be submitted")).toBeNull();
    expect(
      Object.values(matchup.rows)
        .flat()
        .filter((row) => row.side === "OPPONENT"),
    ).toEqual([]);
  });

  it("shows future game identity alongside revealed bets and preserves the established aggregate window", () => {
    const f = legacyFixture("PARTIAL_REVEAL");
    const matchup = f.project();
    expect(matchup.opponent.selectedGames).toEqual([
      f.cards.cards[1]!.selectedGames![1],
    ]);
    render(<PairedMatchupView matchup={matchup} refreshControl={null} />);
    expect(
      screen.getByLabelText("Jordan Rival · River Club at Capital Club"),
    ).toHaveTextContent("Bets hidden until confirmed kickoff");
    expect(screen.getByText("Lake Club +2.5")).toBeVisible();
    expect(
      screen.getByLabelText("Jordan Rival outstanding picks and credits"),
    ).toHaveTextContent("2 picks outstanding600 credits outstanding");
    expect(screen.queryByTestId("future-sealed-placeholder")).toBeNull();
    expect(screen.queryByText("More bets can still be submitted")).toBeNull();
  });

  it("keeps a current-week game's bet details hidden when scheduled kickoff passes without confirmed start", () => {
    const f = legacyFixture();
    const matchup = projectPairedMatchup(
      f.state,
      null,
      new Date("2026-09-13T18:30:00Z"),
      new Map(),
      f.cards,
    )!;
    expect(matchup.opponent.selectedGames).toHaveLength(2);
    expect(
      Object.values(matchup.rows)
        .flat()
        .filter((row) => row.side === "OPPONENT"),
    ).toHaveLength(0);
    expect(matchup.week.rollingSubmissionsEnabled).toBe(false);
  });

  it("applies the same game-only preview when browsing another current-week pairing", () => {
    const f = legacyFixture();
    const matchup = {
      ...f.state.schedule[0]!,
      id: "10000000-0000-4000-8000-000000000004",
      sideAEntryId: "10000000-0000-4000-8000-000000000005",
      sideBEntryId: "10000000-0000-4000-8000-000000000006",
      sideAName: "Soup",
      sideBName: "Lee",
      result: null,
    };
    f.state.schedule.push(matchup);
    f.cards.cards.push(
      ...[matchup.sideAEntryId, matchup.sideBEntryId].map((entryId) => ({
        ...f.cards.cards[0]!,
        entryId,
      })),
    );
    const selected = projectLeagueMatchup(
      f.state,
      f.project(),
      f.cards,
      matchup.id,
    )!;
    expect(selected.week.rollingSubmissionsEnabled).toBe(false);
    render(<PairedMatchupView matchup={selected} refreshControl={null} />);
    expect(
      screen.getByLabelText("Soup · Harbor Club at Lake Club"),
    ).toHaveTextContent("Bets hidden until confirmed kickoff");
    expect(
      screen.getByLabelText("Lee · River Club at Capital Club"),
    ).toHaveTextContent("Bets hidden until confirmed kickoff");
    expect(
      screen.queryByRole("region", { name: "Alex Ledger selected games" }),
    ).toBeNull();
    expect(Object.values(selected.rows).flat()).toEqual([]);
    expect(screen.queryByLabelText("Soup unused credits")).toBeNull();
  });

  it("updates the legacy Live fallback wording and preview without changing its rules", () => {
    const f = legacyFixture();
    render(<Stage1LiveView state={f.state} />);
    expect(
      screen.getByRole("region", { name: "Jordan Rival selected games" }),
    ).toBeVisible();
    expect(screen.queryByText("Unstarted games remain private.")).toBeNull();
    expect(screen.getByText("Cards open")).toBeVisible();
  });

  it("does not invent game identities when an older server omits the public game fields", () => {
    const { state, operations, now } = makePhase6State("PREGAME");
    const matchup = projectPairedMatchup(state, operations, now)!;
    expect(matchup.gameIdentitiesVisible).toBe(false);
    expect(matchup.opponent.selectedGames).toBeUndefined();
    render(<PairedMatchupView matchup={matchup} refreshControl={null} />);
    expect(
      screen.queryByRole("heading", { name: "Games selected" }),
    ).toBeNull();
  });
});
