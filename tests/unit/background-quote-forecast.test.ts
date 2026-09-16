import { describe, expect, it } from "vitest";
import { estimateSchedule } from "../../scripts/forecast-background-quotes.mjs";
const opensAt = "2026-09-15T14:00Z";
const events = [
  "2026-09-18T00:00Z",
  ...Array(10).fill("2026-09-20T17:00Z"),
  ...Array(3).fill("2026-09-20T20:25Z"),
  "2026-09-21T00:00Z",
  "2026-09-22T00:00Z",
].map((cutoff, n) => ({
  id: String(n),
  opensAt,
  cutoff,
  families: ["passing", "rushing", "receiving"],
}));
const input = { now: opensAt, resetAt: "2026-09-22T00:00Z", events };
describe("remaining shared public coverage forecast", () => {
  it("reproduces the architecture's 16-game cost and daily ceiling", () => {
    expect(estimateSchedule(input)).toMatchObject({
      main: 687,
      props: 1962,
      total: 2649,
    });
    expect(estimateSchedule(input).peakDay).toBeLessThan(1300);
  });
  it("twenty identical league schedules have exactly the same cost", () => {
    expect(
      estimateSchedule({ ...input, events: Array(20).fill(events).flat() }),
    ).toEqual(estimateSchedule(input));
  });
  it("unions partially overlapping families and stops at actual cycle reset", () => {
    const short = {
      ...input,
      resetAt: "2026-09-15T15:00Z",
      events: [
        { ...events[0], families: ["passing"] },
        { ...events[0], families: ["passing", "rushing"] },
      ],
    };
    expect(estimateSchedule(short)).toMatchObject({
      main: 3,
      props: 2,
      total: 5,
    });
  });
  it("bounded slowdown lowers optional usage without promising target cadence", () => {
    expect(estimateSchedule({ ...input, multiplier: 2 }).total).toBeLessThan(
      1400,
    );
  });
});
