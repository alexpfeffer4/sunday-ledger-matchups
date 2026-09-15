import { z } from "zod";
import { diagnoseSmokeSourceFailure } from "./source-smoke-diagnostics";
import {
  normalizeCatalogGames,
  normalizeCatalogRoster,
  sanitizeCatalogSource,
  type CatalogSource,
} from "@/adapters/providers/player-catalog-normalizer";

const numberId = z
  .union([
    z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    z.string().regex(/^[1-9]\d*$/),
  ])
  .refine((value) => Number.isSafeInteger(Number(value)))
  .transform(String);
const team = z.object({ id: numberId, name: z.string().min(1).max(60) });
const smokeGameSchema = z.object({
  id: numberId,
  season: z.literal(2026),
  scheduledStartAt: z.iso.datetime(),
  away: team,
  home: team,
  finalStatus: z.enum(["FT", "AOT"]),
});
export type SmokeGame = z.infer<typeof smokeGameSchema>;

const count = z.number().int().nonnegative().max(10_000);
export const sourceSmokeReportSchema = z
  .object({
    coverageAvailable: z.literal(true),
    gameIdentityVerified: z.literal(true),
    bothRostersAvailable: z.literal(true),
    boxScoreShapeValid: z.literal(true),
    matchingPlayerCount: count,
    passingRows: count,
    rushingRows: count,
    receivingRows: count,
    offensiveActivityRows: count,
    missingMappedPlayers: count,
    completenessValidated: z.literal(false),
    dnpValidated: z.literal(false),
    correctionValidated: z.literal(false),
  })
  .strict();
export type SourceSmokeReport = z.infer<typeof sourceSmokeReportSchema>;

export function validateSmokeCoverage(source: CatalogSource, season = 2026) {
  if (season !== 2026) throw new Error("SMOKE_SEASON_UNSUPPORTED");
  try {
    sanitizeCatalogSource(
      "COVERAGE",
      source,
      season,
      null,
      new Date().toISOString(),
    );
  } catch (error) {
    throw diagnoseSmokeSourceFailure(source, error);
  }
}

/** Choose from the actual response, before catalog sanitization removes status.
 * A completed sample is evidence of access, not permission or completeness. */
export function selectSmokeGame(source: CatalogSource, now: string): SmokeGame {
  try {
    return selectSmokeGameSource(source, now);
  } catch (error) {
    if (error instanceof z.ZodError)
      throw diagnoseSmokeSourceFailure(source, error);
    throw error;
  }
}

function selectSmokeGameSource(source: CatalogSource, now: string): SmokeGame {
  if (!Number.isFinite(Date.parse(now))) throw new Error("SMOKE_TIME_INVALID");
  const games = normalizeCatalogGames(source, 2026, now);
  const statuses = z
    .object({
      response: z.array(
        z.object({
          game: z.object({
            id: numberId,
            stage: z.string().min(1),
            status: z.object({ short: z.string().min(1) }),
          }),
        }),
      ),
    })
    .parse(source.payload).response;
  if (games.some((game) => game.away.id === game.home.id))
    throw new Error("SMOKE_GAME_TEAMS_AMBIGUOUS");
  const candidates = games.flatMap((game, index) => {
    const status = statuses[index].game;
    if (
      game.id !== status.id ||
      status.stage !== "Regular Season" ||
      !["FT", "AOT"].includes(status.status.short) ||
      Date.parse(game.scheduledStartAt) >= Date.parse(now)
    )
      return [];
    return [
      smokeGameSchema.parse({
        ...game,
        season: 2026,
        finalStatus: status.status.short,
      }),
    ];
  });
  candidates.sort(
    (left, right) =>
      Date.parse(right.scheduledStartAt) - Date.parse(left.scheduledStartAt) ||
      Number(left.id) - Number(right.id),
  );
  if (!candidates.length) throw new Error("SMOKE_COMPLETED_GAME_UNAVAILABLE");
  return candidates[0];
}

export function validateSmokeRoster(source: CatalogSource, teamId: string) {
  try {
    return normalizeCatalogRoster(
      source,
      2026,
      teamId,
      new Date().toISOString(),
    );
  } catch (error) {
    throw diagnoseSmokeSourceFailure(source, error);
  }
}

const boxSchema = z.object({
  get: z.literal("games/statistics/players"),
  parameters: z.object({ id: numberId }),
  errors: z.union([z.array(z.unknown()).length(0), z.object({}).strict()]),
  results: z.number().int().nonnegative(),
  response: z.array(
    z.object({
      team,
      players: z.array(
        z.object({
          player: z.object({ id: numberId, name: z.string().min(1).max(120) }),
          groups: z.array(
            z.object({
              name: z.string().min(1).max(100),
              statistics: z.array(
                z.object({
                  name: z.string().min(1).max(100),
                  value: z.union([z.string(), z.number(), z.null()]),
                }),
              ),
            }),
          ),
        }),
      ),
    }),
  ),
});
function integer(value: string | number | null) {
  if (typeof value === "string" && !/^-?\d+$/.test(value.trim())) return null;
  return value !== null && Number.isSafeInteger(Number(value))
    ? Number(value)
    : null;
}

