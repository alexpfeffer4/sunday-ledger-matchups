// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HistoryLedger } from "@/components/history/history-ledger";
import { RivalryHeader } from "@/components/history/rivalry-header";
import { WeeklyCloseModule } from "@/components/history/weekly-close-module";
import {
  projectRivalry,
  projectSeasonMemory,
} from "@/domain/history/project-season-memory";
import { makePhase7State, phase7Ids } from "../fixtures/phase7-season-memory";

afterEach(cleanup);

describe("Phase 7 weekly close surfaces", () => {
  it("renders provisional facts, explicit before/after, cutline, and next opponent", () => {
    const memory = projectSeasonMemory(makePhase7State());
    if (!memory.recordBridge) throw new Error("Missing RecordBridge fixture.");
    render(
      <WeeklyCloseModule
        bridge={memory.recordBridge}
        cutline={memory.playoffCutline}
        leagueSlug="sunday-ledger"
      />,
    );

    expect(screen.getByText("Provisional")).toBeVisible();
    expect(screen.getByText("What Week 2 changed")).toBeVisible();
    expect(screen.getByText("Playoff picture")).toBeVisible();
    expect(screen.getByText(/not a clinch or elimination/)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Next: Week 3 vs. Devon Next" }),
    ).toHaveAttribute("href", "/l/sunday-ledger/matchup");
  });

  it("shows correction reason, actor, prior fact, and downstream matchup effect", () => {
    const state = makePhase7State();
    const current = state.matchups.find(
      (matchup) => matchup.id === phase7Ids.matchup2,
    );
    if (!current) throw new Error("Missing current matchup fixture.");
    current.result = null;
    const memory = projectSeasonMemory(state);
    if (!memory.recordBridge)
      throw new Error("Missing corrected bridge fixture.");
    const { container } = render(
      <WeeklyCloseModule
        bridge={memory.recordBridge}
        cutline={memory.playoffCutline}
        leagueSlug="sunday-ledger"
      />,
    );

    expect(screen.getByText("Corrected final")).toBeVisible();
    expect(
      screen.getByText(/Correction · Harbor Club at Lake Club/),
    ).toBeVisible();
    expect(
      screen.getByText(/Commissioner Morgan recorded/),
    ).toBeInTheDocument();
    expect(container).toHaveTextContent(/300.00 → 400.00/);
    expect(
      screen.getByText(/Provider corrected the final home score/),
    ).toBeInTheDocument();
  });

  it("renders active history and all rivalry scopes without generated narrative", () => {
    const memory = projectSeasonMemory(makePhase7State());
    const { container, rerender } = render(
      <HistoryLedger leagueSlug="sunday-ledger" memory={memory} />,
    );
    expect(
      screen.getByRole("heading", { name: "History ledger" }),
    ).toBeVisible();
    expect(screen.getByText("Official result receipt")).toBeVisible();
    expect(screen.getByText(/Commissioner Morgan/)).toBeInTheDocument();

    const rivalry = projectRivalry(memory, phase7Ids.entryA, phase7Ids.entryB);
    if (!rivalry) throw new Error("Missing rivalry fixture.");
    rerender(<RivalryHeader leagueName="Sunday Ledger" rivalry={rivalry} />);
    expect(screen.getByText("Competitive H2H")).toBeVisible();
    expect(container).toHaveTextContent("Exhibition");
    expect(container).toHaveTextContent("Placement");
    expect(container).toHaveTextContent("Playoff");
    expect(container).toHaveTextContent("Regular season");
  });
});
