import { createHash } from "node:crypto";
import { z } from "zod";
import { parseNflverseCsv } from "@/adapters/providers/nflverse/normalize-player-results";
import type { PlayerCatalogBootstrapInput } from "@/application/players/catalog-bootstrap";
import type { PropQuoteImport } from "@/application/providers/player-prop-quotes";

const numberId = z
  .union([z.number().int().positive(), z.string().regex(/^\d+$/)])
  .transform(String);
const seasonValue = z
  .union([z.number().int(), z.string().regex(/^\d{4}$/)])
  .transform(Number);
const teamSchema = z.object({ id: numberId, name: z.string().min(1).max(60) });
const envelope = z.object({
  get: z.string(),
  parameters: z.record(z.string(), z.unknown()),
  errors: z.union([z.array(z.unknown()).length(0), z.object({}).strict()]),
  results: z.number().int().nonnegative(),
  response: z.array(z.unknown()),
});
export type CatalogEvent = {
  externalEventId: string;
  scheduledStartAt: string;
  awayTeam: string;
  homeTeam: string;
};
export type CatalogSource = {
  payload: unknown;
  fetchedAt: string;
  sourceUpdatedAt?: string | null;
};
export function catalogHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function unwrap(
  source: CatalogSource,
  endpoint: string,
  params: Record<string, string>,
  now: string,
) {
  const parsed = envelope.parse(source.payload);
  if (
    parsed.get !== endpoint ||
    parsed.results !== parsed.response.length ||
    !parsed.results ||
    Object.entries(params).some(
      ([key, value]) => String(parsed.parameters[key]) !== value,
    )
  )
    throw new Error("CATALOG_SOURCE_SCOPE_UNVERIFIED");
  if (
    !Number.isFinite(Date.parse(source.fetchedAt)) ||
    Date.parse(source.fetchedAt) > Date.parse(now) ||
    Date.parse(now) - Date.parse(source.fetchedAt) > 48 * 3600000
  )
    throw new Error("CATALOG_SOURCE_STALE");
  return parsed.response;
}
/** Coverage is account/season specific; an empty200 never proves support. The
 * misspelling statisitcs is in the provider's official NFL wire example. */
export function verifyCatalogCoverage(
  source: CatalogSource,
  season: number,
  now: string,
) {
  const rows = z
    .array(
      z.object({
        league: z.object({ id: numberId }),
        seasons: z.array(
          z.object({
            year: seasonValue,
            coverage: z.object({
              players: z.boolean(),
              games: z.object({
                statisitcs: z.object({ players: z.boolean() }).optional(),
                statistics: z.object({ players: z.boolean() }).optional(),
              }),
            }),
          }),
        ),
      }),
    )
    .parse(unwrap(source, "leagues", { id: "1", season: String(season) }, now));
  const matches = rows
    .filter((row) => row.league.id === "1")
    .flatMap((row) => row.seasons)
    .filter((row) => row.year === season);
  if (
    matches.length !== 1 ||
    !matches[0].coverage.players ||
    !(
      matches[0].coverage.games.statisitcs?.players ??
      matches[0].coverage.games.statistics?.players
    )
  )
    throw new Error("CATALOG_CURRENT_SEASON_UNAVAILABLE");
}
export function normalizeCatalogGames(
  source: CatalogSource,
  season: number,
  now: string,
) {
  const rows = z
    .array(
      z.object({
        game: z.object({
          id: numberId,
          date: z.object({ timestamp: z.number().int().positive() }),
        }),
        league: z.object({ id: numberId, season: seasonValue }),
        teams: z.object({ home: teamSchema, away: teamSchema }),
      }),
    )
    .parse(
      unwrap(source, "games", { league: "1", season: String(season) }, now),
    );
  if (
    rows.some((row) => row.league.id !== "1" || row.league.season !== season) ||
    new Set(rows.map((row) => row.game.id)).size !== rows.length
  )
    throw new Error("CATALOG_GAME_IDENTITY_AMBIGUOUS");
  return rows.map((row) => ({
    id: row.game.id,
    scheduledStartAt: new Date(row.game.date.timestamp * 1000).toISOString(),
    away: row.teams.away,
    home: row.teams.home,
  }));
}
export function normalizeCatalogRoster(
  source: CatalogSource,
  season: number,
  teamId: string,
  now: string,
) {
  const rows = z
    .array(
      z.object({
        id: numberId,
        name: z.string().min(1).max(120),
        position: z.string().min(1).max(30),
      }),
    )
    .parse(
      unwrap(source, "players", { team: teamId, season: String(season) }, now),
    );
  if (new Set(rows.map((row) => row.id)).size !== rows.length)
    throw new Error("CATALOG_PLAYER_IDENTITY_AMBIGUOUS");
  const positions: Record<string, string> = {
    Quarterback: "QB",
    "Running Back": "RB",
    "Wide Receiver": "WR",
    "Tight End": "TE",
  };
  return rows.map((row) => ({
    ...row,
    position: positions[row.position] ?? row.position,
  }));
}

