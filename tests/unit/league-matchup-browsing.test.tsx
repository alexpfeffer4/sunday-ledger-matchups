// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { projectPairedMatchup } from "@/application/queries/project-paired-matchup";
import { projectLeagueMatchup } from "@/application/queries/project-league-matchup";
import type { LeagueMatchupCards } from "@/application/queries/league-matchup-dtos";
import { PairedMatchupView } from "@/components/matchup/paired-matchup-view";
import { makePhase6State } from "../fixtures/phase6-paired-matchup";
afterEach(cleanup);
function fixture(
  phase: "PREGAME" | "PARTIAL_REVEAL" | "FINAL" = "PARTIAL_REVEAL",
) {
  const { state, operations, now } = makePhase6State(phase);
  const game = {
    ...state.schedule[0]!,
    id: "10000000-0000-4000-8000-000000000001",
    sideAEntryId: "10000000-0000-4000-8000-000000000002",
    sideBEntryId: "10000000-0000-4000-8000-000000000003",
    sideAName: "Soup",
    sideBName: "Lee",
    result: null,
  };
  state.schedule.push(game);
  const cards: LeagueMatchupCards = {
    weekId: state.week!.id,
    cards: [
      {
        entryId: game.sideAEntryId,
        readiness: phase === "PREGAME" ? null : "COMPLIANT",
        scoreCenticredits: phase === "PREGAME" ? null : 20000,
        positions:
          phase === "PREGAME"
            ? []
            : [
                {
                  ...state.matchup!.opponentRevealedPositions[0]!,
                  proposition: "REVEALED SOUP PICK",
                },
              ],
      },
      {
        entryId: game.sideBEntryId,
        readiness: phase === "PREGAME" ? null : "INCOMPLETE",
        scoreCenticredits: phase === "PREGAME" ? null : 0,
        positions: [],
      },
    ],
  };
  const base = projectPairedMatchup(state, operations, now, new Map(), cards)!;
  return { state, cards, base, game };
}
describe("league matchup browsing", () => {
  it("makes other pairs accessible and supplies real zero and settled scores", () => {
    const { state, cards, base, game } = fixture();
    expect(base.scoreboard.find((row) => row.id === game.id)).toMatchObject({
      sideAScoreCenticredits: 20000,
      sideBScoreCenticredits: 0,
      href: `/l/${state.league.slug}/matchup?matchup=${game.id}`,
    });
    render(<PairedMatchupView matchup={base} refreshControl={null} />);
    expect(
      screen.getByRole("link", { name: "View Soup versus Lee" }),
    ).toHaveAttribute(
      "href",
      `/l/${state.league.slug}/matchup?matchup=${game.id}`,
    );
    cleanup();
    const selected = projectLeagueMatchup(state, base, cards, game.id)!;
    render(<PairedMatchupView matchup={selected} refreshControl={null} />);
    const header = screen.getByRole("region", { name: "Soup versus Lee" });
    expect(within(header).queryByText("You")).toBeNull();
    expect(within(header).getByText("Incomplete")).toBeVisible();
    expect(screen.getByText("REVEALED SOUP PICK")).toBeVisible();
    expect(
      screen.queryByText(state.ownerCard!.positions[1]!.proposition),
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: "Back to your matchup" }),
    ).toHaveAttribute("href", `/l/${state.league.slug}/matchup`);
    expect(selected.scorePath.sentence).toBeNull();
    expect(selected.futureSealed).toBe(true);
  });
  it("allows pregame browsing without submission flags, draft progress or picks", () => {
    const { state, cards, base, game } = fixture("PREGAME");
    const selected = projectLeagueMatchup(state, base, cards, game.id)!;
    render(<PairedMatchupView matchup={selected} refreshControl={null} />);
    expect(
      screen.getByRole("region", { name: "Soup versus Lee" }),
    ).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Picks by game" })).toBeNull();
    expect(screen.queryByText("Status unavailable")).toBeNull();
    expect(selected.self.scoreCenticredits).toBeNull();
    expect(Object.values(selected.rows).flat()).toEqual([]);
  });
  it("rejects unknown matchups and stale week data", () => {
    const { state, cards, base, game } = fixture();
    expect(projectLeagueMatchup(state, base, cards, "unknown")).toBeNull();
    expect(
      projectLeagueMatchup(
        state,
        base,
        { ...cards, weekId: "another-week" },
        game.id,
      ),
    ).toBeNull();
    expect(projectLeagueMatchup(state, base, null, game.id)).toBeNull();
  });
  it("describes the actual winner without claiming the spectator won", () => {
    const { state, cards, base, game } = fixture("FINAL");
    state.schedule[state.schedule.length - 1]!.result = {
      sideADecision: "LOSS",
      sideBDecision: "WIN",
      sideAPointsForCenticredits: 0,
      sideBPointsForCenticredits: 10000,
      status: "FINAL",
    };
    const selected = projectLeagueMatchup(state, base, cards, game.id)!;
    render(<PairedMatchupView matchup={selected} refreshControl={null} />);
    expect(screen.getByRole("heading", { name: "Lee won" })).toBeVisible();
    expect(screen.queryByText(/You won|You lost/)).toBeNull();
    expect(selected.opponent.scoreCenticredits).toBe(10000);
  });
});
