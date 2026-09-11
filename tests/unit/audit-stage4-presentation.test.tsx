// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { competitionLabel } from "@/application/presentation/competition-label";
import { projectPairedMatchup } from "@/application/queries/project-paired-matchup";
import { easternTime } from "@/application/queries/score-freshness";
import { PairedMatchupView } from "@/components/matchup/paired-matchup-view";
import { WeeklyCloseModule } from "@/components/history/weekly-close-module";
import { PlayoffPendingView } from "@/components/playoffs/playoff-pending-view";
import { LivePlayoffView } from "@/components/playoffs/live-playoff-view";
import { currentPlayoffRound } from "@/components/playoffs/current-playoff-contest";
import {
  Stage1MatchupView,
  Stage1ScheduleView,
} from "@/components/stage1/live-views";
import { projectSeasonMemory } from "@/domain/history/project-season-memory";
import {
  makePhase6Matchup,
  makePhase6State,
} from "../fixtures/phase6-paired-matchup";
import { makePhase7State } from "../fixtures/phase7-season-memory";
import { phase8aPlayoffState } from "../fixtures/phase8a-playoff-state";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => "/l/sunday-ledger/matchup",
}));
vi.mock("server-only", () => ({}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const viewerEntryId = phase8aPlayoffState.publication.qualifiers[0].entryId;

describe("Stage 4 result and playoff presentation", () => {
  it.each(["WIN", "LOSS", "TIE"] as const)(
    "gives a final %s one primary paired score and retains its consequence",
    (decision) => {
      const matchup = makePhase6Matchup("FINAL");
      matchup.self.decision = decision;
      const memory = projectSeasonMemory(makePhase7State());
      const bridge = memory.recordBridge!;
      bridge.matchup.status = "FINAL";
      render(
        <PairedMatchupView
          matchup={matchup}
          refreshControl={null}
          cardProgress={<p>Completed card action</p>}
          weeklyClose={
            <WeeklyCloseModule
              bridge={bridge}
              cutline={memory.playoffCutline}
              leagueSlug="sunday-ledger"
              presentation="supporting"
            />
          }
        />,
      );
      expect(
        screen.getByRole("heading", {
          name:
            decision === "WIN"
              ? "You won"
              : decision === "LOSS"
                ? "You lost"
                : "You tied",
        }),
      ).toHaveClass(
        decision === "WIN"
          ? "text-positive"
          : decision === "LOSS"
            ? "text-negative"
            : "text-graphite",
      );
      expect(screen.getAllByLabelText(/score [\d,.]+ credits/)).toHaveLength(2);
      const close = screen.getByTestId("weekly-close-module");
      expect(
        within(close).queryByLabelText(/credits, .*credits/),
      ).not.toBeInTheDocument();
      expect(close).toHaveTextContent("Standings position");
      expect(
        within(close).getByRole("link", { name: /Next: Week/ }),
      ).toBeVisible();
      expect(
        screen.queryByRole("heading", { name: "Remaining" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("Completed card action"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/Scores checked/)).not.toBeInTheDocument();
      const primary = screen.getByRole("region", {
        name: new RegExp(matchup.self.displayName + " versus"),
      });
      expect(
        within(primary).getByText("Final").closest(".status-badge"),
      ).toHaveClass("text-sealed");
    },
  );

  it("keeps corrected final, before/after facts, actor and reason visible through disclosure", () => {
    const matchup = makePhase6Matchup("CORRECTED");
    matchup.resultStatus = "FINAL";
    const memory = projectSeasonMemory(makePhase7State());
    const bridge = memory.recordBridge!;
    const correction = {
      id: "correction",
      eventLabel: "Harbor at Lake",
      reason: "Official score correction",
      actorName: "Commissioner Morgan",
      correctedAt: "2026-09-14T03:00:00Z",
      beforeEvent: "20–17",
      afterEvent: "20–20",
      beforeSideAScoreCenticredits: 30000,
      afterSideAScoreCenticredits: 40000,
      beforeSideBScoreCenticredits: 10000,
      afterSideBScoreCenticredits: 10000,
    };
    bridge.matchup.corrections = [correction];
    render(
      <PairedMatchupView
        matchup={matchup}
        refreshControl={null}
        weeklyClose={
          <WeeklyCloseModule
            bridge={bridge}
            cutline={null}
            leagueSlug="sunday-ledger"
            presentation="supporting"
          />
        }
      />,
    );
    expect(screen.getByText("Corrected final")).toBeVisible();
    const disclosure = screen
      .getByText("Correction · Harbor at Lake")
      .closest("details")!;
    disclosure.open = true;
    expect(disclosure).toHaveTextContent("Official score correction");
    expect(disclosure).toHaveTextContent("Commissioner Morgan");
    expect(disclosure).toHaveTextContent("20–17 → 20–20");
    expect(disclosure).toHaveTextContent("EDT");
  });

  it("uses the requested current round, without changing published order or inferring a missing round", () => {
    const state = structuredClone(phase8aPlayoffState);
    const previous = structuredClone(state.rounds[0]);
    previous.week = 16;
    previous.id = "week16";
    previous.state = "OPEN";
    state.rounds.push(previous);
    const original = structuredClone(state);
    expect(currentPlayoffRound(state, 16)?.id).toBe("week16");
    expect(currentPlayoffRound(state, 17)).toBeNull();
    expect(currentPlayoffRound(state)?.id).toBe("week16");
    expect(state).toEqual(original);
  });

  it("leads with the member's contest and preserves explicit bye advancement and qualification seeds", () => {
    render(
      <LivePlayoffView
        state={phase8aPlayoffState}
        viewerEntryId={viewerEntryId}
        activeWeek={15}
      />,
    );
    const primary = screen.getByRole("region", {
      name: /Week 15 · Opening round/,
    });
    expect(primary).toHaveTextContent("No. 1 · Ledger Member 1");
    expect(primary).toHaveTextContent(
      "Your championship bye advances you to Week 16",
    );
    expect(
      within(primary).getByRole("link", { name: "Open your matchup" }),
    ).toHaveAttribute("href", "/l/sunday-ledger/matchup");
    const field = screen.getByRole("heading", {
      name: "Six-slot championship field",
    });
    expect(
      primary.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getAllByText("Vacant")).toHaveLength(2);
    expect(
      screen.getByText(
        "Reinstated to complete the four-member championship field",
      ),
    ).toBeVisible();
  });

  it.each(["round", "contest", "duplicate"])(
    "shows recovery when the expected %s is unavailable",
    (missing) => {
      const state = structuredClone(phase8aPlayoffState);
      if (missing === "round") state.rounds = [];
      else if (missing === "contest") state.rounds[0].matchups.shift();
      else
        state.rounds[0].matchups.push({
          ...state.rounds[0].matchups[0],
          id: "duplicate",
        });
      render(
        <LivePlayoffView
          state={state}
          viewerEntryId={viewerEntryId}
          activeWeek={15}
        />,
      );
      const primary = screen.getByRole("region", {
        name: "Your playoff matchup is unavailable",
      });
      expect(primary).toHaveTextContent(
        "does not mean you have a bye or are out",
      );
      expect(
        within(primary).queryByRole("link", { name: "Open your matchup" }),
      ).not.toBeInTheDocument();
      fireEvent.click(
        within(primary).getByRole("button", { name: "Refresh playoffs" }),
      );
      expect(refresh).toHaveBeenCalledOnce();
    },
  );

  it("does not explain reinstatement for an ordinary eligible field", () => {
    const state = structuredClone(phase8aPlayoffState);
    state.publication.qualifiers.forEach((q) => {
      q.selectionReason = "ELIGIBLE_STANDINGS";
      q.eligibilityStatus = "ELIGIBLE";
      q.attendanceMisses = 0;
    });
    render(
      <LivePlayoffView
        state={state}
        viewerEntryId={viewerEntryId}
        activeWeek={15}
      />,
    );
    expect(
      screen.queryByText(/Fewer than four members were eligible/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Reinstated to complete/),
    ).not.toBeInTheDocument();
  });

  it("uses an unavailable state for missing active card data without granting a week off", () => {
    const { state } = makePhase6State("PREGAME");
    state.league.lifecycle = "PLAYOFFS";
    state.week!.nflWeek = 16;
    state.ownerCard = null;
    render(<Stage1MatchupView state={state} />);
    expect(
      screen.getByRole("heading", { name: "Your matchup is unavailable" }),
    ).toBeVisible();
    expect(
      screen.queryByText(/You do not need to build a card/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Refresh matchup" }),
    ).toBeVisible();
  });

  it.each([15, 16, 17, 18])(
    "labels a Week %i exhibition correctly in shared schedules and projection",
    (week) => {
      expect(competitionLabel({ scope: "EXHIBITION", week })).toBe(
        week === 18 ? "Week 18 exhibition" : "Exhibition",
      );
      const { state, operations, now } = makePhase6State("FINAL");
      state.week!.nflWeek = week;
      state.week!.scope = "EXHIBITION";
      state.schedule.forEach((m) => {
        m.scope = "EXHIBITION";
        m.postseasonRole = "EXHIBITION";
      });
      const projected = projectPairedMatchup(state, operations, now)!;
      expect(
        projected.scoreboard.every(
          (game) =>
            game.competition ===
            (week === 18 ? "Week 18 exhibition" : "Exhibition"),
        ),
      ).toBe(true);
      render(<Stage1ScheduleView state={state} />);
      if (week !== 18)
        expect(
          screen.queryByText("Week 18 exhibition"),
        ).not.toBeInTheDocument();
    },
  );

  it("distinguishes prequalification from unavailable published playoff data", () => {
    const { state } = makePhase6State("PREGAME");
    const { rerender } = render(<PlayoffPendingView state={state} />);
    expect(
      screen.getByRole("heading", { name: "The playoff race" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "View standings" })).toBeVisible();
    state.league.lifecycle = "PLAYOFFS";
    rerender(<PlayoffPendingView state={state} />);
    expect(
      screen.getByRole("heading", { name: "Playoff data is unavailable" }),
    ).toBeVisible();
    expect(screen.queryByText("Not published")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Refresh playoffs" }),
    ).toBeVisible();
  });

  it("displays Eastern dates across summer, winter, and date rollover", () => {
    expect(easternTime("2026-09-14T03:00:00Z")).toBe("Sep 13, 11:00 PM EDT");
    expect(easternTime("2027-01-04T03:00:00Z")).toBe("Jan 3, 10:00 PM EST");
  });
});
