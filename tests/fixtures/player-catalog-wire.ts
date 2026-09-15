import type { CatalogSource } from "@/adapters/providers/player-catalog-normalizer";
import type { PropQuoteImport } from "@/application/providers/player-prop-quotes";
import { nflCatalogTeams } from "@/adapters/providers/player-catalog-normalizer";

export function playerCatalogWireFixture() {
  const now = "2026-09-20T15:00:00.000Z";
  const source = (
    get: string,
    parameters: Record<string, string>,
    response: unknown[],
  ): CatalogSource => ({
    fetchedAt: now,
    payload: {
      get,
      parameters,
      errors: [],
      results: response.length,
      response,
    },
  });
  const start = "2026-09-21T00:20:00.000Z";
  const names = [
    "Cardinal Quarterback",
    "Cardinal Runner",
    "Cardinal Receiver",
    "Charger Quarterback",
    "Charger Runner",
    "Charger Receiver",
  ];
  const rows = names.map((name, index) => ({
    id: String(index + 100),
    name,
    position: ["QB", "RB", "WR"][index % 3],
  }));
  const events = [
    {
      externalEventId: "odds-event",
      scheduledStartAt: start,
      awayTeam: "Arizona Cardinals",
      homeTeam: "Los Angeles Chargers",
    },
  ];
  const quotes: PropQuoteImport[] = [
    {
      source: "THE_ODDS_API",
      fetchedAt: now,
      events: [
        {
          ...events[0],
          source: "THE_ODDS_API",
          sportKey: "americanfootball_nfl",
          requestedFamilies: [
            "player_pass_yds",
            "player_rush_yds",
            "player_reception_yds",
          ],
          markets: rows.flatMap((row, index) =>
            (["OVER", "UNDER"] as const).map((outcomeKey) => ({
              sourceBook: "draftkings" as const,
              marketType: (
                [
                  "PLAYER_PASSING_YARDS",
                  "PLAYER_RUSHING_YARDS",
                  "PLAYER_RECEIVING_YARDS",
                ] as const
              )[index % 3],
              statistic: (
                ["PASSING_YARDS", "RUSHING_YARDS", "RECEIVING_YARDS"] as const
              )[index % 3],
              period: "FULL_GAME" as const,
              externalPlayerId: row.name,
              outcomeKey,
              proposition: row.name,
              lineMilli: 50000,
              americanOdds: -110,
              observedAt: now,
            })),
          ),
        },
      ],
    },
  ];
  const coverage = source("leagues", { id: "1", season: "2026" }, [
    {
      league: { id: 1 },
      seasons: [
        {
          year: 2026,
          coverage: { players: true, games: { statisitcs: { players: true } } },
        },
      ],
    },
  ]);
  const games = source("games", { league: "1", season: "2026" }, [
    {
      game: { id: 888, date: { timestamp: Date.parse(start) / 1000 } },
      league: { id: 1, season: "2026" },
      teams: {
        away: { id: 1, name: events[0].awayTeam },
        home: { id: 2, name: events[0].homeTeam },
      },
    },
  ]);
  return {
    now,
    season: 2026,
    week: 3,
    events,
    coverage,
    games,
    rosters: {
      "1": source("players", { team: "1", season: "2026" }, rows.slice(0, 3)),
      "2": source("players", { team: "2", season: "2026" }, rows.slice(3)),
    } as Record<string, CatalogSource>,
    quotes,
    apiSportsContractValidated: true,
    nflverseContractValidated: true,
    nflverse: {
      fetchedAt: now,
      sourceUpdatedAt: now,
      rosterCsv:
        "season,team,position,full_name,gsis_id,pfr_id,status\n" +
        rows
          .map(
            (row, i) =>
              `2026,${i < 3 ? "ARI" : "LAC"},${row.position},${row.name},00-000000${i},Player0${i},ACT`,
          )
          .join("\n"),
      scheduleCsv:
        "game_id,season,week,gameday,gametime,away_team,home_team\n2026_03_ARI_LAC,2026,3,2026-09-20,20:20,ARI,LAC\n",
      statsCsv:
        "player_id,season,week,recent_team,attempts,carries,targets\n00-0000000,2026,2,ARI,36,0,0\n00-0000001,2026,2,ARI,0,19,0\n00-0000002,2026,2,ARI,0,0,12\n",
    },
  };
}

