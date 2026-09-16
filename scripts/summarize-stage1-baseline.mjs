import { readFileSync, writeFileSync } from "node:fs";
const rows = readFileSync("acceptance-reports/stage1-samples.jsonl", "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));
const groups = new Map();
for (const row of rows) {
  const key = `${row.condition} / ${row.action}`;
  groups.set(key, [...(groups.get(key) ?? []), row]);
}
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const summary = [...groups].map(([condition, values]) => ({
  condition,
  n: values.length,
  medianMs: median(values.map((x) => x.ms)),
  minMs: Math.min(...values.map((x) => x.ms)),
  maxMs: Math.max(...values.map((x) => x.ms)),
  medianRpcCount: median(values.map((x) => x.queries.length)),
  medianBrowserBytes: median(
    values.map((x) =>
      x.browserRequests.reduce((sum, r) => sum + (r.bytes ?? 0), 0),
    ),
  ),
  providerCalls: values.map((x) => x.providerCalls.length),
}));
for (const row of summary)
  if (row.n !== (row.condition.endsWith("expired-review-recovery") ? 1 : 5))
    throw new Error(`Incomplete samples: ${row.condition}`);
writeFileSync(
  "acceptance-reports/stage1-summary.json",
  JSON.stringify({ sampleCount: rows.length, summary }, null, 2),
);
writeFileSync(
  "acceptance-reports/stage1-summary.md",
  [
    "# Stage 1 disposable baseline",
    "",
    "Production build, substituted provider responses. Cold means a fresh authenticated browser context; app/database processes are already running. Mobile: Chromium 390×844, DPR 3, 150 ms latency, 1.6 Mbps down / 750 Kbps up, 4× CPU slowdown. Desktop: Chromium 1440×900, unthrottled. No physical-device or real-provider latency claim. Five samples support median/range, not percentiles. Bytes are per-request browser response sizes; RPC timings remain distinct from the database plans. LCP/layout shift/event/long-task observations in raw JSON are lab observations, not field Core Web Vitals.",
    "",
    "| Condition / action | n | Median ms | Range ms | Median RPCs | Median browser bytes |",
    "|---|---:|---:|---:|---:|---:|",
    ...summary.map(
      (x) =>
        `| ${x.condition} | ${x.n} | ${x.medianMs} | ${x.minMs}–${x.maxMs} | ${x.medianRpcCount} | ${x.medianBrowserBytes} |`,
    ),
    "",
  ].join("\n"),
);
console.log(
  `Stage 1 baseline: ${rows.length} observations in ${summary.length} conditions/actions.`,
);
