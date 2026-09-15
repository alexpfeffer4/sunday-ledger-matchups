import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  selectSmokeGame,
  sourceSmokeReportSchema,
  summarizeSmokeSample,
  validateSmokeCoverage,
  validateSmokeRoster,
} from "@/adapters/providers/api-sports/source-smoke-normalizer";
import { SmokeSourceFailure } from "@/adapters/providers/api-sports/source-smoke-diagnostics";

const now = "2026-09-15T15:00:00.000Z";
beforeEach(() => vi.useFakeTimers().setSystemTime(new Date(now)));
afterEach(() => vi.useRealTimers());

function source<T>(
  get: string,
  parameters: Record<string, string>,
  response: T[],
) {
  return {
    fetchedAt: now,
    payload: {
      get,
      parameters,
      errors: [] as unknown[],
      results: response.length,
      response,
    },
  };
}
function fixture() {
  const away = { id: 1, name: "Away Team" };
  const home = { id: 2, name: "Home Team" };
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
      game: {
        id: 10,
        stage: "Regular Season",
        status: { short: "FT" },
        date: { timestamp: Date.parse("2026-09-14T00:20:00.000Z") / 1000 },
      },
      league: { id: 1, season: "2026" },
      teams: { away, home },
    },
  ]);
  const profiles = (offset: number) => [
    { id: offset + 1, name: `Player ${offset + 1}`, position: "QB" },
    { id: offset + 2, name: `Player ${offset + 2}`, position: "RB" },
    { id: offset + 3, name: `Player ${offset + 3}`, position: "WR" },
  ];
  const rosters = [
    source("players", { team: "1", season: "2026" }, profiles(10)),
    source("players", { team: "2", season: "2026" }, profiles(20)),
  ] as const;
  const player = (
    id: number,
    name: string,
    yards: string | number | null,
    activity: number,
  ) => ({
    player: { id, name: `Player ${id}` },
    groups: [
      {
        name,
        statistics: [
          { name: "yards", value: yards },
          {
            name: name === "receiving" ? "receptions" : "attempts",
            value: activity,
          },
        ],
      },
    ],
  });
  const boxScore = source("games/statistics/players", { id: "10" }, [
    {
      team: away,
      players: [player(11, "passing", 250, 30), player(12, "rushing", -2, 3)],
    },
    { team: home, players: [player(23, "receiving", "0", 0)] },
  ]);
  return {
    coverage,
    games,
    rosters: [...rosters] as [(typeof rosters)[0], (typeof rosters)[1]],
    boxScore,
  };
}
function sample() {
  const input = fixture();
  validateSmokeCoverage(input.coverage);
  return { ...input, game: selectSmokeGame(input.games, now) };
}

it("requires nonempty error-free current-season coverage before downstream calls", () => {
  const input = fixture();
  expect(() => validateSmokeCoverage(input.coverage)).not.toThrow();
  expect(() => validateSmokeCoverage(input.coverage, 2025)).toThrow(
    "SMOKE_SEASON_UNSUPPORTED",
  );
  input.coverage.payload.response[0].seasons[0].coverage.games.statisitcs.players = false;
  expect(() => validateSmokeCoverage(input.coverage)).toThrow(
    "CURRENT_SEASON_UNAVAILABLE",
  );
  input.coverage.payload.response[0].seasons[0].coverage.games.statisitcs.players = true;
  input.coverage.payload.errors.push({ plan: "restricted" });
  expect(() => validateSmokeCoverage(input.coverage)).toThrow();
});

