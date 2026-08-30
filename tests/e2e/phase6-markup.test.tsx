import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { PairedMatchupDto } from "@/application/queries/project-paired-matchup";
import { PairedMatchupView } from "@/components/matchup/paired-matchup-view";
import {
  makePhase6LiveUpdate,
  makePhase6Matchup,
} from "../fixtures/phase6-paired-matchup";

const outputPath = resolve("test-results/phase6-matchup-markup.json");

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
  const markup = {
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