/** Retain only required public facts, never a whole provider account/profile. */
export function sanitizeCatalogSource(
  kind: "COVERAGE" | "GAMES" | "ROSTER",
  source: CatalogSource,
  season: number,
  teamId: string | null,
  now: string,
): CatalogSource {
  let get: string, parameters: Record<string, string>, response: unknown[];
  if (kind === "COVERAGE") {
    verifyCatalogCoverage(source, season, now);
    get = "leagues";
    parameters = { id: "1", season: String(season) };
    response = [
      {
        league: { id: 1 },
        seasons: [
          {
            year: season,
            coverage: {
              players: true,
              games: { statisitcs: { players: true } },
            },
          },
        ],
      },
    ];
  } else if (kind === "GAMES") {
    get = "games";
    parameters = { league: "1", season: String(season) };
    response = normalizeCatalogGames(source, season, now).map((game) => ({
      game: {
        id: game.id,
        date: { timestamp: Date.parse(game.scheduledStartAt) / 1000 },
      },
      league: { id: 1, season },
      teams: { away: game.away, home: game.home },
    }));
  } else {
    if (!teamId) throw new Error("CATALOG_TEAM_REQUIRED");
    get = "players";
    parameters = { team: teamId, season: String(season) };
    response = normalizeCatalogRoster(source, season, teamId, now);
  }
  return {
    fetchedAt: source.fetchedAt,
    sourceUpdatedAt: source.sourceUpdatedAt ?? null,
    payload: {
      get,
      parameters,
      errors: [],
      results: response.length,
      response,
    },
  };
}

