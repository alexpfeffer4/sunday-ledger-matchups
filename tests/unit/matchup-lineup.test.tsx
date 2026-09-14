// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  matchupGames,
  resultChangingScenario,
} from "@/application/presentation/matchup-lineup";
import { PairedMatchupView } from "@/components/matchup/paired-matchup-view";
import { makePhase6Matchup } from "../fixtures/phase6-paired-matchup";

afterEach(cleanup);

describe("paired game lineups", () => {
  it("keeps every bet on its member's side with shared game and market alignment", () => {
    const matchup = makePhase6Matchup("LIVE");
    const { container } = render(
      <PairedMatchupView matchup={matchup} refreshControl={null} />,
    );
    const rows = Object.values(matchup.rows).flat();
    expect(container.querySelectorAll("[data-position-id]")).toHaveLength(
      rows.length,
    );
    for (const row of rows) {
      const bet = container.querySelector(`[data-position-id="${row.id}"]`)!;
      expect(bet.closest("[data-member-name]")).toHaveAttribute(
        "data-member-name",
        row.memberName,
      );
      expect(bet.closest("[data-event-id]")).toHaveAttribute(
        "data-event-id",
        row.eventId,
      );
    }
    expect(container.querySelectorAll("[data-event-id]")).toHaveLength(
      new Set(rows.map((row) => row.eventId)).size,
    );
  });

  it("does not claim a legacy hidden opponent has no bet on an upcoming game", () => {
    const matchup = makePhase6Matchup("PARTIAL_REVEAL");
    const upcoming = matchup.rows.REMAINING.find((row) => row.side === "SELF")!;
    render(<PairedMatchupView matchup={matchup} refreshControl={null} />);
    const lane = screen.getByLabelText(
      `${matchup.opponent.displayName} · ${upcoming.eventLabel}`,
    );
    expect(lane).toHaveTextContent("Picks hidden until confirmed kickoff");
    expect(lane).not.toHaveTextContent(
      /No bet|credits|moneyline|spread|total/i,
    );
  });

  it("keeps kickoff order through settlement and retains a member's collapse choice on refresh", () => {
    const matchup = makePhase6Matchup("FINAL");
    const initialOrder = matchupGames(matchup).map((game) => game.eventId);
    const { rerender, container } = render(
      <PairedMatchupView matchup={matchup} refreshControl={null} />,
    );
    const game = screen.getByRole("region", {
      name: "Harbor Club at Lake Club",
    });
    const toggle = within(game).getByRole("button");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    for (const bet of game.querySelectorAll("[data-position-id]"))
      expect(bet).not.toBeVisible();
    const update = structuredClone(matchup);
    update.rows.SETTLED.reverse();
    update.rows.SETTLED[0]!.corrected = true;
    rerender(<PairedMatchupView matchup={update} refreshControl={null} />);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      [...container.querySelectorAll("[data-event-id]")].map((game) =>
        game.getAttribute("data-event-id"),
      ),
    ).toEqual(initialOrder);
    fireEvent.click(toggle);
    for (const bet of game.querySelectorAll("[data-position-id]"))
      expect(bet).toBeVisible();
  });

  it("renders 20 versus one without duplicating the opponent or truncating long names", () => {
    const matchup = makePhase6Matchup("LIVE");
    const base = matchup.rows.IN_PROGRESS[0]!;
    matchup.self.displayName = "Alexandria Montgomery-Wellington";
    matchup.rows = {
      SETTLED: [],
      REMAINING: [],
      IN_PROGRESS: [
        ...Array.from({ length: 20 }, (_, index) => ({
          ...base,
          id: `self-${index}`,
          side: "SELF" as const,
          memberName: matchup.self.displayName,
        })),
        {
          ...base,
          id: "opponent-only",
          side: "OPPONENT",
          memberName: matchup.opponent.displayName,
        },
      ],
    };
    const { container } = render(
      <PairedMatchupView matchup={matchup} refreshControl={null} />,
    );
    expect(container.querySelectorAll('[data-side="SELF"]')).toHaveLength(20);
    expect(container.querySelectorAll('[data-side="OPPONENT"]')).toHaveLength(
      1,
    );
    expect(
      screen.getByRole("heading", { name: matchup.self.displayName }),
    ).toBeVisible();
  });

  it("keeps available credits owner-only even when a public payload contains both balances", () => {
    const matchup = makePhase6Matchup("LIVE");
    matchup.week.rollingSubmissionsEnabled = true;
    matchup.self.availableCredits = 350;
    matchup.opponent.availableCredits = 600;
    const { rerender } = render(
      <PairedMatchupView matchup={matchup} refreshControl={null} />,
    );
    expect(screen.getByLabelText("Alex Ledger unused credits")).toBeVisible();
    expect(screen.queryByLabelText("Jordan Rival unused credits")).toBeNull();
    rerender(
      <PairedMatchupView
        matchup={{ ...matchup, spectator: true }}
        refreshControl={null}
      />,
    );
    expect(screen.queryByLabelText(/unused credits/)).toBeNull();
  });
});

function scenarioFixture() {
  const matchup = makePhase6Matchup("LIVE");
  const row = {
    ...matchup.rows.IN_PROGRESS[0]!,
    side: "SELF" as const,
    stakeCredits: 100,
    americanOdds: 100,
    proposition: "Harbor Club",
    returnedCenticredits: null,
  };
  matchup.rows = { SETTLED: [], IN_PROGRESS: [row], REMAINING: [] };
  matchup.self.scoreCenticredits = 10000;
  matchup.opponent.scoreCenticredits = 20000;
  matchup.self.outstanding = { picks: 1, credits: 100 };
  matchup.opponent.outstanding = { picks: 0, credits: 0 };
  matchup.self.cardStatus = matchup.opponent.cardStatus = "Sealed";
  matchup.futureSealed = false;
  matchup.scorePath.opponentRemainingMaximumCenticredits = 0;
  return matchup;
}

describe("bounded result-changing scenario", () => {
  it("uses accepted odds and stake to show a conditional lead change, without claiming necessity", () => {
    expect(resultChangingScenario(scenarioFixture())).toBe(
      "If Harbor Club wins, Alex Ledger moves ahead, 300.00–200.00.",
    );
  });
  it.each([
    "hidden",
    "open",
    "unknown totals",
    "incomplete",
    "already ahead",
    "cannot overtake",
    "final",
    "spectator",
    "extra pending",
  ])("suppresses an unsafe or unhelpful scenario: %s", (reason) => {
    const matchup = scenarioFixture();
    if (reason === "hidden") matchup.futureSealed = true;
    if (reason === "open") matchup.scorePath.furtherSubmissionsPossible = true;
    if (reason === "unknown totals") matchup.opponent.outstanding = null;
    if (reason === "incomplete") matchup.self.cardStatus = "Incomplete";
    if (reason === "already ahead") matchup.self.scoreCenticredits = 21000;
    if (reason === "cannot overtake")
      matchup.opponent.scoreCenticredits = 30000;
    if (reason === "final") matchup.resultStatus = "FINAL";
    if (reason === "spectator") matchup.spectator = true;
    if (reason === "extra pending")
      matchup.rows.IN_PROGRESS.push({
        ...matchup.rows.IN_PROGRESS[0]!,
        id: "extra",
      });
    expect(resultChangingScenario(matchup)).toBeNull();
  });
});
