import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Deterministic coverage arithmetic only: no provider, database or credentials.
 * Each event: { id, opensAt, cutoff, families: string[] }. Duplicate leagues
 * union public families. Future published identities are an explicit upper bound.
 * Quarter-hour fixture grid excludes the cutoff; the real dispatcher adds <=5m
 * under normal capacity. No reuse or retries are assumed.
 */
export function estimateSchedule({ now, resetAt, events, multiplier = 1 }) {
  const start = Date.parse(now),
    end = Date.parse(resetAt);
  if (
    !Number.isFinite(start + end) ||
    end <= start ||
    end - start > 62 * 86400000
  )
    throw new Error("Use a valid remaining provider cycle of at most 62 days");
  if (!Number.isInteger(multiplier) || multiplier < 1 || multiplier > 24)
    throw new Error("Cadence multiplier must be 1..24");
  const union = new Map();
  for (const event of events) {
    const opens = Date.parse(event.opensAt),
      cutoff = Date.parse(event.cutoff);
    if (!Number.isFinite(opens + cutoff)) throw new Error("Invalid schedule");
    const previous = union.get(event.id);
    if (previous && previous.cutoff !== cutoff)
      throw new Error("Conflicting public cutoffs");
    union.set(event.id, {
      opens: Math.min(opens, previous?.opens ?? opens),
      cutoff,
      families: new Set([...(previous?.families ?? []), ...event.families]),
    });
  }
  const lastProps = new Map(),
    lastMain = new Map(),
    days = {};
  let main = 0,
    props = 0;
  for (let t = Math.ceil(start / 900000) * 900000; t < end; t += 900000) {
    const active = [...union].filter(([, e]) => e.opens <= t && e.cutoff > t);
    const fastMain = active.some(([, e]) => e.cutoff - t <= 6 * 3600000);
    const dueMain = active.filter(
      ([id]) =>
        t - (lastMain.get(id) ?? -Infinity) >=
        (fastMain ? 15 : 60) * 60000 * multiplier,
    );
    let spent = 0;
    if (dueMain.length) {
      const cost = Math.ceil(dueMain.length / 32) * 3;
      main += cost;
      spent += cost;
      for (const [id] of dueMain) lastMain.set(id, t);
    }
    for (const [id, event] of active) {
      for (const family of event.families) {
        const key = `${id}:${family}`;
        if (
          t - (lastProps.get(key) ?? -Infinity) >=
          (event.cutoff - t <= 24 * 3600000 ? 60 : 360) * 60000 * multiplier
        ) {
          props++;
          spent++;
          lastProps.set(key, t);
        }
      }
    }
    const day = new Date(t).toISOString().slice(0, 10);
    days[day] = (days[day] ?? 0) + spent;
  }
  return {
    main,
    props,
    total: main + props,
    peakDay: Math.max(0, ...Object.values(days)),
    days,
    multiplier,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (!process.argv[2])
    throw new Error(
      "Usage: node scripts/forecast-background-quotes.mjs reviewed-input.json",
    );
  console.log(
    JSON.stringify(
      estimateSchedule(JSON.parse(readFileSync(process.argv[2], "utf8"))),
      null,
      2,
    ),
  );
}
