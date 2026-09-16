import { describe, expect, it, vi } from "vitest";
import {
  easternInstant,
  expectedAutomationGames,
  normalizeAutomationSchedule,
  selectAutomationMarkets,
  type AutomationGame,
} from "@/application/automation/schedule";
import { executeSeasonAutomation } from "@/application/automation/runner";
import { nflCatalogTeams } from "@/adapters/providers/player-catalog-normalizer";
import type { NormalizedProviderEventWithMarkets } from "@/application/providers/normalized-provider";
function fullSchedule() {
  const teams = [
    ...new Map(
      Object.entries(nflCatalogTeams).map(([key, value]) => [value, key]),
    ).values(),
  ];
  const rows = [
    "game_id,season,week,game_type,away_team,home_team,gameday,gametime",
  ];
  for (let week = 1; week <= 18; week++)
    for (let pair = 0; pair < 16; pair++) {
      if ((week === 9 && pair >= 8) || (week === 10 && pair < 8)) continue;
      const away = teams[pair * 2],
        home = teams[pair * 2 + 1];
      const date = new Date(Date.UTC(2026, 8, 10 + (week - 1) * 7))
        .toISOString()
        .slice(0, 10);
      rows.push(
        `2026_${String(week).padStart(2, "0")}_${away}_${home},2026,${week},REG,${away},${home},${date},20:20`,
      );
    }
  return rows.join("\n");
}
const game = (date: string, time: string, week = 3): AutomationGame => ({
  gameId: `${date}-${time}`,
  season: 2026,
  week,
  gameType: "REG",
  awayTeam: "Buffalo Bills",
  homeTeam: "Miami Dolphins",
  gameDate: date,
  gameTime: time,
  scheduledStartAt: easternInstant(date, time),
});
const event = (g: AutomationGame): NormalizedProviderEventWithMarkets => ({
  source: "THE_ODDS_API",
  externalEventId: g.gameId,
  sportKey: "americanfootball_nfl",
  awayTeam: g.awayTeam,
  homeTeam: g.homeTeam,
  scheduledStartAt: g.scheduledStartAt!,
  markets: [
    "MONEYLINE:AWAY",
    "MONEYLINE:HOME",
    "SPREAD:AWAY",
    "SPREAD:HOME",
    "TOTAL:OVER",
    "TOTAL:UNDER",
  ].map((k) => ({
    sourceBook: "draftkings",
    marketType: k.split(":")[0] as "MONEYLINE",
    outcomeKey: k.split(":")[1] as "AWAY",
    proposition: k,
    lineMilli: null,
    americanOdds: 100,
    observedAt: "2026-09-15T14:00:00Z",
  })),
});
describe("official schedule and standing slate policy", () => {
  it("uses Eastern DST for Tuesday opening and preparation", () => {
    expect(easternInstant("2026-09-15", "10:00")).toBe(
      "2026-09-15T14:00:00.000Z",
    );
    expect(easternInstant("2026-11-03", "10:00")).toBe(
      "2026-11-03T15:00:00.000Z",
    );
    expect(easternInstant("2026-03-10", "08:00")).toBe(
      "2026-03-10T12:00:00.000Z",
    );
  });
  it("requires complete season identities independent of the odds response", () => {
    const csv = fullSchedule();
    expect(normalizeAutomationSchedule(csv, 2026)).toHaveLength(272);
    expect(() =>
      normalizeAutomationSchedule(
        csv.split("\n").slice(0, -1).join("\n"),
        2026,
      ),
    ).toThrow("SCHEDULE_INCOMPLETE");
    expect(() => normalizeAutomationSchedule(csv, 2025)).toThrow(
      "SCHEDULE_INCOMPLETE",
    );
    expect(() =>
      normalizeAutomationSchedule(csv.replace(",REG,", ",POST,"), 2026),
    ).toThrow("SCHEDULE_INCOMPLETE");
  });
  it("includes Thursday/international/Saturday games only under all-games consent", () => {
    const games = [
      game("2026-09-17", "20:20"),
      game("2026-09-19", "16:00"),
      game("2026-09-20", "09:30"),
      game("2026-09-20", "13:00"),
      game("2026-09-20", "20:20"),
      game("2026-09-21", "20:15"),
    ];
    expect(expectedAutomationGames(games, 3, "ALL_NFL_GAMES")).toHaveLength(6);
    expect(
      expectedAutomationGames(games, 3, "SUNDAY_AFTERNOON_AND_MONDAY"),
    ).toEqual(games.slice(3));
    expect(expectedAutomationGames(games, 4, "ALL_NFL_GAMES")).toEqual([]);
  });
  it("rejects missing, duplicate, incomplete or mismatched markets without dropping a game", () => {
    const games = [game("2026-09-17", "20:20"), game("2026-09-21", "20:15")],
      events = games.map(event);
    expect(selectAutomationMarkets(events, games)).toEqual(events);
    expect(() => selectAutomationMarkets(events.slice(0, 1), games)).toThrow();
    expect(() =>
      selectAutomationMarkets([...events, events[0]], games),
    ).toThrow();
    expect(() =>
      selectAutomationMarkets(
        [{ ...events[0], markets: [] }, events[1]],
        games,
      ),
    ).toThrow();
    expect(() =>
      selectAutomationMarkets(
        [{ ...events[0], scheduledStartAt: "2026-09-18T00:21:00Z" }, events[1]],
        games,
      ),
    ).toThrow();
  });
  it("keeps unknown Sunday kickoffs in the expected slate so preparation blocks", () => {
    const unknown = {
      ...game("2026-09-20", "13:00"),
      gameTime: null,
      scheduledStartAt: null,
    };
    const expected = expectedAutomationGames(
      [unknown],
      3,
      "SUNDAY_AFTERNOON_AND_MONDAY",
    );
    expect(expected).toEqual([unknown]);
    expect(() => selectAutomationMarkets([], expected)).toThrow(
      "MARKETS_INCOMPLETE",
    );
  });
});
const first = "d447e407-982f-4b74-9f5e-291b709c7415",
  second = "d447e407-982f-4b74-9f5e-291b709c7416";
