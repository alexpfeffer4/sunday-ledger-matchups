import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { Stage1CardView } from "@/components/stage1/live-views";
import type { PairedMatchupDto } from "@/application/queries/project-paired-matchup";
import { PairedMatchupView } from "@/components/matchup/paired-matchup-view";
import {
  makePhase6LiveUpdate,
  makePhase6Matchup,
  makePhase6State,
} from "../fixtures/phase6-paired-matchup";

vi.mock("server-only", () => ({}));

const outputPath = resolve("tests/e2e/generated/phase6-matchup-markup.json");

function renderMatchup(matchup: PairedMatchupDto): string {
  return renderToStaticMarkup(
    <PairedMatchupView
      matchup={matchup}
      refreshControl={
        <button
          className="bg-registry text-canvas min-h-11 rounded-lg px-4 text-sm font-semibold"
          type="button"
        >
          Refresh matchup
        </button>
      }
    />,
  );
}

test("writes deterministic Phase 6 browser fixture markup", () => {
  const unsealed = makePhase6Matchup("PREGAME");
  unsealed.opponent.cardStatus = "Not sealed";
  const outstanding = makePhase6Matchup("PARTIAL_REVEAL");
  outstanding.self.outstanding = { picks: 2, credits: 300 };
  outstanding.opponent.outstanding = { picks: 4, credits: 600 };
  const receiptState = makePhase6State("PREGAME").state;
  receiptState.ownerCard!.positions.forEach((position, index) => {
    position.eventLabel = "Atlanta Falcons at Pittsburgh Steelers";
    position.proposition = "Pittsburgh Steelers to win";
    position.marketType = "MONEYLINE";
    position.lineMilli = null;
    position.americanOdds = index === 0 ? -265 : 1234;
  });
  const stress = makePhase6Matchup("LIVE");
  stress.self.displayName = "Alexandria Montgomery-Wellington";
  stress.opponent.displayName = "Christopher Van Der Linden";
  const base = stress.rows.IN_PROGRESS[0]!;
  stress.rows = {
    SETTLED: [],
    REMAINING: [],
    IN_PROGRESS: [
      ...Array.from({ length: 20 }, (_, index) => ({
        ...base,
        id: `stress-${index}`,
        side: "SELF" as const,
        memberName: stress.self.displayName,
        proposition: "Pittsburgh Steelers −3.5",
        marketType: "SPREAD" as const,
      })),
      {
        ...base,
        id: "stress-opponent",
        side: "OPPONENT",
        memberName: stress.opponent.displayName,
        proposition: "Atlanta Falcons +3.5",
        marketType: "SPREAD",
      },
    ],
  };
  const markup = {
    STRESS: renderMatchup(stress),
    PREGAME: renderMatchup(makePhase6Matchup("PREGAME")),
    UNSEALED: renderMatchup(unsealed),
    OUTSTANDING: renderMatchup(outstanding),
    MOBILE_CARD: renderToStaticMarkup(<Stage1CardView state={receiptState} />),
    FINAL: renderMatchup(makePhase6Matchup("FINAL")),
    LIVE: renderMatchup(makePhase6Matchup("LIVE")),
    LIVE_UPDATE: renderMatchup(makePhase6LiveUpdate()),
    PARTIAL_REVEAL: renderMatchup(makePhase6Matchup("PARTIAL_REVEAL")),
    PROVISIONAL: renderMatchup(makePhase6Matchup("PROVISIONAL")),
  };

  expect(markup.PARTIAL_REVEAL).toContain("future-sealed-placeholder");
  expect(markup.LIVE).toContain("Refresh matchup");

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(markup));
});