export function sanitizeNflverseCatalog(
  files: NflverseCatalogFiles,
  season: number,
): NflverseCatalogFiles {
  const project = (csv: string, columns: string[]) =>
    [
      columns.join(","),
      ...parseNflverseCsv(csv)
        .filter((row) => Number(row.season) === season)
        .map((row) =>
          columns
            .map(
              (column) => '"' + (row[column] ?? "").replace(/"/g, '""') + '"',
            )
            .join(","),
        ),
    ].join("\n");
  return {
    ...files,
    rosterCsv: project(files.rosterCsv, [
      "season",
      "team",
      "position",
      "full_name",
      "gsis_id",
      "pfr_id",
      "espn_id",
      "status",
    ]),
    scheduleCsv: project(files.scheduleCsv, [
      "game_id",
      "season",
      "week",
      "gameday",
      "gametime",
      "away_team",
      "home_team",
    ]),
    statsCsv: project(files.statsCsv, [
      "player_id",
      "season",
      "week",
      "recent_team",
      "team",
      "attempts",
      "carries",
      "targets",
    ]),
  };
}
// Explicit source codes, never a fuzzy transform of user/provider team names.
export const nflCatalogTeams: Record<string, string> = {
  ARI: "Arizona Cardinals",
  ATL: "Atlanta Falcons",
  BAL: "Baltimore Ravens",
  BUF: "Buffalo Bills",
  CAR: "Carolina Panthers",
  CHI: "Chicago Bears",
  CIN: "Cincinnati Bengals",
  CLE: "Cleveland Browns",
  DAL: "Dallas Cowboys",
  DEN: "Denver Broncos",
  DET: "Detroit Lions",
  GB: "Green Bay Packers",
  HOU: "Houston Texans",
  IND: "Indianapolis Colts",
  JAX: "Jacksonville Jaguars",
  KC: "Kansas City Chiefs",
  LA: "Los Angeles Rams",
  LAR: "Los Angeles Rams",
  LAC: "Los Angeles Chargers",
  LV: "Las Vegas Raiders",
  MIA: "Miami Dolphins",
  MIN: "Minnesota Vikings",
  NE: "New England Patriots",
  NO: "New Orleans Saints",
  NYG: "New York Giants",
  NYJ: "New York Jets",
  PHI: "Philadelphia Eagles",
  PIT: "Pittsburgh Steelers",
  SEA: "Seattle Seahawks",
  SF: "San Francisco 49ers",
  TB: "Tampa Bay Buccaneers",
  TEN: "Tennessee Titans",
  WAS: "Washington Commanders",
  WSH: "Washington Commanders",
};
function eastern(instant: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}
export type NflverseCatalogFiles = {
  rosterCsv: string;
  scheduleCsv: string;
  statsCsv: string;
  fetchedAt: string;
  sourceUpdatedAt: string;
};
export function normalizeLiveCatalog(input: {
  season: number;
  week: number;
  now: string;
  events: CatalogEvent[];
  coverage: CatalogSource;
  games: CatalogSource;
  rosters: Record<string, CatalogSource>;
  nflverse: NflverseCatalogFiles;
  quotes: PropQuoteImport[];
  apiSportsContractValidated: boolean;
  nflverseContractValidated: boolean;
  verifiedAliases?: { canonicalKey: string; name: string }[];
}): PlayerCatalogBootstrapInput {
  verifyCatalogCoverage(input.coverage, input.season, input.now);
  const games = normalizeCatalogGames(input.games, input.season, input.now);
  const { nflverse: files } = input;
  if (
    !Number.isFinite(Date.parse(files.sourceUpdatedAt)) ||
    Date.parse(files.sourceUpdatedAt) > Date.parse(input.now) ||
    Date.parse(input.now) - Date.parse(files.sourceUpdatedAt) > 48 * 3600000
  )
    throw new Error("CATALOG_NFLVERSE_CURRENT_DIRECTORY_UNAVAILABLE");
  const roster = parseNflverseCsv(files.rosterCsv).filter(
    (row) => Number(row.season) === input.season,
  );
  const schedule = parseNflverseCsv(files.scheduleCsv).filter(
    (row) => Number(row.season) === input.season,
  );
  const stats = parseNflverseCsv(files.statsCsv).filter(
    (row) =>
      Number(row.season) === input.season &&
      Number(row.week) < input.week &&
      Number(row.week) >= input.week - 3,
  );
  if (!roster.length || !schedule.length)
    throw new Error("CATALOG_NFLVERSE_CURRENT_SEASON_UNAVAILABLE");
  const result: PlayerCatalogBootstrapInput = {
    now: input.now,
    events: [],
    directory: [],
    mappings: [],
    roles: [],
    quotes: input.quotes,
  };
  const directoryKeys = new Set<string>();
  for (const event of input.events) {
    const when = eastern(event.scheduledStartAt);
    const matches = games.filter(
      (game) =>
        game.away.name === event.awayTeam &&
        game.home.name === event.homeTeam &&
        game.scheduledStartAt ===
          new Date(event.scheduledStartAt).toISOString(),
    );
    const nflMatches = schedule.filter(
      (game) =>
        game.gameday === when.date &&
        game.gametime === when.time &&
        Number(game.week) === input.week &&
        nflCatalogTeams[game.away_team] === event.awayTeam &&
        nflCatalogTeams[game.home_team] === event.homeTeam &&
        game.game_id ===
          `${input.season}_${String(input.week).padStart(2, "0")}_${game.away_team}_${game.home_team}`,
    );
    // No fabricated cross-provider event id; leave this game's six slots unresolved.
    if (matches.length !== 1 || nflMatches.length !== 1) continue;
    const game = matches[0],
      nflGame = nflMatches[0];
    const proof = {
      verified: true,
      verifiedAt: input.games.fetchedAt,
      evidenceHash: catalogHash([
        event.externalEventId,
        game.id,
        nflGame.game_id,
        when.date,
        event.scheduledStartAt,
        event.awayTeam,
        event.homeTeam,
      ]),
    };
    result.events.push({
      ...event,
      resultMapping: {
        ...proof,
        apiSportsEventId: game.id,
        nflverseEventId: nflGame.game_id,
        gameDate: when.date,
        awayTeam: event.awayTeam,
        homeTeam: event.homeTeam,
      },
    });
    for (const team of [game.away, game.home]) {
      const source = input.rosters[team.id];
      if (!source) continue;
      const profiles = normalizeCatalogRoster(
        source,
        input.season,
        team.id,
        input.now,
      );
      const current = roster.filter(
        (row) =>
          nflCatalogTeams[row.team] === team.name &&
          ["QB", "RB", "WR", "TE"].includes(row.position) &&
          /^\d{2}-\d{7}$/.test(row.gsis_id) &&
          row.pfr_id &&
          row.full_name &&
          row.status === "ACT",
      );
      for (const player of current) {
        const sameCanonical = roster.filter(
          (row) => row.gsis_id === player.gsis_id,
        );
        const exact = profiles.filter(
          (profile) =>
            profile.name === player.full_name &&
            profile.position === player.position,
        );
        const sameName = roster.filter(
          (row) =>
            [event.awayTeam, event.homeTeam].includes(
              nflCatalogTeams[row.team],
            ) && row.full_name === player.full_name,
        );
        if (
          sameCanonical.length !== 1 ||
          sameName.length !== 1 ||
          exact.length !== 1 ||
          profiles.filter((profile) => profile.name === player.full_name)
            .length !== 1
        )
          continue;
        const canonicalKey = `nflverse:${player.gsis_id}`;
        const evidence = {
          verified: true,
          verifiedAt: source.fetchedAt,
          evidenceHash: catalogHash([player, exact[0], team, input.season]),
        };
        if (!directoryKeys.has(canonicalKey)) {
          directoryKeys.add(canonicalKey);
          result.directory.push({
            ...evidence,
            canonicalKey,
            displayName: player.full_name,
            position: player.position,
            team: team.name,
            validFrom: eastern(files.fetchedAt).date,
            validThrough: eastern(
              new Date(
                Date.parse(files.fetchedAt) + 7 * 86400000,
              ).toISOString(),
            ).date,
            bookmakerAliases: [
              ...new Set(
                (input.verifiedAliases ?? [])
                  .filter((alias) => alias.canonicalKey === canonicalKey)
                  .map((alias) => alias.name),
              ),
            ].slice(0, 10),
          });
        }
        result.mappings.push(
          {
            ...evidence,
            canonicalKey,
            provider: "NFLVERSE",
            externalEventId: event.externalEventId,
            externalPlayerId: player.gsis_id,
            team: team.name,
            gameDate: when.date,
            sourceTeam: player.team,
            secondaryPlayerId: player.pfr_id,
            resultPathVerified: input.nflverseContractValidated,
          },
          {
            ...evidence,
            canonicalKey,
            provider: "API_SPORTS",
            externalEventId: event.externalEventId,
            externalPlayerId: exact[0].id,
            team: team.name,
            gameDate: when.date,
            sourceTeam: team.name,
            secondaryPlayerId: null,
            resultPathVerified: input.apiSportsContractValidated,
          },
        );
        const statistic =
          player.position === "QB"
            ? "PASSING_YARDS"
            : player.position === "RB"
              ? "RUSHING_YARDS"
              : "RECEIVING_YARDS";
        const field =
          player.position === "QB"
            ? "attempts"
            : player.position === "RB"
              ? "carries"
              : "targets";
        const usageRows = stats.filter(
          (row) =>
            row.player_id === player.gsis_id &&
            nflCatalogTeams[row.recent_team || row.team] === team.name &&
            /^\d+(\.\d+)?$/.test(row[field] ?? ""),
        );
        if (usageRows.length)
          result.roles.push({
            ...evidence,
            evidenceHash: catalogHash(usageRows),
            canonicalKey,
            externalEventId: event.externalEventId,
            team: team.name,
            gameDate: when.date,
            kind: "RECENT_USAGE",
            statistic,
            usage: usageRows.reduce((sum, row) => sum + Number(row[field]), 0),
            source: "NFLVERSE",
            description: `Recent ${field} over ${usageRows.length} game(s); starting role unconfirmed.`,
          });
      }
    }
  }
  if (!result.events.length)
    throw new Error("CATALOG_NO_VERIFIED_EVENT_MATCHES");
  return result;
}

/** The approved featured-player pilot uses one real source crosswalk. It does
 * not claim API-Sports identity/entitlement or that an odds leader is a starter. */
export function normalizeNflversePrimaryCatalog(input: {
  season: number;
  week: number;
  now: string;
  events: CatalogEvent[];
  nflverse: NflverseCatalogFiles;
  quotes: PropQuoteImport[];
  nflverseContractValidated: boolean;
  verifiedAliases?: { canonicalKey: string; name: string }[];
}): PlayerCatalogBootstrapInput {
  const { nflverse: files } = input;
  const now = Date.parse(input.now),
    fetched = Date.parse(files.fetchedAt),
    revision = Date.parse(files.sourceUpdatedAt);
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(fetched) ||
    !Number.isFinite(revision) ||
    revision > fetched ||
    fetched > now ||
    now - revision > 48 * 3600000
  )
    throw new Error("CATALOG_NFLVERSE_CURRENT_DIRECTORY_UNAVAILABLE");
  const roster = parseNflverseCsv(files.rosterCsv).filter(
    (row) => Number(row.season) === input.season,
  );
  const schedule = parseNflverseCsv(files.scheduleCsv).filter(
    (row) => Number(row.season) === input.season,
  );
  if (!roster.length || !schedule.length)
    throw new Error("CATALOG_NFLVERSE_CURRENT_SEASON_UNAVAILABLE");
  const result: PlayerCatalogBootstrapInput = {
    now: input.now,
    sourceVerifiedAt: files.fetchedAt,
    sourceExpiresAt: new Date(revision + 48 * 3600000).toISOString(),
    sourcePolicy: "NFLVERSE_PRIMARY",
    selectionPolicy: "FEATURED_HIGHEST_STANDARD_LINES",
    events: [],
    directory: [],
    mappings: [],
    roles: [],
    quotes: input.quotes,
  };
  const directoryKeys = new Set<string>();
  for (const event of input.events) {
    if (
      !Number.isFinite(Date.parse(event.scheduledStartAt)) ||
      Date.parse(event.scheduledStartAt) <= now
    )
      continue;
    const when = eastern(event.scheduledStartAt);
    const matches = schedule.filter(
      (game) =>
        Number(game.week) === input.week &&
        game.gameday === when.date &&
        game.gametime === when.time &&
        nflCatalogTeams[game.away_team] === event.awayTeam &&
        nflCatalogTeams[game.home_team] === event.homeTeam &&
        game.game_id ===
          `${input.season}_${String(input.week).padStart(2, "0")}_${game.away_team}_${game.home_team}`,
    );
    if (matches.length !== 1 || event.awayTeam === event.homeTeam) continue;
    const game = matches[0];
    result.events.push({
      ...event,
      resultMapping: {
        verified: true,
        verifiedAt: files.fetchedAt,
        evidenceHash: catalogHash([
          "NFLVERSE_PRIMARY",
          event.externalEventId,
          game.game_id,
          event.scheduledStartAt,
          event.awayTeam,
          event.homeTeam,
        ]),
        apiSportsEventId: null,
        nflverseEventId: game.game_id,
        gameDate: when.date,
        awayTeam: event.awayTeam,
        homeTeam: event.homeTeam,
      },
    });
    for (const team of [event.awayTeam, event.homeTeam]) {
      const current = roster.filter(
        (player) =>
          nflCatalogTeams[player.team] === team &&
          ["QB", "RB", "WR", "TE"].includes(player.position) &&
          player.status === "ACT" &&
          /^\d{2}-\d{7}$/.test(player.gsis_id) &&
          /^[1-9]\d*$/.test(player.espn_id ?? "") &&
          // Published PFR identities retain punctuation (for example MoorD.00
          // and Ya-SRo00); neither stripping nor rejecting it is a safe join.
          /^[A-Za-z][A-Za-z0-9.-]{3,19}$/.test(player.pfr_id ?? "") &&
          player.full_name,
      );
      for (const player of current) {
        // Unique stable IDs plus current team and position establish identity;
        // odds text and approximate display names cannot repair a failed join.
        if (
          ["gsis_id", "espn_id", "pfr_id"].some(
            (key) =>
              roster.filter((row) => row[key] === player[key]).length !== 1,
          )
        )
          continue;
        const canonicalKey = `nflverse:${player.gsis_id}`;
        const evidence = {
          verified: true,
          verifiedAt: files.fetchedAt,
          evidenceHash: catalogHash(["NFLVERSE_PRIMARY", input.season, player]),
        };
        if (!directoryKeys.has(canonicalKey)) {
          directoryKeys.add(canonicalKey);
          result.directory.push({
            ...evidence,
            canonicalKey,
            displayName: player.full_name,
            position: player.position,
            team,
            validFrom: eastern(files.fetchedAt).date,
            validThrough: eastern(
              new Date(fetched + 7 * 86400000).toISOString(),
            ).date,
            bookmakerAliases: [
              ...new Set(
                (input.verifiedAliases ?? [])
                  .filter((alias) => alias.canonicalKey === canonicalKey)
                  .map((alias) => alias.name),
              ),
            ].slice(0, 10),
          });
        }
        result.mappings.push({
          ...evidence,
          canonicalKey,
          provider: "NFLVERSE",
          externalEventId: event.externalEventId,
          externalPlayerId: player.gsis_id,
          team,
          gameDate: when.date,
          sourceTeam: player.team,
          secondaryPlayerId: player.pfr_id,
          resultPathVerified: input.nflverseContractValidated,
        });
      }
    }
  }
  if (!result.events.length)
    throw new Error("CATALOG_NO_VERIFIED_EVENT_MATCHES");
  return result;
}
