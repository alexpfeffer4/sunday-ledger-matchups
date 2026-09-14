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
  return value !== undefined && /^-?\d+(?:\.0+)?$/.test(value.trim())
    ? Number(value)
    : null;
}
export function normalizeNflversePlayerResults(context: {
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
}): PlayerObservation[] {
  const stats = parseNflverseCsv(context.statsCsv);
  const snaps = parseNflverseCsv(context.snapsCsv);
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
