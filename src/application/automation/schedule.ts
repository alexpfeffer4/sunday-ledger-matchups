import { parseNflverseCsv } from "@/adapters/providers/nflverse/normalize-player-results";
import { nflCatalogTeams } from "@/adapters/providers/player-catalog-normalizer";
import type { NormalizedProviderEventWithMarkets } from "@/application/providers/normalized-provider";

export type SlatePreset = "ALL_NFL_GAMES" | "SUNDAY_AFTERNOON_AND_MONDAY";
export type AutomationGame = {
  gameId: string;
  season: number;
  week: number;
  gameType: "REG";
  awayTeam: string;
  homeTeam: string;
  gameDate: string;
  gameTime: string | null;
  scheduledStartAt: string | null;
};
const eastern = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Convert the source's Eastern wall clock, including DST, without using the
 * process timezone. Football publication times do not fall in the DST fold. */
export function easternInstant(date: string, time: string): string {
  const target = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(target)) throw new Error("SCHEDULE_INVALID_TIME");
  let value = target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const p = Object.fromEntries(
      eastern.formatToParts(new Date(value)).map((x) => [x.type, x.value]),
    );
    const local = Date.parse(
      `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`,
    );
    const delta = target - local;
    value += delta;
    if (!delta) return new Date(value).toISOString();
  }
  throw new Error("SCHEDULE_AMBIGUOUS_TIME");
}

export function normalizeAutomationSchedule(
  csv: string,
  season: number,
): AutomationGame[] {
  const games = parseNflverseCsv(csv)
    .filter((row) => Number(row.season) === season && row.game_type === "REG")
    .map((row) => {
      const week = Number(row.week);
      const awayTeam = nflCatalogTeams[row.away_team],
        homeTeam = nflCatalogTeams[row.home_team];
      if (
        !awayTeam ||
        !homeTeam ||
        awayTeam === homeTeam ||
        !Number.isInteger(week) ||
        week < 1 ||
        week > 18 ||
        row.game_id !==
          `${season}_${String(week).padStart(2, "0")}_${row.away_team}_${row.home_team}` ||
        !/^\d{4}-\d{2}-\d{2}$/.test(row.gameday)
      )
        throw new Error("SCHEDULE_INVALID_IDENTITY");
      const gameTime = /^\d{2}:\d{2}$/.test(row.gametime) ? row.gametime : null;
      return {
        gameId: row.game_id,
        season,
        week,
        gameType: "REG" as const,
        awayTeam,
        homeTeam,
        gameDate: row.gameday,
        gameTime,
        scheduledStartAt: gameTime
          ? easternInstant(row.gameday, gameTime)
          : null,
      };
    })
    .sort((a, b) => a.gameId.localeCompare(b.gameId));
  const teams = new Map<string, number>();
  const weeklyTeams = new Set<string>();
  for (const game of games)
    for (const team of [game.awayTeam, game.homeTeam]) {
      const identity = `${game.week}:${team}`;
      if (weeklyTeams.has(identity)) throw new Error("SCHEDULE_AMBIGUOUS");
      weeklyTeams.add(identity);
      teams.set(team, (teams.get(team) ?? 0) + 1);
    }
  if (
    games.length !== 272 ||
    new Set(games.map((game) => game.gameId)).size !== 272 ||
    new Set(games.map((game) => game.week)).size !== 18 ||
    teams.size !== 32 ||
    [...teams.values()].some((count) => count !== 17)
  )
    throw new Error("SCHEDULE_INCOMPLETE");
  return games;
}
export function expectedAutomationGames(
  games: readonly AutomationGame[],
  week: number,
  preset: SlatePreset,
): AutomationGame[] {
  return games.filter((game) => {
    if (game.week !== week) return false;
    if (preset === "ALL_NFL_GAMES") return true;
    const day = new Date(`${game.gameDate}T12:00:00Z`).getUTCDay();
    return (
      day === 1 ||
      (day === 0 && game.gameTime !== null && game.gameTime >= "13:00")
    );
  });
}

/** Odds are matched against the independent complete schedule. Missing main
 * markets block the week; they cannot narrow the saved slate preset. */
export function selectAutomationMarkets(
  events: readonly NormalizedProviderEventWithMarkets[],
  expected: readonly AutomationGame[],
): NormalizedProviderEventWithMarkets[] {
  if (!expected.length) throw new Error("SCHEDULE_INCOMPLETE");
  const result = expected.map((game) => {
    const matches = events.filter(
      (event) =>
        game.scheduledStartAt !== null &&
        event.awayTeam === game.awayTeam &&
        event.homeTeam === game.homeTeam &&
        Date.parse(event.scheduledStartAt) ===
          Date.parse(game.scheduledStartAt),
    );
    if (matches.length !== 1 || matches[0].markets.length !== 6)
      throw new Error("MARKETS_INCOMPLETE");
    return matches[0];
  });
  if (
    new Set(result.map((event) => event.externalEventId)).size !== result.length
  )
    throw new Error("MARKETS_AMBIGUOUS");
  return result;
}
