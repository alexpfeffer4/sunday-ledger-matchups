import { appendFileSync, mkdirSync } from "node:fs";
import { type Page, type TestInfo } from "@playwright/test";
import { measure } from "./release-measurements";

// Bounded lab instrumentation. No app instrumentation or remote telemetry.
export async function observe(page: Page) {
  await page.addInitScript(() => {
    const metrics: {
      type: string;
      start: number;
      duration: number;
      value?: number;
      interactionId?: number;
    }[] = [];
    Object.assign(window, { stage1Metrics: metrics });
    for (const type of [
      "longtask",
      "largest-contentful-paint",
      "layout-shift",
      "event",
    ]) {
      if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const data = entry as PerformanceEntry & {
            value?: number;
            hadRecentInput?: boolean;
            interactionId?: number;
          };
          if (type === "layout-shift" && data.hadRecentInput) continue;
          metrics.push({
            type,
            start: entry.startTime,
            duration: entry.duration,
            value: data.value,
            interactionId: data.interactionId,
          });
        }
      }).observe({
        type,
        buffered: true,
        ...(type === "event" ? { durationThreshold: 16 } : {}),
      });
    }
  });
}
export async function sample(
  page: Page,
  info: TestInfo,
  condition: string,
  run: number,
  name: string,
  action: () => Promise<void>,
) {
  const before = await page.evaluate(() => ({
    origin: performance.timeOrigin,
    now: performance.now(),
  }));
  const browserRequests: {
    path: string;
    bytes: number | null;
    status: number;
  }[] = [];
  const pending: Promise<void>[] = [];
  const listener = (response: import("@playwright/test").Response) => {
    pending.push(
      (async () => {
        const sizes = await response
          .request()
          .sizes()
          .catch(() => null);
        browserRequests.push({
          path: new URL(response.url()).pathname,
          bytes: sizes
            ? sizes.responseBodySize + sizes.responseHeadersSize
            : null,
          status: response.status(),
        });
      })(),
    );
  };
  page.on("response", listener);
  try {
    const timing = await measure(info, `${condition}-${run}-${name}`, action);
    // Let queued observer callbacks describe the completed visible frame.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const browser = await page.evaluate(({ origin, now }) => {
      const lower = origin === performance.timeOrigin ? now : 0;
      const data =
        (
          window as unknown as {
            stage1Metrics: {
              type: string;
              start: number;
              duration: number;
              value?: number;
              interactionId?: number;
            }[];
          }
        ).stage1Metrics ?? [];
      return {
        supported: PerformanceObserver.supportedEntryTypes,
        observations: data.filter((x) => x.start >= lower),
        navigation: performance
          .getEntriesByType("navigation")
          .map((x) => x.toJSON()),
        resources: performance
          .getEntriesByType("resource")
          .filter((x) => x.startTime >= lower)
          .map((entry) => {
            const r = entry as PerformanceResourceTiming;
            return {
              path: new URL(r.name).pathname,
              type: r.initiatorType,
              duration: r.duration,
              transferSize: r.transferSize,
              encodedBodySize: r.encodedBodySize,
            };
          }),
      };
    }, before);
    page.off("response", listener);
    await Promise.all(pending);
    const result = {
      ...timing,
      action: name,
      condition,
      run,
      browser,
      browserRequests,
    };
    mkdirSync("acceptance-reports", { recursive: true });
    appendFileSync(
      "acceptance-reports/stage1-samples.jsonl",
      JSON.stringify(result) + "\n",
    );
    return result;
  } finally {
    page.off("response", listener);
  }
}
