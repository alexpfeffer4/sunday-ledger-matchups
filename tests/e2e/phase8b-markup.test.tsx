import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { LivePlayoffView } from "@/components/playoffs/live-playoff-view";
import {
  championFinalState,
  correctedChampionState,
  finalArchiveState,
  frozenWeek18State,
  week18OpenState,
} from "../fixtures/phase8b-finality";

const outputPath = resolve("tests/e2e/generated/phase8b-finality-markup.json");

test("writes deterministic Phase 8B browser fixture markup", () => {
  const states = {
    championFinal: renderToStaticMarkup(
      <LivePlayoffView state={championFinalState} />,
    ),
    week18Open: renderToStaticMarkup(
      <LivePlayoffView state={week18OpenState} />,
    ),
    frozenPairing: renderToStaticMarkup(
      <LivePlayoffView state={frozenWeek18State} />,
    ),
    correctedChampion: renderToStaticMarkup(
      <LivePlayoffView state={correctedChampionState} />,
    ),
    finalArchive: renderToStaticMarkup(
      <LivePlayoffView state={finalArchiveState} />,
    ),
  };

  expect(states.championFinal).toContain("Champion final · Week 18 next");
  expect(states.week18Open).toContain(
    "Pairing remains replaceable until the first card seals",
  );
  expect(states.frozenPairing).toContain(
    "Pairing frozen · protected from later corrections",
  );
  expect(states.correctedChampion).toContain("superseded and retained");
  expect(states.finalArchive).toContain(
    "complete Weeks 1–18 archive are final",
  );

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(states));
});
