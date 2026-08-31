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
  const live = makePhase6Matchup("FINAL");
  const simulation = {
    ...live,
    league: {
      ...live.league,
      name: "Deterministic Sunday League",
      mode: "SIMULATION" as const,
    },
  };
  const markup = renderToStaticMarkup(
    <PairedMatchupView matchup={simulation} refreshControl={null} />,
  );

  expect(markup).toContain("Simulation");
  expect(markup).toContain(">Final<");
  expect(markup).toContain("Position ledger");
  expect(markup).not.toMatch(/Practice|Example Season/);
  expect(markup).not.toContain("SECRET FUTURE OPPONENT PICK");

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify({ matchup: markup }));
});
