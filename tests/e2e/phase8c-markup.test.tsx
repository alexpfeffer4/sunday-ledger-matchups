import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { PairedMatchupView } from "@/components/matchup/paired-matchup-view";
import { makePhase6Matchup } from "../fixtures/phase6-paired-matchup";

const outputPath = resolve(
  "tests/e2e/generated/phase8c-simulation-markup.json",
);

test("renders authoritative Simulation through the shared matchup component", () => {
  const asSimulation = (phase: "FINAL" | "LOCKED") => {
    const live = makePhase6Matchup(phase);
    return {
      ...live,
      league: {
        ...live.league,
        name: "Deterministic Sunday League",
        mode: "SIMULATION" as const,
      },
    };
  };
  const simulation = asSimulation("FINAL");
  const sealedSimulation = asSimulation("LOCKED");
  const matchup = renderToStaticMarkup(
    <PairedMatchupView matchup={simulation} refreshControl={null} />,
  );
  const sealedMatchup = renderToStaticMarkup(
    <PairedMatchupView matchup={sealedSimulation} refreshControl={null} />,
  );

  expect(matchup).toContain("Simulation");
  expect(matchup).toContain("Practice/test");
  expect(matchup).toContain(">Final<");
  expect(matchup).toContain("Position ledger");
  expect(matchup).not.toContain("Example Season");
  expect(matchup).not.toContain("SECRET FUTURE OPPONENT PICK");
  expect(sealedMatchup).toContain("Future picks sealed");
  expect(sealedMatchup).not.toContain("SECRET FUTURE OPPONENT PICK");

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify({ matchup, sealedMatchup }));
});