/** Raw names, IDs, statistics and profiles stay ephemeral. The returned report
 * deliberately cannot authorize settlement, source activation, or DNP handling. */
export function summarizeSmokeSample(input: {
  game: SmokeGame;
  rosters: [CatalogSource, CatalogSource];
  boxScore: CatalogSource;
}): SourceSmokeReport {
  const game = smokeGameSchema.parse(input.game);
  const now = new Date().toISOString();
  if (
    game.away.id === game.home.id ||
    Date.parse(game.scheduledStartAt) >= Date.parse(now)
  )
    throw new Error("SMOKE_GAME_IDENTITY_UNVERIFIED");
  const teams = [game.away, game.home];
  const rosters = input.rosters.map((source, index) =>
    validateSmokeRoster(source, teams[index].id),
  );
  const rosterIds = rosters.flat().map((row) => row.id);
  if (new Set(rosterIds).size !== rosterIds.length)
    throw new Error("SMOKE_ROSTER_TEAMS_AMBIGUOUS");
  const box = (() => {
    try {
      return boxSchema.parse(input.boxScore.payload);
    } catch (error) {
      throw diagnoseSmokeSourceFailure(input.boxScore, error);
    }
  })();
  const fetchedAt = Date.parse(input.boxScore.fetchedAt);
  if (
    !Number.isFinite(fetchedAt) ||
    fetchedAt > Date.parse(now) ||
    Date.parse(now) - fetchedAt > 48 * 3_600_000 ||
    box.parameters.id !== game.id ||
    box.results !== box.response.length ||
    box.response.length !== 2 ||
    new Set(box.response.map((row) => row.team.id)).size !== 2
  )
    throw new Error("SMOKE_BOX_SCOPE_UNVERIFIED");

  const seen = new Set<string>();
  const yardage = { passing: 0, rushing: 0, receiving: 0 };
  let offensiveActivityRows = 0;
  for (const block of box.response) {
    const teamIndex = teams.findIndex(
      (team) => team.id === block.team.id && team.name === block.team.name,
    );
    if (teamIndex < 0 || !block.players.length)
      throw new Error("SMOKE_BOX_TEAM_UNVERIFIED");
    for (const row of block.players) {
      const profile = rosters[teamIndex].find(
        (profile) => profile.id === row.player.id,
      );
      if (
        !profile ||
        profile.name !== row.player.name ||
        seen.has(row.player.id)
      )
        throw new Error("SMOKE_BOX_PLAYER_UNVERIFIED");
      seen.add(row.player.id);
      const groupNames = row.groups.map((group) => group.name.toLowerCase());
      if (new Set(groupNames).size !== groupNames.length)
        throw new Error("SMOKE_STATISTIC_AMBIGUOUS");
      let offense = false;
      for (const group of row.groups) {
        const names = group.statistics.map((stat) => stat.name.toLowerCase());
        if (new Set(names).size !== names.length)
          throw new Error("SMOKE_STATISTIC_AMBIGUOUS");
        const groupName = group.name.toLowerCase();
        if (
          groupName !== "passing" &&
          groupName !== "rushing" &&
          groupName !== "receiving"
        )
          continue;
        if (
          group.statistics.some(
            (stat) =>
              stat.name.toLowerCase() === "yards" &&
              integer(stat.value) !== null,
          )
        )
          yardage[groupName]++;
        offense ||= group.statistics.some(
          (stat) =>
            ["attempts", "receptions"].includes(stat.name.toLowerCase()) &&
            (integer(stat.value) ?? 0) > 0,
        );
      }
      if (offense) offensiveActivityRows++;
    }
  }
  return sourceSmokeReportSchema.parse({
    coverageAvailable: true,
    gameIdentityVerified: true,
    bothRostersAvailable: true,
    boxScoreShapeValid: true,
    matchingPlayerCount: seen.size,
    passingRows: yardage.passing,
    rushingRows: yardage.rushing,
    receivingRows: yardage.receiving,
    offensiveActivityRows,
    // Roster absence is counted for operator diagnosis; it never means DNP.
    missingMappedPlayers: rosters
      .flat()
      .filter(
        (profile) =>
          ["QB", "RB", "WR", "TE"].includes(profile.position) &&
          !seen.has(profile.id),
      ).length,
    completenessValidated: false,
    dnpValidated: false,
    correctionValidated: false,
  });
}
