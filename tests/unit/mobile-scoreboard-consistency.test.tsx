// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { projectPairedMatchup } from "@/application/queries/project-paired-matchup";
import { PairedMatchupView } from "@/components/matchup/paired-matchup-view";
import {
  Stage1LeagueView,
  Stage1StandingsView,
  Stage1CommissionerView,
} from "@/components/stage1/live-views";
import { makePhase6State } from "../fixtures/phase6-paired-matchup";
import { frozenCardRulesFixture } from "../fixtures/card-rules";
import { formatCenticredits } from "@/domain/odds/american";

vi.mock("server-only", () => ({}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("score availability across member routes", () => {
  it.each([
    ["CHAMPION_FINAL", "Champion final"],
    ["WEEK_18_EXHIBITION", "Week 18 exhibition"],
    ["FINAL", "Season complete"],
  ] as const)("names the %s season phase accurately", (phase, label) => {
    const { state } = makePhase6State("FINAL");
    state.league.lifecycle = phase;
    state.commissioner.isCommissioner = true;
    render(
      <Stage1CommissionerView
        state={state}
        ownerRehearsal
        invites={[]}
        leagueManagement={null}
        latestLiveImport={null}
        liveWeekOperations={null}
        providerConfigured={false}
        week17CorrectionOperations={null}
      />,
    );
    expect(
      screen.getByText("Season phase").nextElementSibling,
    ).toHaveTextContent(label);
    expect(
      screen.queryByText("Season in progress", { exact: true }),
    ).toBeNull();
  });
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
    const header = screen.getByRole("region", { name: /versus/ });
    if (phase === "LOCKED" || phase === "DELAYED") {
      for (const member of [matchup.self, matchup.opponent]) {
        expect(
          within(header).getByLabelText(
            `${member.displayName} score unavailable`,
          ),
        ).toHaveTextContent("—");
      }
      expect(within(header).queryByText("0.00", { exact: true })).toBeNull();
      expect(within(header).getByRole("status")).toHaveTextContent(
        "Your score unavailable. Opponent score unavailable.",
      );
    } else if (phase !== "PREGAME") {
      for (const member of [matchup.self, matchup.opponent]) {
        expect(member.scoreCenticredits).not.toBeNull();
        const score = formatCenticredits(
          BigInt(member.scoreCenticredits!),
          true,
        );
        expect(
          within(header).getByLabelText(
            `${member.displayName} score ${score} credits`,
          ),
        ).toHaveTextContent(score);
      }
    }
    const expected = screen.getByRole("region", {
      name: /scoreboard/,
    }).textContent;
    view.rerender(<Stage1LeagueView state={state} operations={operations} />);
    expect(screen.queryByText("Cards open", { exact: true })).toBeNull();
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

  it("keeps genuine zero scores visible when a started game has delayed updates", () => {
    const { state, operations, now } = makePhase6State("LIVE");
    state.slate[0].providerHealth = "DEGRADED";
    const matchup = projectPairedMatchup(state, operations, now)!;
    expect(matchup.phase).toBe("DELAYED");
    render(<PairedMatchupView matchup={matchup} refreshControl={null} />);
    for (const member of [matchup.self, matchup.opponent]) {
      expect(
        screen.getByLabelText(`${member.displayName} score 0.00 credits`),
      ).toBeVisible();
    }
    expect(matchup.scoreboard[0].sideAScoreCenticredits).toBe(0);
    expect(matchup.scoreboard[0].sideBScoreCenticredits).toBe(0);
  });

  it.each([
    ["PENDING", 1000, "Sealed"],
    ["PENDING", 500, "Not started"],
    ["INCOMPLETE", 1000, "Incomplete"],
  ] as const)(
    "labels %s owner compliance with %i accepted credits as %s",
    (compliance, allocated, label) => {
      const { state, operations, now } = makePhase6State("DELAYED");
      state.week!.state = "OPEN";
      state.ownerCard!.compliance = compliance;
      state.ownerCard!.allocatedCredits = allocated;
      state.ownerCard!.remainingCredits = 1000 - allocated;
      const matchup = projectPairedMatchup(state, operations, now)!;
      render(<PairedMatchupView matchup={matchup} refreshControl={null} />);
      expect(
        screen.getByLabelText(`${matchup.self.displayName} card status`),
      ).toHaveTextContent(label);
    },
  );
});
