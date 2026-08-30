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
});
