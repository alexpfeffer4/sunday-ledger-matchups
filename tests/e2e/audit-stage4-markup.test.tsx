import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { test, expect, vi } from "vitest";
import { PlayoffPendingView } from "@/components/playoffs/playoff-pending-view";
import { LivePlayoffView } from "@/components/playoffs/live-playoff-view";
import { StandingsTable } from "@/components/league/standings-table";
import { PageFrame } from "@/components/league/page-frame";
import { WeeklyCloseModule } from "@/components/history/weekly-close-module";
import { PairedMatchupView } from "@/components/matchup/paired-matchup-view";
import { projectSeasonMemory } from "@/domain/history/project-season-memory";
import { phase8aPlayoffState } from "../fixtures/phase8a-playoff-state";
import {
  makePhase6Matchup,
  makePhase6State,
} from "../fixtures/phase6-paired-matchup";
import { makePhase7State } from "../fixtures/phase7-season-memory";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));

const output = resolve("tests/e2e/generated/audit-stage4-markup.json");
function playoff(
  variant:
    "ordinary" | "sparse" | "unavailable" | "tie" | "nonqualifier" | "four",
) {
  const state = structuredClone(phase8aPlayoffState);
  let viewerEntryId = state.publication.qualifiers[0].entryId;
  if (variant === "sparse")
    return (
      <LivePlayoffView
        state={state}
        viewerEntryId={viewerEntryId}
        activeWeek={15}
      />
    );
  state.publication.qualifiers = state.publication.standings
    .slice(0, 6)
    .map((entry, index) => ({
      ...entry,
      attendanceMisses: 0,
      qualificationSeed: index + 1,
      regularSeasonSeed: index + 1,
      eligibilityStatus: "ELIGIBLE",
      selectionReason: "ELIGIBLE_STANDINGS",
      attendanceMissesUsedByQualification: 0,
    }));
  state.publication.actualQualifierCount = 6;
  state.publication.standings.slice(0, 6).forEach((entry) => {
    entry.attendanceMisses = 0;
  });
  if (state.publication.bracket.format === "SIX_SLOT") {
    state.publication.bracket.slots = state.publication.qualifiers.map(
      (entry, index) => ({ slot: index + 1, state: "OCCUPIED", entry }),
    );
    state.publication.bracket.automaticWeek15Advancements =
      state.publication.bracket.automaticWeek15Advancements.slice(0, 2);
  }
  const next = structuredClone(state.rounds[0]);
  next.id = "week16";
  next.week = 16;
  next.state = "OPEN";
  next.matchups.forEach((m) => {
    m.result = null;
  });
  const second = next.matchups[0].sideB;
  next.matchups[0].sideB = next.matchups[1].sideB;
  next.matchups[1].sideB = second;
  next.matchups[1].role = "CHAMPIONSHIP";
  next.matchups[1].scope = "PLAYOFF";
  next.matchups[1].byeExhibition = false;
  next.matchups[1].label = "Semifinal";
  next.matchups[0].role = "CHAMPIONSHIP";
  next.matchups[0].scope = "PLAYOFF";
  next.matchups[0].byeExhibition = false;
  next.matchups[0].label = "Semifinal";
  next.matchups[0].sideA.displayName =
    "Alexandra Ledger With A Deliberately Long Member Name";
  next.matchups[0].sideB.displayName =
    "Jordan Rival With Another Deliberately Long Member Name";
  state.rounds.push(next);
  state.publication.qualifiers.forEach((q) => {
    q.selectionReason = "ELIGIBLE_STANDINGS";
    q.eligibilityStatus = "ELIGIBLE";
  });
  if (variant === "tie") {
    next.state = "FINAL";
    next.matchups[0].result = {
      id: "result",
      status: "FINAL",
      sideADecision: "TIE",
      sideBDecision: "TIE",
      sideAScoreCenticredits: 150000,
      sideBScoreCenticredits: 150000,
      sideAParticipation: "COMPLETED",
      sideBParticipation: "COMPLETED",
      advancingEntryId: viewerEntryId,
    };
  }
  if (variant === "four" && state.publication.bracket.format === "SIX_SLOT") {
    state.publication.qualifiers = state.publication.qualifiers.slice(0, 4);
    state.publication.actualQualifierCount = 4;
    state.publication.expectedQualifierCount = 4;
    state.publication.bracket = {
      ...state.publication.bracket,
      format: "FOUR_SLOT",
      maximumFieldSize: 4,
      slots: state.publication.bracket.slots.slice(0, 4),
    };
  }
  if (variant === "nonqualifier")
    viewerEntryId = state.publication.standings[8].entryId;
  return (
    <LivePlayoffView
      state={state}
      viewerEntryId={viewerEntryId}
      activeWeek={variant === "unavailable" ? 17 : 16}
    />
  );
}
function finalResult(decision: "WIN" | "LOSS" | "TIE", corrected = false) {
  const matchup = makePhase6Matchup(corrected ? "CORRECTED" : "FINAL");
  matchup.self.decision = decision;
  matchup.resultStatus = "FINAL";
  matchup.opponent.decision =
    decision === "WIN" ? "LOSS" : decision === "LOSS" ? "WIN" : "TIE";
  matchup.self.scoreCenticredits = decision === "LOSS" ? 20000 : 40000;
  matchup.opponent.scoreCenticredits = decision === "WIN" ? 20000 : 40000;
  matchup.rows.SETTLED.forEach((row, index) => {
    const total =
      row.side === "SELF"
        ? matchup.self.scoreCenticredits
        : matchup.opponent.scoreCenticredits;
    row.returnedCenticredits = total === 40000 || index >= 2 ? 20000 : 0;
    row.outcome = row.returnedCenticredits ? "WIN" : "LOSS";
  });
  matchup.scoreboard[0].sideAScoreCenticredits = matchup.self.scoreCenticredits;
  matchup.scoreboard[0].sideBScoreCenticredits =
    matchup.opponent.scoreCenticredits;
  const memory = projectSeasonMemory(makePhase7State());
  const bridge = memory.recordBridge!;
  bridge.matchup.nflWeek = matchup.week.nflWeek;
  bridge.matchup.status = "FINAL";
  bridge.matchup.self.name = matchup.self.displayName;
  bridge.matchup.opponent.name = matchup.opponent.displayName;
  bridge.before = {
    ...bridge.before!,
    wins: 0,
    losses: 0,
    ties: 0,
    seed: null,
    pointsForCenticredits: 0,
  };
  bridge.after = {
    ...bridge.after!,
    wins: decision === "WIN" ? 1 : 0,
    losses: decision === "LOSS" ? 1 : 0,
    ties: decision === "TIE" ? 1 : 0,
    seed: decision === "LOSS" ? 2 : 1,
    pointsForCenticredits: matchup.self.scoreCenticredits,
  };
  matchup.self.record =
    decision === "WIN" ? "1–0" : decision === "LOSS" ? "0–1" : "0–0–1";
  matchup.self.seed = bridge.after.seed;
  matchup.opponent.record =
    decision === "WIN" ? "0–1" : decision === "LOSS" ? "1–0" : "0–0–1";
  matchup.opponent.seed = decision === "LOSS" ? 1 : 2;
  bridge.nextOpponent!.nflWeek = 2;
  bridge.correctionWindowClosesAt = "2026-09-16T16:00:00Z";
  bridge.matchup.corrections = corrected
    ? [
        {
          id: "correction",
          eventLabel: "Harbor Club at Lake Club",
          reason: "Official score correction",
          actorName: "Commissioner Morgan",
          correctedAt: "2026-09-15T16:00:00Z",
          beforeEvent: "20–17",
          afterEvent: "20–20",
          beforeSideAScoreCenticredits: 30000,
          afterSideAScoreCenticredits: 40000,
          beforeSideBScoreCenticredits: 20000,
          afterSideBScoreCenticredits: 20000,
        },
      ]
    : [];
  return (
    <PairedMatchupView
      matchup={matchup}
      refreshControl={null}
      weeklyClose={
        <WeeklyCloseModule
          bridge={bridge}
          cutline={memory.playoffCutline}
          leagueSlug="sunday-ledger"
          presentation="supporting"
        />
      }
    />
  );
}
test("renders Stage 4 result, long standings, and playoff states for browser verification", () => {
  const views = {
    prequalification: (
      <PlayoffPendingView state={makePhase6State("PREGAME").state} />
    ),
    ordinary: playoff("ordinary"),
    sparse: playoff("sparse"),
    unavailable: playoff("unavailable"),
    playoffTie: playoff("tie"),
    nonqualifier: playoff("nonqualifier"),
    four: playoff("four"),
    won: finalResult("WIN"),
    lost: finalResult("LOSS"),
    tied: finalResult("TIE"),
    corrected: finalResult("WIN", true),
    standings: (
      <PageFrame eyebrow="Official record" title="Standings">
        <StandingsTable
          caption="Official standings"
          playoffIneligibilityAtMisses={3}
          rows={Array.from({ length: 16 }, (_, i) => ({
            entryId: `member-${i}`,
            rank: i + 1,
            memberName:
              i === 0
                ? "Alexandra Ledger With A Deliberately Long Member Name"
                : i === 4
                  ? "SupercalifragilisticexpialidociousClubhouseMember"
                  : `Ledger Member ${i + 1}`,
            wins: 14 - (i % 10),
            losses: i % 10,
            ties: 0,
            pointsForCenticredits: 2234567 - i * 32311,
            attendanceMisses: i === 7 ? 3 : i === 5 ? 1 : 0,
            playoffEligible: i !== 7,
            inPlayoffField: i < 6,
            current: i === 0,
          }))}
        />
      </PageFrame>
    ),
  };
  const markup = Object.fromEntries(
    Object.entries(views).map(([key, value]) => [
      key,
      renderToStaticMarkup(value),
    ]),
  );
  expect(markup.unavailable).toContain("Your playoff matchup is unavailable");
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(markup));
});
