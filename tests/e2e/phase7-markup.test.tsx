import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { HistoryLedger } from "@/components/history/history-ledger";
import { RivalryHeader } from "@/components/history/rivalry-header";
import { WeeklyCloseModule } from "@/components/history/weekly-close-module";
import { BrandedRouteState } from "@/components/ui/branded-route-state";
import {
  projectRivalry,
  projectSeasonMemory,
} from "@/domain/history/project-season-memory";
import { makePhase7State, phase7Ids } from "../fixtures/phase7-season-memory";

const outputPath = resolve("tests/e2e/generated/phase7-memory-markup.json");

function weeklyClose(corrected: boolean): string {
  const state = makePhase7State();
  if (corrected) {
    const current = state.matchups.find(
      (matchup) => matchup.id === phase7Ids.matchup2,
    );
    if (!current) throw new Error("Missing corrected browser fixture.");
    current.result = null;
  }
  const memory = projectSeasonMemory(state);
  if (!memory.recordBridge) throw new Error("Missing browser RecordBridge.");
  return renderToStaticMarkup(
    <main className="bg-canvas min-h-screen p-4">
      <WeeklyCloseModule
        bridge={memory.recordBridge}
        cutline={memory.playoffCutline}
        leagueSlug="sunday-ledger"
      />
    </main>,
  );
}

test("writes deterministic Phase 7 browser fixture markup", () => {
  const state = makePhase7State();
  const memory = projectSeasonMemory(state);
  const rivalry = projectRivalry(memory, phase7Ids.entryA, phase7Ids.entryB);
  if (!rivalry) throw new Error("Missing browser rivalry fixture.");

  const emptyState = makePhase7State();
  for (const matchup of emptyState.matchups) {
    if (matchup.seasonId === emptyState.season.id) matchup.result = null;
  }

  const markup = {
    CORRECTED: weeklyClose(true),
    EMPTY: renderToStaticMarkup(
      <HistoryLedger
        leagueSlug="sunday-ledger"
        memory={projectSeasonMemory(emptyState)}
      />,
    ),
    ERROR: renderToStaticMarkup(
      <BrandedRouteState
        backHref="/leagues"
        backLabel="Return to Your leagues"
        description="This league page did not load. Accepted picks, receipts, and league records are unchanged."
        eyebrow="League unavailable"
        title="We could not open this league page"
      />,
    ),
    HISTORY: renderToStaticMarkup(
      <HistoryLedger leagueSlug="sunday-ledger" memory={memory} />,
    ),
    PROVISIONAL: weeklyClose(false),
    RIVALRY: renderToStaticMarkup(
      <RivalryHeader leagueName="Sunday Ledger" rivalry={rivalry} />,
    ),
  };

  expect(markup.CORRECTED).toContain("Corrected final");
  expect(markup.EMPTY).toContain("No finalized matchups yet");
  expect(markup.RIVALRY).toContain("Exhibition");

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(markup));
});