export function fullSlateCatalogWireFixture() {
  const result = playerCatalogWireFixture();
  const teams = Object.entries(nflCatalogTeams).filter(
    ([code, name], index, entries) =>
      entries.findIndex(([, other]) => other === name) === index &&
      code.length > 0,
  );
  const start = result.events[0].scheduledStartAt;
  const rows: string[] = [
    "season,team,position,full_name,gsis_id,pfr_id,status",
  ];
  const schedule = ["game_id,season,week,gameday,gametime,away_team,home_team"];
  const usage = ["player_id,season,week,team,attempts,carries,targets"];
  const gameRows: unknown[] = [];
  result.events = [];
  result.quotes = [];
  result.rosters = {};
  for (let i = 0; i < 16; i++) {
    const pair = teams.slice(i * 2, i * 2 + 2);
    const event = {
      externalEventId: `odds-full-${i}`,
      scheduledStartAt: start,
      awayTeam: pair[0][1],
      homeTeam: pair[1][1],
    };
    result.events.push(event);
    const markets: PropQuoteImport["events"][number]["markets"] = [];
    pair.forEach(([code, name], side) => {
      const teamId = i * 2 + side + 1;
      const profiles = ["QB", "RB", "WR"].map((position, role) => {
        const playerId = teamId * 10 + role;
        const playerName = `${code} Player ${position}`;
        rows.push(
          `2026,${code},${position},${playerName},00-${String(playerId).padStart(7, "0")},Fixture${playerId},ACT`,
        );
        usage.push(
          `00-${String(playerId).padStart(7, "0")},2026,2,${code},${role === 0 ? 30 : 0},${role === 1 ? 20 : 0},${role === 2 ? 10 : 0}`,
        );
        for (const outcomeKey of ["OVER", "UNDER"] as const)
          markets.push({
            sourceBook: "draftkings",
            marketType: (
              [
                "PLAYER_PASSING_YARDS",
                "PLAYER_RUSHING_YARDS",
                "PLAYER_RECEIVING_YARDS",
              ] as const
            )[role],
            statistic: (
              ["PASSING_YARDS", "RUSHING_YARDS", "RECEIVING_YARDS"] as const
            )[role],
            period: "FULL_GAME",
            externalPlayerId: playerName,
            outcomeKey,
            proposition: playerName,
            lineMilli: 50000,
            americanOdds: -110,
            observedAt: result.now,
          });
        return { id: playerId, name: playerName, position };
      });
      result.rosters[String(teamId)] = {
        fetchedAt: result.now,
        payload: {
          get: "players",
          parameters: { team: String(teamId), season: "2026" },
          errors: [],
          results: profiles.length,
          response: profiles,
        },
      };
      return name;
    });
    gameRows.push({
      game: { id: 900 + i, date: { timestamp: Date.parse(start) / 1000 } },
      league: { id: 1, season: "2026" },
      teams: {
        away: { id: i * 2 + 1, name: event.awayTeam },
        home: { id: i * 2 + 2, name: event.homeTeam },
      },
    });
    schedule.push(
      `2026_03_${pair[0][0]}_${pair[1][0]},2026,3,2026-09-20,20:20,${pair[0][0]},${pair[1][0]}`,
    );
    result.quotes.push({
      source: "THE_ODDS_API",
      fetchedAt: result.now,
      events: [
        {
          ...event,
          source: "THE_ODDS_API",
          sportKey: "americanfootball_nfl",
          requestedFamilies: [
            "player_pass_yds",
            "player_rush_yds",
            "player_reception_yds",
          ],
          markets,
        },
      ],
    });
  }
  result.games.payload = {
    get: "games",
    parameters: { league: "1", season: "2026" },
    errors: [],
    results: gameRows.length,
    response: gameRows,
  };
  result.nflverse.rosterCsv = rows.join("\n");
  result.nflverse.scheduleCsv = schedule.join("\n");
  result.nflverse.statsCsv = usage.join("\n");
  return result;
}