it("identifies malformed roster fields using that roster's payload", () => {
  const input = fixture();
  (input.rosters[0].payload.response[0] as Record<string, unknown>).position =
    null;
  try {
    validateSmokeRoster(input.rosters[0], "1");
    throw new Error("Expected invalid roster to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(SmokeSourceFailure);
    expect((error as SmokeSourceFailure).diagnostic.issues).toContainEqual({
      path: ["*", "position"],
      code: "invalid_type",
      expectedType: "string",
      observedType: "null",
    });
  }
});

it("identifies malformed game fields using the game envelope", () => {
  const input = fixture();
  (
    input.games.payload.response[0].game.status as Record<string, unknown>
  ).short = null;
  try {
    selectSmokeGame(input.games, now);
    throw new Error("Expected invalid game to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(SmokeSourceFailure);
    expect((error as SmokeSourceFailure).diagnostic.issues).toContainEqual({
      path: ["response", "*", "game", "status", "short"],
      code: "invalid_type",
      expectedType: "string",
      observedType: "null",
    });
  }
});

it("identifies malformed box-score fields from the box payload rather than a prior roster", () => {
  const input = sample();
  (
    input.boxScore.payload.response[0].players[0] as Record<string, unknown>
  ).groups = null;
  try {
    summarizeSmokeSample(input);
    throw new Error("Expected invalid box score to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(SmokeSourceFailure);
    expect((error as SmokeSourceFailure).diagnostic.issues).toContainEqual({
      path: ["response", "*", "players", "*", "groups"],
      code: "invalid_type",
      expectedType: "array",
      observedType: "null",
    });
  }
});

it("selects the latest completed regular-season game, then the lower numeric ID on ties", () => {
  const { games } = fixture();
  const initial = games.payload.response[0];
  games.payload.response = [
    { ...initial, game: { ...initial.game, id: 20, status: { short: "AOT" } } },
    { ...initial, game: { ...initial.game, id: 8, status: { short: "AOT" } } },
    {
      ...initial,
      game: {
        ...initial.game,
        id: 50,
        stage: "Pre Season",
        date: { timestamp: Date.parse(now) / 1000 - 10 },
      },
    },
    {
      ...initial,
      game: {
        ...initial.game,
        id: 51,
        status: { short: "NS" },
        date: { timestamp: Date.parse(now) / 1000 - 10 },
      },
    },
    {
      ...initial,
      game: {
        ...initial.game,
        id: 52,
        date: { timestamp: Date.parse(now) / 1000 + 10 },
      },
    },
    {
      ...initial,
      game: {
        ...initial.game,
        id: 1,
        date: { timestamp: initial.game.date.timestamp - 1 },
      },
    },
  ];
  games.payload.results = games.payload.response.length;
  expect(selectSmokeGame(games, now)).toEqual({
    id: "8",
    season: 2026,
    scheduledStartAt: "2026-09-14T00:20:00.000Z",
    away: { id: "1", name: "Away Team" },
    home: { id: "2", name: "Home Team" },
    finalStatus: "AOT",
  });
});

it.each(["NS", "Q4", "OT", "CANC", "PST", "UNKNOWN"])(
  "does not mistake %s for completed evidence",
  (status) => {
    const { games } = fixture();
    games.payload.response[0].game.status.short = status;
    expect(() => selectSmokeGame(games, now)).toThrow(
      "SMOKE_COMPLETED_GAME_UNAVAILABLE",
    );
  },
);

it("rejects cross-season, duplicate or ambiguous game identities and stale sources", () => {
  const crossSeason = fixture().games;
  crossSeason.payload.response[0].league.season = "2025";
  expect(() => selectSmokeGame(crossSeason, now)).toThrow(
    "CATALOG_GAME_IDENTITY_AMBIGUOUS",
  );
  const duplicate = fixture().games;
  duplicate.payload.response.push(duplicate.payload.response[0]);
  duplicate.payload.results++;
  expect(() => selectSmokeGame(duplicate, now)).toThrow(
    "CATALOG_GAME_IDENTITY_AMBIGUOUS",
  );
  const sameTeam = fixture().games;
  sameTeam.payload.response[0].teams.home.id = 1;
  expect(() => selectSmokeGame(sameTeam, now)).toThrow(
    "SMOKE_GAME_TEAMS_AMBIGUOUS",
  );
  const stale = fixture().games;
  stale.fetchedAt = "2026-09-12T00:00:00.000Z";
  expect(() => selectSmokeGame(stale, now)).toThrow("CATALOG_SOURCE_STALE");
});

it("returns only diagnostic counts and false completeness, DNP and correction proofs", () => {
  const report = summarizeSmokeSample(sample());
  expect(report).toEqual({
    coverageAvailable: true,
    gameIdentityVerified: true,
    bothRostersAvailable: true,
    boxScoreShapeValid: true,
    matchingPlayerCount: 3,
    passingRows: 1,
    rushingRows: 1,
    receivingRows: 1,
    offensiveActivityRows: 2,
    missingMappedPlayers: 3,
    completenessValidated: false,
    dnpValidated: false,
    correctionValidated: false,
  });
  expect(
    Object.values(report).every(
      (value) => typeof value === "boolean" || typeof value === "number",
    ),
  ).toBe(true);
  expect(
    sourceSmokeReportSchema.safeParse({ ...report, playerName: "Player 11" })
      .success,
  ).toBe(false);
  expect(
    sourceSmokeReportSchema.safeParse({
      ...report,
      completenessValidated: true,
    }).success,
  ).toBe(false);
});

it("counts explicit zero and negative yardage without treating zero-only rows as offensive participation", () => {
  const input = sample();
  input.boxScore.payload.response[0].players[0].groups[0].statistics[0].value =
    "0";
  input.boxScore.payload.response[0].players[0].groups[0].statistics[1].value = 0;
  expect(summarizeSmokeSample(input)).toMatchObject({
    passingRows: 1,
    rushingRows: 1,
    receivingRows: 1,
    offensiveActivityRows: 1,
    dnpValidated: false,
  });
});

it.each([null, "", "N/A", "0.5", Number.MAX_SAFE_INTEGER + 1])(
  "does not turn missing or invalid individual yards (%s) into zero",
  (value) => {
    const input = sample();
    input.boxScore.payload.response[0].players[0].groups[0].statistics[0].value =
      value;
    expect(summarizeSmokeSample(input)).toMatchObject({
      passingRows: 0,
      offensiveActivityRows: 2,
      completenessValidated: false,
    });
  },
);

it("matches response teams by identity even when their wire order changes", () => {
  const input = sample();
  input.boxScore.payload.response.reverse();
  expect(summarizeSmokeSample(input).matchingPlayerCount).toBe(3);
});

it("rejects HTTP-success error envelopes, wrong event IDs, omitted teams and conflicting team labels", () => {
  const error = sample();
  error.boxScore.payload.errors.push({ request: "not allowed" });
  expect(() => summarizeSmokeSample(error)).toThrow();
  const wrongGame = sample();
  wrongGame.boxScore.payload.parameters.id = "99";
  expect(() => summarizeSmokeSample(wrongGame)).toThrow(
    "SMOKE_BOX_SCOPE_UNVERIFIED",
  );
  const oneTeam = sample();
  oneTeam.boxScore.payload.response.pop();
  oneTeam.boxScore.payload.results--;
  expect(() => summarizeSmokeSample(oneTeam)).toThrow(
    "SMOKE_BOX_SCOPE_UNVERIFIED",
  );
  const wrongTeam = sample();
  wrongTeam.boxScore.payload.response[1].team.name = "Unrelated Team";
  expect(() => summarizeSmokeSample(wrongTeam)).toThrow(
    "SMOKE_BOX_TEAM_UNVERIFIED",
  );
});

it("fails closed on repeated players, unverified identities and cross-team roster duplication", () => {
  const duplicate = sample();
  duplicate.boxScore.payload.response[0].players.push(
    duplicate.boxScore.payload.response[0].players[0],
  );
  expect(() => summarizeSmokeSample(duplicate)).toThrow(
    "SMOKE_BOX_PLAYER_UNVERIFIED",
  );
  const wrongName = sample();
  wrongName.boxScore.payload.response[0].players[0].player.name =
    "Other Person";
  expect(() => summarizeSmokeSample(wrongName)).toThrow(
    "SMOKE_BOX_PLAYER_UNVERIFIED",
  );
  const unknown = sample();
  unknown.boxScore.payload.response[0].players[0].player.id = 999;
  expect(() => summarizeSmokeSample(unknown)).toThrow(
    "SMOKE_BOX_PLAYER_UNVERIFIED",
  );
  const crossTeam = sample();
  crossTeam.rosters[1].payload.response[0].id = 11;
  expect(() => summarizeSmokeSample(crossTeam)).toThrow(
    "SMOKE_ROSTER_TEAMS_AMBIGUOUS",
  );
});

it("rejects duplicate statistic groups and ambiguous repeated yardage keys", () => {
  const groups = sample();
  const row = groups.boxScore.payload.response[0].players[0];
  row.groups.push({ ...row.groups[0], name: "PASSING" });
  expect(() => summarizeSmokeSample(groups)).toThrow(
    "SMOKE_STATISTIC_AMBIGUOUS",
  );
  const values = sample();
  values.boxScore.payload.response[0].players[0].groups[0].statistics.push({
    name: "YARDS",
    value: 300,
  });
  expect(() => summarizeSmokeSample(values)).toThrow(
    "SMOKE_STATISTIC_AMBIGUOUS",
  );
});

it("does not count special-teams activity as offense or infer missing roster players as DNP", () => {
  const input = sample();
  const row = input.boxScore.payload.response[1].players[0];
  row.groups = [
    {
      name: "Punt returns",
      statistics: [
        { name: "attempts", value: 5 },
        { name: "yards", value: 50 },
      ],
    },
  ];
  expect(summarizeSmokeSample(input)).toMatchObject({
    receivingRows: 0,
    offensiveActivityRows: 2,
    missingMappedPlayers: 3,
    dnpValidated: false,
  });
});

it("rejects unknown box structure and stale or future sample timestamps", () => {
  const unknown = sample();
  unknown.boxScore.payload.get = "games/statistics/teams";
  expect(() => summarizeSmokeSample(unknown)).toThrow();
  const future = sample();
  future.boxScore.fetchedAt = "2026-09-16T00:00:00.000Z";
  expect(() => summarizeSmokeSample(future)).toThrow(
    "SMOKE_BOX_SCOPE_UNVERIFIED",
  );
  const stale = sample();
  stale.boxScore.fetchedAt = "2026-09-12T00:00:00.000Z";
  expect(() => summarizeSmokeSample(stale)).toThrow(
    "SMOKE_BOX_SCOPE_UNVERIFIED",
  );
});
