// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { exampleSeasonArchive } from "@/adapters/example/example-season";
import type { SeasonArchiveDto } from "@/application/queries/season-archive-dtos";
import { ScheduleNavigator } from "@/components/league/schedule-navigator";
import { StandingsTable } from "@/components/league/standings-table";
import { LeagueScoreboard } from "@/components/matchup/league-scoreboard";
import {
  SeasonArchiveMyCard,
  SeasonArchiveSchedule,
} from "@/components/season/archive-views";
import {
  Stage1ReceiptView,
  Stage1ScheduleView,
} from "@/components/stage1/live-views";
import { makePhase6State } from "../fixtures/phase6-paired-matchup";

vi.mock("server-only", () => ({}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

function archiveWithCorrection(eventId: string): SeasonArchiveDto {
  return {
    ...structuredClone(exampleSeasonArchive),
    schemaVersion: 2,
    illustrative: undefined,
    corrections: [
      {
        id: "phase-10-correction",
        week: 18,
        eventId,
        originalResultVersionId: "original-result",
        correctedResultVersionId: "corrected-result",
        reason: "Official scoring correction",
        recordedAt: "2027-01-12T18:00:00.000Z",
      },
    ],
  } as unknown as SeasonArchiveDto;
}

describe("Phase 10 dense league records", () => {
  it("keeps rank, You, record, Points For, cutline, and playoff state decisive", () => {
    const rows = [
      {
        entryId: "self",
        rank: 1,
        memberName: "Alex Ledger With A Deliberately Long Club Name",
        wins: 8,
        losses: 2,
        ties: 1,
        pointsForCenticredits: 123_456,
        allPlayHalfWinUnits: 15,
        allPlayComparisonCount: 11,
        attendanceMisses: 0,
        playoffState: "Playoff seed",
        inPlayoffField: true,
        current: true,
      },
      {
        entryId: "outside",
        rank: 2,
        memberName: "Jordan Rival",
        wins: 7,
        losses: 4,
        ties: 0,
        pointsForCenticredits: 98_765,
        allPlayHalfWinUnits: 12,
        allPlayComparisonCount: 11,
        attendanceMisses: 1,
        playoffState: "Outside cutline",
        inPlayoffField: false,
        current: false,
      },
    ];
    render(<StandingsTable caption="Official standings" rows={rows} />);

    expect(
      screen.getByRole("table", { name: "Official standings" }),
    ).toBeVisible();
    expect(screen.getAllByText("You")).toHaveLength(2);
    expect(screen.getAllByText("Playoff cutline")).toHaveLength(1);
    const current = screen.getByRole("article", {
      name: /Rank 1, Alex Ledger.*You, 8–2–1, 1,234.56 Points For, Playoff seed/,
    });
    expect(within(current).getByText("Attendance misses")).toBeVisible();
    expect(within(current).getByText("1,234.56")).toBeVisible();
    expect(screen.getAllByText("Outside cutline").length).toBeGreaterThan(0);
  });

  it("shows one selected schedule week and retains labelled matchup facts", () => {
    render(
      <ScheduleNavigator
        initialWeek={18}
        weeks={[
          {
            week: 17,
            label: "Week 17 · Playoffs",
            status: "Champion final",
            matchups: [
              {
                id: "championship",
                sideAName: "North Club",
                sideBName: "South Club",
                sideAScoreCenticredits: 30_000,
                sideBScoreCenticredits: 20_000,
                status: "Champion final · Archive final · Archived",
                competition: "Championship · champion final",
                currentMember: true,
                sideAWinner: true,
              },
            ],
          },
          {
            week: 18,
            label: "Week 18 · Exhibition",
            status: "Exhibition final · Archived",
            matchups: [
              {
                id: "exhibition",
                sideAName: "North Club",
                sideBName: "East Club",
                sideAScoreCenticredits: 0,
                sideBScoreCenticredits: 10_000,
                status: "Exhibition miss · Archive final · Archived",
                competition: "Week 18 exhibition",
                currentMember: true,
                sideBWinner: true,
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText("East Club")).toBeVisible();
    expect(screen.queryByText("South Club")).not.toBeInTheDocument();
    expect(
      screen.getByText("Exhibition miss · Archive final · Archived"),
    ).toBeVisible();

    fireEvent.change(screen.getByLabelText("Selected week"), {
      target: { value: "17" },
    });
    expect(screen.getByText("South Club")).toBeVisible();
    expect(screen.queryByText("East Club")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText(
        /North Club 300\.00, South Club 200\.00, Championship · champion final, Champion final/,
      ),
    ).toBeVisible();
  });

  it("replaces the fourteen-card stack with one selected-week list", () => {
    const { state } = makePhase6State("PREGAME");
    const matchup = state.schedule[0]!;
    render(
      <Stage1ScheduleView
        liveSchedule={{
          algorithmVersion: "circle-v1",
          seed: "phase-10-schedule-seed",
          outputHash: "a".repeat(64),
          publishedAt: "2026-09-01T14:00:00.000Z",
          orderedEntryIds: [matchup.sideAEntryId, matchup.sideBEntryId],
          matchups: Array.from({ length: 14 }, (_, index) => ({
            week: index + 1,
            sideAEntryId: matchup.sideAEntryId,
            sideAName: matchup.sideAName,
            sideBEntryId: matchup.sideBEntryId,
            sideBName: matchup.sideBName,
          })),
        }}
        state={state}
      />,
    );

    const selector = screen.getByLabelText(
      "Selected week",
    ) as HTMLSelectElement;
    expect(selector.options).toHaveLength(14);
    expect(screen.getByRole("heading", { name: "Week 1" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Week 14" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Week 2" })).toBeVisible();
  });

  it("uses the same dense LeagueScoreboard family for explicit context labels", () => {
    const { container } = render(
      <LeagueScoreboard
        games={[
          {
            id: "live",
            sideAName: "Live Member",
            sideBName: "Simulation Member",
            sideAScoreCenticredits: 12_000,
            sideBScoreCenticredits: null,
            state: "Live",
            competition: "Regular season",
            selected: true,
          },
          {
            id: "archive",
            sideAName: "Archive Member",
            sideBName: "Exhibition Member",
            sideAScoreCenticredits: 0,
            sideBScoreCenticredits: 10_000,
            state: "Exhibition miss · Archive final · Archived",
            competition: "Week 18 exhibition",
            selected: false,
          },
        ]}
        leagueSlug="context-league"
        week={18}
      />,
    );

    expect(screen.getByText("Live", { exact: true })).toBeVisible();
    expect(screen.getByText("Week 18 exhibition")).toBeVisible();
    expect(
      screen.getByText("Exhibition miss · Archive final · Archived"),
    ).toBeVisible();
    expect(container.querySelectorAll("ol > li")).toHaveLength(2);
  });

  it("presents corrected receipt facts before technical Audit details", () => {
    const { state } = makePhase6State("CORRECTED");
    const receipt = state.ownerCard!.positions[0]!;
    const { container } = render(
      <Stage1ReceiptView receiptId={receipt.id} state={state} />,
    );

    expect(screen.getByText("Receipt summary")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Accepted pick" }),
    ).toBeVisible();
    expect(screen.getByText("Line").nextElementSibling).toHaveTextContent(
      "Moneyline",
    );
    expect(
      screen.getAllByText("Corrected", { exact: true }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Official correction applied")).toBeVisible();
    const technicalHash = screen.getByText(receipt.receiptHash);
    expect(technicalHash.closest("details")).toContainElement(
      screen.getByText("Audit details"),
    );
    const summary = screen.getByText("Receipt summary");
    expect(
      summary.compareDocumentPosition(technicalHash) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container.textContent).toContain(
      "immutable receipt remain unchanged",
    );
  });

  it("scopes an archived card correction to a receipt for the corrected event", () => {
    const viewerGame = exampleSeasonArchive.week18.find((game) =>
      game.cards.some(
        (card) => card.entryId === exampleSeasonArchive.viewerEntryId,
      ),
    )!;
    const viewerCard = viewerGame.cards.find(
      (card) => card.entryId === exampleSeasonArchive.viewerEntryId,
    )!;
    const unrelatedEvent = exampleSeasonArchive.week18.find(
      (game) => game.id !== viewerGame.id,
    )!.cards[0].receipts[0]!.eventId;
    const { rerender } = render(
      <SeasonArchiveMyCard archive={archiveWithCorrection(unrelatedEvent)} />,
    );

    expect(screen.queryByText("Corrected · Archived")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/A documented correction changed the official result/),
    ).not.toBeInTheDocument();

    rerender(
      <SeasonArchiveMyCard
        archive={archiveWithCorrection(viewerCard.receipts[0]!.eventId)}
      />,
    );
    expect(screen.getByText("Corrected · Archived")).toBeVisible();
    expect(
      screen.getByText(/A documented correction changed the official result/),
    ).toBeVisible();
  });

  it("labels only the archived matchup whose receipts use a corrected event", () => {
    const correctedEvent =
      exampleSeasonArchive.week18[0]!.cards[0].receipts[0]!.eventId;
    render(
      <SeasonArchiveSchedule archive={archiveWithCorrection(correctedEvent)} />,
    );

    expect(
      screen.getAllByText("Corrected · Archive final · Archived"),
    ).toHaveLength(1);
    expect(
      screen.getAllByText("Final · Archive final · Archived"),
    ).toHaveLength(exampleSeasonArchive.week18.length - 1);
  });
});
