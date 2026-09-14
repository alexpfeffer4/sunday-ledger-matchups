// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MatchupStateRefresh } from "@/components/matchup/matchup-state-refresh";
import { PairedMatchupView } from "@/components/matchup/paired-matchup-view";
import {
  makePhase6Matchup,
  unrevealableReceiptText,
} from "../fixtures/phase6-paired-matchup";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  cleanup();
  refresh.mockClear();
});

describe("Phase 6 paired matchup surface", () => {
  it("keeps the check timestamp without routine polling copy and shows real delays", () => {
    const matchup = makePhase6Matchup("LIVE");
    matchup.freshness.delayed = false;
    matchup.freshness.message =
      "Results are checked about four hours after kickoff.";
    const { rerender } = render(
      <PairedMatchupView
        matchup={matchup}
        refreshControl={<MatchupStateRefresh />}
      />,
    );
    expect(screen.getByText(/Scores checked/)).toBeVisible();
    expect(
      screen.queryByText(/four hours after kickoff/),
    ).not.toBeInTheDocument();
    matchup.freshness = {
      ...matchup.freshness,
      delayed: true,
      message:
        "A game result is delayed. Your last confirmed scores are shown.",
    };
    rerender(
      <PairedMatchupView
        matchup={matchup}
        refreshControl={<MatchupStateRefresh />}
      />,
    );
    expect(screen.getByText(/A game result is delayed/)).toBeVisible();
  });

  it("uses settled wording before weekly close and removes redundant settled-card details", () => {
    const matchup = makePhase6Matchup("PROVISIONAL");
    const { container } = render(
      <PairedMatchupView
        matchup={matchup}
        refreshControl={<MatchupStateRefresh />}
      />,
    );
    expect(screen.getAllByText("Picks settled").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "You won" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "What can still be added" }),
    ).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent(
      /Provisional|correction deadline unavailable/,
    );
    const badges = [...container.querySelectorAll(".status-badge")].filter(
      (badge) => /Won|Lost/.test(badge.textContent ?? ""),
    );
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges)
      expect(badge.textContent).toMatch(/^(Won|Lost)$/);
  });

  it("shows pregame opponent status and refreshes without exposing picks", () => {
    const matchup = makePhase6Matchup("PREGAME");
    matchup.opponent.cardStatus = "Not sealed";
    const { rerender, container } = render(
      <PairedMatchupView
        matchup={matchup}
        refreshControl={<MatchupStateRefresh />}
      />,
    );
    expect(screen.getByLabelText("Jordan Rival card status")).toHaveTextContent(
      "Not sealed",
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh matchup" }));
    expect(refresh).toHaveBeenCalledOnce();
    rerender(
      <PairedMatchupView
        matchup={{
          ...matchup,
          opponent: { ...matchup.opponent, cardStatus: "Sealed" },
        }}
        refreshControl={<MatchupStateRefresh />}
      />,
    );
    expect(screen.getByLabelText("Jordan Rival card status")).toHaveTextContent(
      "Sealed",
    );
    expect(container).not.toHaveTextContent(unrevealableReceiptText);
    expect(
      screen.queryByLabelText("Jordan Rival score 0.00 credits"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Picks by game")).not.toBeInTheDocument();
  });

  it("renders one generic placeholder and no unrevealable receipt content", () => {
    const matchup = makePhase6Matchup("PARTIAL_REVEAL");
    const { container } = render(
      <PairedMatchupView
        matchup={matchup}
        refreshControl={<MatchupStateRefresh />}
      />,
    );

    expect(container).not.toHaveTextContent(unrevealableReceiptText);
    expect(JSON.stringify(matchup)).not.toContain(unrevealableReceiptText);
    expect(screen.getAllByTestId("future-sealed-placeholder")).toHaveLength(1);
    expect(
      screen.getByLabelText(/Jordan Rival, Harbor Club at Lake Club/),
    ).toBeVisible();
    expect(
      screen.queryByText(/hidden count|hidden stake/i),
    ).not.toBeInTheDocument();
  });

  it("refreshes only when the member activates the stored-state control", () => {
    render(
      <PairedMatchupView
        matchup={makePhase6Matchup("LIVE")}
        refreshControl={<MatchupStateRefresh />}
      />,
    );

    const button = screen.getByRole("button", { name: "Refresh matchup" });
    fireEvent.click(button);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps member names attached to their scores in Live and final states", () => {
    const { rerender } = render(
      <PairedMatchupView
        matchup={makePhase6Matchup("LIVE")}
        refreshControl={<MatchupStateRefresh />}
      />,
    );
    expect(
      screen.getByLabelText("Alex Ledger score 0.00 credits"),
    ).toBeVisible();
    expect(
      screen.getByLabelText("Jordan Rival score 0.00 credits"),
    ).toBeVisible();

    rerender(
      <PairedMatchupView
        matchup={makePhase6Matchup("FINAL")}
        refreshControl={<MatchupStateRefresh />}
      />,
    );
    expect(
      screen.getByLabelText("Alex Ledger score 400.00 credits"),
    ).toBeVisible();
    expect(
      screen.getByLabelText("Jordan Rival score 200.00 credits"),
    ).toBeVisible();
  });

  it("labels frozen playoff seeds without implying regular-season rank", () => {
    const matchup = makePhase6Matchup("PREGAME");
    matchup.week.nflWeek = 15;
    matchup.week.scope = "PLAYOFF";
    matchup.self.seed = 3;
    matchup.self.seedKind = "PLAYOFF";
    matchup.opponent.seed = 6;
    matchup.opponent.seedKind = "PLAYOFF";

    render(
      <PairedMatchupView
        matchup={matchup}
        refreshControl={<MatchupStateRefresh />}
      />,
    );

    expect(screen.getByText(/No\. 3 playoff seed/)).toBeVisible();
    expect(screen.getByText(/No\. 6 playoff seed/)).toBeVisible();
    expect(screen.queryByText(/No\. 2 seed/)).not.toBeInTheDocument();
  });
});
