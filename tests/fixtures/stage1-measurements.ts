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
  let sealed = false;
  const listener = (response: import("@playwright/test").Response) => {
    const row = {
      path: new URL(response.url()).pathname,
      bytes: null as number | null,
      status: response.status(),
    };
    browserRequests.push(row);
    pending.push(
      (async () => {
        const sizes = await response
          .request()
          .sizes()
          .catch(() => null);
        if (!sealed && sizes)
          row.bytes = sizes.responseBodySize + sizes.responseHeadersSize;
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
    // Playwright sizes() has no timeout and may await an unfinished RSC prefetch.
    // Bound bookkeeping after the visible action; unavailable sizes stay null.
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.all(pending),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 1000);
      }),
    ]);
    clearTimeout(timer);
    sealed = true;
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
    sealed = true;
    page.off("response", listener);
  }
}