function claimed(runId: string, operation: string, week = 3) {
  return {
    status: "CLAIMED",
    runId,
    operation,
    week,
    season: 2026,
    preset: "ALL_NFL_GAMES",
  };
}
describe("bounded lifecycle worker", () => {
  it("idle ticks make zero provider calls", async () => {
    const schedule = vi.fn(),
      odds = vi.fn(),
      rpc = vi
        .fn()
        .mockResolvedValue({ data: { status: "IDLE" }, error: null });
    expect(await executeSeasonAutomation({ rpc, schedule, odds })).toEqual({
      status: "IDLE",
      attempted: 0,
      failed: 0,
    });
    expect(schedule).not.toHaveBeenCalled();
    expect(odds).not.toHaveBeenCalled();
  });
  it("stored-state validation/opening never fetches providers or asks for human confirmation", async () => {
    const queue = [
      claimed(first, "VALIDATE"),
      claimed(second, "OPEN"),
      { status: "IDLE" },
    ];
    const rpc = vi.fn(async (name: string) => ({
      data:
        name === "claim_season_automation"
          ? queue.shift()
          : { status: "VALIDATED" },
      error: null,
    }));
    const schedule = vi.fn(),
      odds = vi.fn();
    expect(await executeSeasonAutomation({ rpc, schedule, odds })).toEqual({
      status: "COMPLETE",
      attempted: 2,
      failed: 0,
    });
    expect(schedule).not.toHaveBeenCalled();
    expect(odds).not.toHaveBeenCalled();
    expect(rpc.mock.calls.map(([name]) => name)).not.toContain(
      "confirm_progressive_player_prop_menu",
    );
  });
  it("isolates one source failure and continues other seasons", async () => {
    const queue = [
      claimed(first, "SYNC_SCHEDULE"),
      claimed(second, "RECONCILE"),
      { status: "IDLE" },
    ];
    const calls: Array<{
      name: string;
      args: Record<string, unknown> | undefined;
    }> = [];
    const rpc = async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args });
      return {
        data:
          name === "claim_season_automation"
            ? queue.shift()
            : { status: args?.p_failure ? "FAILED" : "RECONCILED" },
        error: null,
      };
    };
    const result = await executeSeasonAutomation({
      rpc,
      schedule: async () => {
        throw new Error("source down");
      },
      odds: vi.fn(),
    });
    expect(result).toEqual({ status: "PARTIAL", attempted: 2, failed: 1 });
    expect(calls.find((c) => c.args?.p_run === first)?.args?.p_failure).toBe(
      "SCHEDULE_UNAVAILABLE",
    );
    expect(calls.some((c) => c.args?.p_run === second)).toBe(true);
  });
  it("caps the batch at three actions and reports expired completion as failure", async () => {
    const rpc = vi.fn(async (name: string) =>
      name === "claim_season_automation"
        ? { data: claimed(first, "RECONCILE"), error: null }
        : { data: null, error: { message: "lease expired" } },
    );
    expect(
      await executeSeasonAutomation({ rpc, schedule: vi.fn(), odds: vi.fn() }),
    ).toEqual({ status: "PARTIAL", attempted: 3, failed: 3 });
  });
});
