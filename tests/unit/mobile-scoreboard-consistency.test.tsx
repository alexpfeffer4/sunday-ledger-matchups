// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { projectPairedMatchup } from "@/application/queries/project-paired-matchup";
import { PairedMatchupView } from "@/components/matchup/paired-matchup-view";
import {
  Stage1LeagueView,
  Stage1StandingsView,
} from "@/components/stage1/live-views";
import { makePhase6State } from "../fixtures/phase6-paired-matchup";
import { frozenCardRulesFixture } from "../fixtures/card-rules";

vi.mock("server-only", () => ({}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("score availability across member routes", () => {
  it("does not claim published results for empty standings", () => {
    const { state } = makePhase6State("PREGAME");
    state.standings = [];
    render(
      <Stage1StandingsView
        state={state}
        ruleset={{ ...frozenCardRulesFixture(), context: "SEASON" }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "No final results yet" }),
    ).toBeVisible();
    expect(screen.queryByText(/Official through|latest final/)).toBeNull();
    expect(
      screen.getByRole("link", { name: "View current matchups" }),
    ).toHaveAttribute("href", `/l/${state.league.slug}/league`);
    expect(
      screen.getByText("How ties are ordered").closest("details"),
    ).not.toHaveAttribute("open");
  });
  it.each([
    "PREGAME",
    "LOCKED",
    "DELAYED",
    "PARTIAL_REVEAL",
    "PROVISIONAL",
    "FINAL",
  ] as const)("keeps the same scoreboard in %s", (phase) => {
    const { state, operations, now } = makePhase6State(phase);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const matchup = projectPairedMatchup(state, operations, now)!;
    const view = render(
      <PairedMatchupView matchup={matchup} refreshControl={null} />,
    );
    const expected = screen.getByRole("region", {
      name: /scoreboard/,
    }).textContent;
    view.rerender(<Stage1LeagueView state={state} operations={operations} />);
    const actual = screen.getByRole("region", { name: /scoreboard/ });
    // The Matchup route alone adds an overview link after the shared scores.
    expect(expected).toBe(`${actual.textContent}Open League Overview`);
    const own = actual.querySelector('[aria-current="true"]') as HTMLElement;
    if (["PREGAME", "LOCKED", "DELAYED"].includes(phase)) {
      expect(within(own).getAllByText("—", { exact: true })).toHaveLength(2);
      expect(within(own).queryByText("0.00")).toBeNull();
    } else if (phase === "PARTIAL_REVEAL") {
      expect(within(own).getByText("0.00", { exact: true })).toBeVisible();
      expect(within(own).getByText("200.00", { exact: true })).toBeVisible();
    }
  });
});
