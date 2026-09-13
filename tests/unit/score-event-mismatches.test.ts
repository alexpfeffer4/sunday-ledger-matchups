import { expect, it } from "vitest";
import { scoreEventMismatches } from "@/application/providers/score-event-mismatches";
const published = {
  key: "event",
  awayTeam: "Away",
  homeTeam: "Home",
  scheduledStartAt: "2026-09-13T17:00:00Z",
};
it("treats equivalent timestamp formats as the same kickoff", () => {
  expect(
    scoreEventMismatches(
      [published],
      [
        {
          ...published,
          externalEventId: "event",
          scheduledStartAt: "2026-09-13T13:00:00-04:00",
        },
      ],
    ),
  ).toEqual([]);
});
it("retains only the public mismatched identity fields", () => {
  const received = {
    ...published,
    externalEventId: "event",
    scheduledStartAt: "2026-09-13T17:05:00Z",
    awayScore: 7,
    credentials: "never-log",
    privateCard: { stakes: 500 },
  };
  const result = scoreEventMismatches([published], [received]);
  expect(result[0].provider.scheduledStartAt).toBe(received.scheduledStartAt);
  expect(Object.keys(result[0].provider).sort()).toEqual([
    "awayTeam",
    "homeTeam",
    "scheduledStartAt",
  ]);
  expect(JSON.stringify(result)).not.toMatch(/never-log|privateCard|awayScore/);
});
