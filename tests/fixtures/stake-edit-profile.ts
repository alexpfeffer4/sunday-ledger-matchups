import { appendFileSync } from "node:fs";
import type { Page } from "@playwright/test";

/** Separate, disposable-only CPU profile. Keep the retained journey timings
 * outside profiler overhead. No production instrumentation or raw page data.
 */
export async function profileStakeTyping(
  page: Page,
  condition: string,
  run: number,
) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
  await cdp.send("Profiler.start");
  try {
    const started = performance.now();
    const input = page.getByLabel("Stake in credits");
    await input.fill("");
    await input.pressSequentially("50", { delay: 50 });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const wallMs = Math.round(performance.now() - started);
    const { profile } = await cdp.send("Profiler.stop");
    // Function/source positions are diagnostic metadata, never input values,
    // DOM, localStorage, request bodies or authentication state.
    const nodes = new Map(profile.nodes.map((n) => [n.id, n.callFrame]));
    const totals = new Map<number, number>();
    for (let i = 0; i < (profile.samples?.length ?? 0); i++) {
      const id = profile.samples![i];
      totals.set(id, (totals.get(id) ?? 0) + (profile.timeDeltas?.[i] ?? 0));
    }
    const frames = [...totals]
      .map(([id, us]) => {
        const frame = nodes.get(id)!;
        return {
          function: frame.functionName,
          source: frame.url
            ? new URL(frame.url, "http://127.0.0.1").pathname
            : "",
          line: frame.lineNumber,
          column: frame.columnNumber,
          sampledMs: us / 1000,
        };
      })
      .sort((a, b) => b.sampledMs - a.sampledMs);
    appendFileSync(
      "acceptance-reports/stage3-stake-profile.jsonl",
      JSON.stringify({
        condition,
        run,
        wallMs,
        inputCount: 2,
        deliberateInterKeyDelayMs: 50,
        samplingIntervalUs: 1000,
        frames,
      }) + "\n",
    );
  } finally {
    await cdp.send("Profiler.disable");
    await cdp.detach();
  }
}
