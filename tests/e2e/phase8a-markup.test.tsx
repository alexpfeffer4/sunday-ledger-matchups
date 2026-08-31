import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { LivePlayoffView } from "@/components/playoffs/live-playoff-view";
import { phase8aPlayoffState } from "../fixtures/phase8a-playoff-state";

const outputPath = resolve("tests/e2e/generated/phase8a-playoff-markup.json");

test("writes deterministic Phase 8A browser fixture markup", () => {
  const markup = renderToStaticMarkup(
    <LivePlayoffView state={phase8aPlayoffState} />,
  );
  expect(markup).toContain(
    "Reinstated to complete the four-member championship field",
  );
  expect(markup).toContain("Exhibition miss");
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify({ PLAYOFFS: markup }));
});
