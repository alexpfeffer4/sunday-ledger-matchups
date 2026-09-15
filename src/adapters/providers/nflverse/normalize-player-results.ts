import { createHash } from "node:crypto";
import {
  playerObservationSchema,
  type PlayerObservation,
  type ResultPlayerMapping,
} from "@/application/providers/player-results";

type CsvRow = Record<string, string>;
/** RFC 4180 field/line handling, including quoted commas and escaped quotes. */
export function parseNflverseCsv(csv: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (char === '"') {
      if (quoted && csv[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && csv[i + 1] === "\n") i++;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new Error("INCOMPLETE_CSV");
  if (row.length || field) {
    row.push(field);
    rows.push(row);
  }
  const headers = rows.shift();
  if (!headers) return [];
  if (new Set(headers).size !== headers.length)
    throw new Error("DUPLICATE_CSV_HEADERS");
  return rows.map((values) => {
    if (values.length !== headers.length) throw new Error("INCOMPLETE_CSV_ROW");
    return Object.fromEntries(
      headers.map((header, index) => [header, values[index]]),
    );
  });
}
function integer(value: string | undefined): number | null {
  if (value === undefined || !/^-?\d+(?:\.0+)?$/.test(value.trim()))
    return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

type NflverseResultContext = {
  externalEventId: string;
  sourceEventId: string;
  gameDate: string;
  fetchedAt: string;
  sourceUpdatedAt: string;
  participationSourceUpdatedAt?: string;
  final: boolean;
  statsComplete: boolean;
  snapsComplete: boolean;
  statsCsv: string;
  snapsCsv: string;
  mappings: readonly (ResultPlayerMapping & { pfrPlayerId: string | null })[];
};

export function parseNflverseResultFiles(files: {
  statsCsv: string;
  snapsCsv: string;
}) {
  return {
    stats: parseNflverseCsv(files.statsCsv),
    snaps: parseNflverseCsv(files.snapsCsv),
  };
}

/** The approved overnight contract covers explicit per-game published rows,
 * never a complete roster. Finality comes from the reliable game-result job;
 * both independent artifacts must have been revised after that final and must
 * contain both correctly identified teams. These checks detect stale, partial
 * and mis-scoped exports; they are not a proof that the publisher has no error
 * or a substitute for the governed correction / verified-exception process. */
export function normalizePublishedNflversePlayerResults(
  context: Omit<
    NflverseResultContext,
    "statsComplete" | "snapsComplete" | "statsCsv" | "snapsCsv"
  > & {
    finalObservedAt: string;
    scheduledStartAt: string;
    awayTeam: string;
    homeTeam: string;
  },
  rows: ReturnType<typeof parseNflverseResultFiles>,
): PlayerObservation[] {
  const game = /^(\d{4})_(\d{2})_([A-Z]{2,3})_([A-Z]{2,3})$/.exec(
    context.sourceEventId,
  );
  const finalAt = Date.parse(context.finalObservedAt);
  const startAt = Date.parse(context.scheduledStartAt);
  const fetchedAt = Date.parse(context.fetchedAt);
  const revisions = [
    context.sourceUpdatedAt,
    context.participationSourceUpdatedAt,
  ].map((value) => (value === undefined ? NaN : Date.parse(value)));
  const scheduledDate = Number.isFinite(startAt)
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(startAt))
    : null;
  if (
    !context.final ||
    !Number.isFinite(finalAt) ||
    !Number.isFinite(fetchedAt) ||
    !Number.isFinite(startAt) ||
    finalAt <= startAt ||
    finalAt > fetchedAt ||
    revisions.some(
      (revision) =>
        !Number.isFinite(revision) ||
        revision < finalAt ||
        revision > fetchedAt,
    )
  )
    throw new Error("NFLVERSE_POST_FINAL_REVISION_REQUIRED");
  if (
    !game ||
    game[3] !== context.awayTeam ||
    game[4] !== context.homeTeam ||
    context.awayTeam === context.homeTeam ||
    scheduledDate !== context.gameDate
  )
    throw new Error("NFLVERSE_GAME_SCOPE_MISMATCH");
  const stats = rows.stats
    .filter((row) => row.game_id === context.sourceEventId)
    // nflverse can publish anonymous non-offensive aggregate rows. They are
    // not player evidence and cannot establish either team's coverage. Only
    // the observed all-zero offensive shape is excluded; ambiguous rows fail.
    .filter(
      (row) =>
        row.player_id ||
        !["passing_yards", "rushing_yards", "receiving_yards"].every(
          (field) => integer(row[field]) === 0,
        ),
    );
  const snaps = rows.snaps.filter(
    (row) => row.game_id === context.sourceEventId,
  );
  const teams = [context.awayTeam, context.homeTeam];
  const gameType = stats[0]?.season_type;
  for (const [kind, gameRows] of [
    ["stats", stats],
    ["snaps", snaps],
  ] as const) {
    const ids = new Set<string>();
    for (const row of gameRows) {
      const team = row.team ?? row.recent_team;
      const opponent = kind === "stats" ? row.opponent_team : row.opponent;
      const id = kind === "stats" ? row.player_id : row.pfr_player_id;
      const rowGameType = kind === "stats" ? row.season_type : row.game_type;
      if (
        !id ||
        ids.has(id) ||
        !teams.includes(team) ||
        opponent !== teams.find((candidate) => candidate !== team) ||
        integer(row.season) !== Number(game[1]) ||
        integer(row.week) !== Number(game[2]) ||
        !["REG", "POST"].includes(rowGameType) ||
        rowGameType !== gameType ||
        (kind === "stats" &&
          ["passing_yards", "rushing_yards", "receiving_yards"].some(
            (field) =>
              row[field] === undefined ||
              (row[field] !== "" && integer(row[field]) === null),
          )) ||
        (kind === "snaps" &&
          (!row.pfr_game_id?.startsWith(context.gameDate.replaceAll("-", "")) ||
            row.pfr_game_id !== snaps[0]?.pfr_game_id ||
            integer(row.offense_snaps) === null ||
            integer(row.offense_snaps)! < 0))
      )
        throw new Error("NFLVERSE_GAME_EVIDENCE_INVALID");
      ids.add(id);
    }
    if (
      teams.some(
        (team) =>
          !gameRows.some(
            (row) =>
              (row.team ?? row.recent_team) === team &&
              (kind === "stats" || (integer(row.offense_snaps) ?? 0) > 0),
          ),
      )
    )
      throw new Error("NFLVERSE_BOTH_TEAMS_REQUIRED");
  }
  if (
    context.mappings.some(
      (mapping) => !teams.includes(mapping.sourceTeam ?? mapping.team),
    )
  )
    throw new Error("RESULT_PLAYER_MAPPING_MISMATCH");
  return normalizeRows(
    { ...context, statsComplete: true, snapsComplete: true },
    { stats, snaps },
  );
}

export function normalizeNflversePlayerResults(
  context: NflverseResultContext,
): PlayerObservation[] {
  return normalizeRows(context, parseNflverseResultFiles(context));
}

function normalizeRows(
  context: Omit<NflverseResultContext, "statsCsv" | "snapsCsv">,
  { stats, snaps }: ReturnType<typeof parseNflverseResultFiles>,
): PlayerObservation[] {
  return context.mappings.map((mapping) => {
    const playerStats = stats.filter(
      (row) =>
        row.game_id === context.sourceEventId &&
        row.player_id === mapping.externalPlayerId,
    );
    const playerSnaps = mapping.pfrPlayerId
      ? snaps.filter(
          (row) =>
            row.game_id === context.sourceEventId &&
            row.pfr_player_id === mapping.pfrPlayerId,
        )
      : [];
    if (
      playerStats.length > 1 ||
      playerSnaps.length > 1 ||
      playerStats.some(
        (row) =>
          (row.team ?? row.recent_team) !==
          (mapping.sourceTeam ?? mapping.team),
      ) ||
      playerSnaps.some(
        (row) => row.team !== (mapping.sourceTeam ?? mapping.team),
      )
    )
      throw new Error("RESULT_PLAYER_MAPPING_MISMATCH");
    const stat = playerStats[0];
    const snap = playerSnaps[0];
    const field = {
      PASSING_YARDS: "passing_yards",
      RUSHING_YARDS: "rushing_yards",
      RECEIVING_YARDS: "receiving_yards",
    }[mapping.statistic];
    const value = integer(stat?.[field]);
    const offenseSnaps = integer(snap?.offense_snaps);
    const participationKnown =
      context.final &&
      context.snapsComplete &&
      offenseSnaps !== null &&
      offenseSnaps >= 0;
    const evidence = {
      provider: "NFLVERSE" as const,
      externalEventId: context.externalEventId,
      sourceEventId: context.sourceEventId,
      externalPlayerId: mapping.externalPlayerId,
      subjectId: mapping.subjectId,
      team: mapping.team,
      statistic: mapping.statistic,
      gameDate: context.gameDate,
      period: "FULL_GAME" as const,
      value,
      complete: context.final && context.statsComplete && value !== null,
      participation: participationKnown
        ? offenseSnaps! > 0
          ? ("OFFENSE" as const)
          : ("NO_OFFENSE" as const)
        : ("UNKNOWN" as const),
      participationComplete: participationKnown,
      sourceUpdatedAt: context.sourceUpdatedAt,
      participationSourceUpdatedAt:
        context.participationSourceUpdatedAt ?? context.sourceUpdatedAt,
      fetchedAt: context.fetchedAt,
    };
    const content = { ...evidence, fetchedAt: undefined };
    return playerObservationSchema.parse({
      ...evidence,
      contentHash: createHash("sha256")
        .update(JSON.stringify(content))
        .digest("hex"),
    });
  });
}
