import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { CardTray } from "@/components/card/card-tray";
import { LeagueShell } from "@/components/league/league-shell";
import { PageFrame } from "@/components/league/page-frame";
import { ScheduleNavigator } from "@/components/league/schedule-navigator";
import { StandingsTable } from "@/components/league/standings-table";
import { PairedMatchupView } from "@/components/matchup/paired-matchup-view";
import { makePhase6Matchup } from "../fixtures/phase6-paired-matchup";

const navigationState = vi.hoisted(() => ({
  pathname: "/l/phase-10/matchup",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
}));

vi.mock("@/app/(auth)/auth/actions", () => ({
  signOutAction: vi.fn(),
}));

const outputPath = resolve("tests/e2e/generated/phase10-markup.json");
const longLeagueName =
  "The Extraordinarily Long Sunday Ledger Clubhouse Association";

function shell(pathname: string, children: ReactNode, phaseLabel: string) {
  navigationState.pathname = pathname;
  return renderToStaticMarkup(
    <LeagueShell
      cardStatusLabel="1,000 / 1,000 used"
      isCommissioner
      leagueName={longLeagueName}
      leagueSlug="phase-10"
      memberName="Alexandra Ledger With A Long Member Name"
      memberRole="Commissioner"
      mode="LIVE"
      nflYear={2026}
      phaseLabel={phaseLabel}
      week={18}
    >
      {children}
    </LeagueShell>,
  );
}

test("writes deterministic Phase 10 navigation and dense-record markup", () => {
  const live = makePhase6Matchup("LIVE");
  const matchup = shell(
    "/l/phase-10/matchup",
    <>
      <PairedMatchupView matchup={live} refreshControl={null} />
      <CardTray
        aboveMobileNavigation
        allocatedCredits={650}
        onReview={() => undefined}
        pickCount={3}
        remainingCredits={350}
      />
    </>,
    "Matchup live",
  );

  const standings = shell(
    "/l/phase-10/standings",
    <PageFrame
      eyebrow="Official league record"
      title="Standings"
      description="Decisive standings facts remain visible at every width."
    >
      <StandingsTable
        caption="Phase 10 visual standings"
        rows={[
          {
            entryId: "self",
            rank: 1,
            memberName: "Alexandra Ledger With A Long Member Name",
            wins: 10,
            losses: 3,
            ties: 1,
            pointsForCenticredits: 123_456,
            attendanceMisses: 0,
            playoffEligible: true,
            inPlayoffField: true,
            current: true,
          },
          {
            entryId: "rival",
            rank: 2,
            memberName: "A Rival Club With Another Deliberately Long Name",
            wins: 8,
            losses: 6,
            ties: 0,
            pointsForCenticredits: 101_010,
            attendanceMisses: 1,
            playoffEligible: true,
            inPlayoffField: false,
            current: false,
          },
        ]}
        playoffIneligibilityAtMisses={3}
      />
    </PageFrame>,
    "Archive final",
  );

  const schedule = shell(
    "/l/phase-10/schedule",
    <PageFrame
      eyebrow="Selected week"
      title="Schedule"
      description="One selected week, with postseason and archive labels intact."
    >
      <ScheduleNavigator
        initialWeek={18}
        weeks={[
          {
            week: 17,
            label: "Week 17 · Playoffs",
            status: "Champion final · Archive final",
            matchups: [],
          },
          {
            week: 18,
            label: "Week 18 · Exhibition",
            status: "Exhibition final · Archived",
            matchups: [
              {
                id: "week-18",
                sideAName: "Alexandra Ledger With A Long Member Name",
                sideBName: "A Rival Club With Another Deliberately Long Name",
                sideAScoreCenticredits: 0,
                sideBScoreCenticredits: 20_000,
                status: "Exhibition miss · Archive final · Archived",
                competition: "Week 18 exhibition",
                currentMember: true,
                sideBWinner: true,
              },
            ],
          },
        ]}
      />
    </PageFrame>,
    "Week 18 exhibition",
  );

  expect(matchup).toContain("Mobile league navigation");
  expect(matchup).toContain("broadcast-dark");
  expect(standings).toContain('aria-current="page"');
  expect(schedule).toContain("Exhibition miss · Archive final · Archived");

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify({ matchup, schedule, standings }));
});
