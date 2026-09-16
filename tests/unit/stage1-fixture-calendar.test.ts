import { afterEach, expect, test, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { providerData } from "../fixtures/stage1-baseline";
import {
  normalizeTheOddsApiOdds,
  selectNearestNflSlateEventIds,
} from "../../src/adapters/providers/the-odds-api/normalize";
import {
  easternInstant,
  expectedAutomationGames,
  normalizeAutomationSchedule,
  selectAutomationMarkets,
} from "../../src/application/automation/schedule";

const directories: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const path of directories.splice(0)) rmSync(path, { recursive: true });
});

test.each([
  ["2026-09-16T15:00:00Z", 16],
  ["2026-09-21T03:30:00Z", 16],
  ["2026-09-21T15:00:00Z", 16],
  ["2026-09-22T03:30:00Z", 15],
  ["2026-09-22T09:00:00Z", 15],
  ["2027-01-01T15:00:00Z", 16],
] as const)("raw fixture is due and discoverable at %s", (instant, count) => {
  const directory = mkdtempSync(join(tmpdir(), "stage1-calendar-"));
  directories.push(directory);
  const file = join(directory, "odds.json");
  vi.stubEnv("ODDS_TEST_FIXTURE", file);
  const now = new Date(instant);
  const source = providerData("calendar-check", false, now);
  const schedule = normalizeAutomationSchedule(source.scheduleCsv, source.year);
  expect(schedule).toHaveLength(272);
  expect(
    schedule.every((game) =>
      [source.year, source.year + 1].includes(
        Number(game.gameDate.slice(0, 4)),
      ),
    ),
  ).toBe(true);
  const expected = expectedAutomationGames(schedule, 3, source.preset);
  expect(expected).toHaveLength(count);
  expect(
    expected.every(
      (game) => Date.parse(game.scheduledStartAt!) > now.getTime() + 3600000,
    ),
  ).toBe(true);
  const firstDate = schedule
    .filter((game) => game.week === 3)
    .map((game) => game.gameDate)
    .sort()[0];
  const first = new Date(`${firstDate}T12:00:00Z`);
  first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 5) % 7));
  expect(
    Date.parse(easternInstant(first.toISOString().slice(0, 10), "10:00")),
  ).toBeLessThanOrEqual(now.getTime());
  const payload = JSON.parse(readFileSync(file, "utf8")).payload;
  expect(selectNearestNflSlateEventIds(payload)).toHaveLength(count);
  const imported = normalizeTheOddsApiOdds(payload, new Date().toISOString());
  expect(selectAutomationMarkets(imported.events, expected)).toHaveLength(
    count,
  );
  expect(() =>
    selectAutomationMarkets(imported.events.slice(0, -1), expected),
  ).toThrow("MARKETS_INCOMPLETE");
});
