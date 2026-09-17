// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { projectHistoricalMatchup } from "@/application/queries/project-historical-matchup";
import { projectScheduleWeeks } from "@/application/presentation/schedule-weeks";
import { matchupHref } from "@/application/presentation/matchup-link";
import { PairedMatchupView } from "@/components/matchup/paired-matchup-view";
import { HistoryLedger } from "@/components/history/history-ledger";
import { projectSeasonMemory } from "@/domain/history/project-season-memory";
import { historicalFixture } from "../fixtures/historical-matchup";
import { phase7Ids } from "../fixtures/phase7-season-memory";

afterEach(cleanup);
describe("historical matchups", () => {
  it("shows accepted terms on both sides and the official result, with that week's record", () => {
    const { history, cards, game } = historicalFixture();
    cards.cards[0]!.scoreCenticredits = 999999;
    const matchup = projectHistoricalMatchup(history, cards, 1)!;
    expect(matchup.self.scoreCenticredits).toBe(
      game.result!.sideAPointsForCenticredits,
    );
    expect(matchup.self.record).toBe("1–0");
    expect(matchup.rows.SETTLED).toHaveLength(4);
    expect(matchup.rows.SETTLED[0]).toMatchObject({
      americanOdds: 100,
      stakeCredits: 100,
      outcome: "WIN",
      returnedCenticredits: 20000,
    });
    render(
      <PairedMatchupView
        matchup={matchup}
        refreshControl={null}
        weeks={[
          {
            week: 3,
            href: "/l/sunday-ledger/matchup",
            current: true,
            selected: false,
          },
          { week: 1, href: matchupHref("sunday-ledger", 1), selected: true },
        ]}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Week" })).toHaveValue(
      matchupHref("sunday-ledger", 1),
    );
    expect(screen.getByText("Harbor Club", { exact: true })).toBeVisible();
    expect(screen.getByText("Lake Club +2.5")).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Back to current week/ }),
    ).toHaveAttribute("href", "/l/sunday-ledger/matchup");
    expect(
      screen.queryByRole("button", { name: /refresh|submit|seal/i }),
    ).toBeNull();
    expect(matchup.scoreboard[0]!.href).toBe(
      matchupHref("sunday-ledger", 1, game.id),
    );
  });
  it("keeps the viewer on the left when they were side B and names spectator winners", () => {
    const { history, cards, game } = historicalFixture();
    history.viewer.entryId = game.sideBEntryId;
    const own = projectHistoricalMatchup(history, cards, 1)!;
    expect(own.self.entryId).toBe(game.sideBEntryId);
    expect(own.self.decision).toBe(game.result!.sideBDecision);
    expect(
      own.rows.SETTLED.find((row) => row.side === "SELF")!.proposition,
    ).toBe("Lake Club +2.5");
    history.viewer.entryId = phase7Ids.entryC;
    expect(projectHistoricalMatchup(history, cards, 1)).toBeNull();
    const spectator = projectHistoricalMatchup(history, cards, 1, game.id)!;
    expect(spectator.spectator).toBe(true);
    render(<PairedMatchupView matchup={spectator} refreshControl={null} />);
    expect(
      screen.getByRole("heading", { name: "Alex Ledger won" }),
    ).toBeVisible();
    expect(screen.queryByText("You won")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Back to your matchup" }),
    ).toHaveAttribute("href", matchupHref("sunday-ledger", 1));
  });
  it("keeps same-game player picks separate and renders authoritative zero and negative yards", () => {
    const { history, cards, game } = historicalFixture();
    history.corrections = [];
    const subjects = [
      {
        subjectId: "10000000-0000-4000-8000-000000000001",
        subjectLabel: "Harbor Quarterback",
        subjectTeam: "Harbor Club",
        finalYards: 0,
      },
      {
        subjectId: "10000000-0000-4000-8000-000000000002",
        subjectLabel: "Lake Quarterback",
        subjectTeam: "Lake Club",
        finalYards: -2,
      },
    ];
    for (const [index, subject] of subjects.entries()) {
      const { finalYards, ...identity } = subject;
      const position = cards.cards[index]!.positions[0]!;
      Object.assign(position, {
        ...identity,
        marketType: "PLAYER_PASSING_YARDS",
        statistic: "PASSING_YARDS",
        period: "FULL_GAME",
        proposition: `${subject.subjectLabel} · Under 200.5 passing yards`,
        settlement: {
          outcome: "WIN",
          returnedCenticredits: 20000,
          finalYards,
          playerEvidenceVersion: 2,
        },
      });
    }
    const projected = projectHistoricalMatchup(history, cards, 1)!;
    expect(projected.phase).toBe("FINAL");
    expect(projected.self.scoreCenticredits).toBe(
      game.result!.sideAPointsForCenticredits,
    );
    render(<PairedMatchupView matchup={projected} refreshControl={null} />);
    for (const [index, subject] of subjects.entries()) {
      const member = index === 0 ? projected.self : projected.opponent;
      expect(
        projected.rows.SETTLED.find(
          (row) => row.subjectId === subject.subjectId,
        ),
      ).toMatchObject({
        ...subject,
        statistic: "PASSING_YARDS",
        period: "FULL_GAME",
        playerEvidenceVersion: 2,
        playerCorrectionReason: null,
      });
      const playerColumn = screen.getByRole("group", {
        name: `${member.displayName} · Harbor Club at Lake Club · ${subject.subjectLabel} · Passing yards`,
      });
      expect(
        within(playerColumn).getByText(
          `Final: ${subject.finalYards} passing yards`,
        ),
      ).toBeVisible();
      expect(
        within(playerColumn).queryByText(`${subject.subjectTeam} · Full game`),
      ).not.toBeInTheDocument();
      expect(
        within(playerColumn).queryByText(
          `${subjects[1 - index]!.subjectLabel} · Under 200.5 passing yards`,
        ),
      ).toBeNull();
    }
  });
  it("shows a player correction even when the official team result did not change", () => {
    const { history, cards, game } = historicalFixture();
    history.corrections = [];
    const position = cards.cards[0]!.positions[0]!;
    Object.assign(position, {
      subjectId: "10000000-0000-4000-8000-000000000003",
      subjectLabel: "Harbor Receiver",
      subjectTeam: "Harbor Club",
      marketType: "PLAYER_RECEIVING_YARDS",
      statistic: "RECEIVING_YARDS",
      period: "FULL_GAME",
      proposition: "Harbor Receiver · Over 60.5 receiving yards",
      settlement: {
        outcome: "LOSS",
        returnedCenticredits: 0,
        finalYards: 60,
        playerEvidenceVersion: 3,
        playerCorrectionReason: "The official receiving total was corrected.",
      },
    });
    const projected = projectHistoricalMatchup(history, cards, 1)!;
    expect(projected).toMatchObject({
      phase: "CORRECTED",
      phaseLabel: "Corrected final",
      correctedCount: 1,
    });
    expect(projected.self.scoreCenticredits).toBe(
      game.result!.sideAPointsForCenticredits,
    );
    expect(
      projected.rows.SETTLED.find((row) => row.id === position.id),
    ).toMatchObject({
      eventState: "CORRECTED",
      corrected: true,
      outcome: "LOSS",
      returnedCenticredits: 0,
    });
    expect(
      projected.rows.SETTLED.filter((row) => row.id !== position.id).every(
        (row) => !row.corrected,
      ),
    ).toBe(true);
    render(<PairedMatchupView matchup={projected} refreshControl={null} />);
    expect(screen.getByText("Final: 60 receiving yards")).toBeVisible();
    expect(
      screen.getByText(
        "Player result corrected: The official receiving total was corrected.",
      ),
    ).toBeVisible();
  });
  it("rejects unpublished, provisional, other-season, mismatched-week and missing evidence", () => {
    const { history, cards } = historicalFixture();
    for (const week of [0, 2, 3, 19])
      expect(projectHistoricalMatchup(history, cards, week)).toBeNull();
    expect(
      projectHistoricalMatchup(history, cards, 1, phase7Ids.oldPlayoff),
    ).toBeNull();
    expect(
      projectHistoricalMatchup(
        history,
        { ...cards, weekId: phase7Ids.week2 },
        1,
      ),
    ).toBeNull();
    expect(projectHistoricalMatchup(history, null, 1)).toBeNull();
    cards.cards[0]!.positions[0]!.settlement = null;
    expect(projectHistoricalMatchup(history, cards, 1)).toBeNull();
  });
  it("preserves zero/incomplete outcomes and corrected finals without recomputing scores", () => {
    const { history, cards, game } = historicalFixture();
    cards.cards[0]!.readiness = "INCOMPLETE";
    game.result!.sideAPointsForCenticredits = 0;
    const projected = projectHistoricalMatchup(history, cards, 1)!;
    expect(projected.self).toMatchObject({
      scoreCenticredits: 0,
      cardStatus: "Incomplete",
    });
    expect(projected.resultStatus).toBe("FINAL");
    expect(projected.phase).toBe("CORRECTED");
    expect(projected.rows.SETTLED).toHaveLength(4);
  });
  it("links History directly to the completed matchup", () => {
    const { history, game } = historicalFixture();
    render(
      <HistoryLedger
        memory={projectSeasonMemory(history)}
        leagueSlug="sunday-ledger"
      />,
    );
    expect(
      screen.getByRole("link", { name: "View matchup and bets" }),
    ).toHaveAttribute("href", matchupHref("sunday-ledger", 1, game.id));
  });
  it("uses historical Schedule scores, never current-rematch scores, and retains past postseason", () => {
    const { history, live, game } = historicalFixture();
    live.season.id = history.season.id;
    live.week!.nflWeek = 3;
    live.week!.state = "OPEN";
    const finalWeek = {
      ...history.weeks[0]!,
      id: phase7Ids.oldWeek18,
      nflWeek: 18,
      scope: "EXHIBITION" as const,
    };
    history.weeks.push(finalWeek);
    history.matchups.push({
      ...game,
      id: phase7Ids.oldExhibition,
      weekId: finalWeek.id,
      nflWeek: 18,
      scope: "EXHIBITION",
    });
    const weeks = projectScheduleWeeks(live, null, history);
    expect(weeks.find((week) => week.week === 1)!.matchups[0]).toMatchObject({
      sideAScoreCenticredits: game.result!.sideAPointsForCenticredits,
      href: matchupHref(live.league.slug, 1, game.id),
    });
    expect(weeks.find((week) => week.week === 2)!.status).toBe("Picks settled");
    expect(
      weeks.find((week) => week.week === 18)!.matchups[0]!.competition,
    ).toBe("Week 18 exhibition");
  });
});
