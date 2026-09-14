import { createHash } from "node:crypto";
import { z } from "zod";
import { playerObservationSchema, type PlayerObservation, type ResultPlayerMapping } from "@/application/providers/player-results";

const valueSchema = z.union([z.string(), z.number(), z.null()]);
const statisticSchema = z.object({ name: z.string(), value: valueSchema });
const groupSchema = z.object({ name: z.string(), statistics: z.array(statisticSchema) });
const responseSchema = z.object({
  errors: z.union([z.array(z.unknown()).length(0), z.object({}).strict()]),
  parameters: z.object({ id: z.union([z.string(), z.number()]) }),
  response: z.array(z.object({
    team: z.object({ id: z.number().int(), name: z.string() }),
    players: z.array(z.object({
      player: z.object({ id: z.number().int(), name: z.string() }),
      groups: z.array(groupSchema),
    })),
  })),
});
function integer(value: unknown): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : null;
  return typeof value === "string" && /^-?\d+$/.test(value.trim()) ? Number(value) : null;
}

/** Candidate documented box-score shape. Unknown names/fields fail closed. A
 * final team score alone does not make a missing individual row a complete zero.
 * Current-account wire shape and delivery completeness remain activation checks. */
export function normalizeApiSportsPlayerResults(raw: unknown, context: {
  externalEventId: string; sourceEventId: string; gameDate: string;
  fetchedAt: string; sourceUpdatedAt: string | null; final: boolean;
  completeBoxScore: boolean; mappings: readonly ResultPlayerMapping[];
}): PlayerObservation[] {
  const parsed = responseSchema.parse(raw);
  if (String(parsed.parameters.id) !== context.sourceEventId) throw new Error("RESULT_EVENT_MISMATCH");
  return context.mappings.map((mapping) => {
    const rows = parsed.response.flatMap((team) => team.players
      .filter((row) => String(row.player.id) === mapping.externalPlayerId)
      .map((row) => ({ ...row, team: team.team.name })));
    if (rows.length > 1 || (rows[0] && rows[0].team !== (mapping.sourceTeam ?? mapping.team))) throw new Error("RESULT_PLAYER_MAPPING_MISMATCH");
    const row = rows[0];
    const groupName = { PASSING_YARDS: "passing", RUSHING_YARDS: "rushing", RECEIVING_YARDS: "receiving" }[mapping.statistic];
    const groups = row?.groups.filter((group) => group.name.toLowerCase() === groupName) ?? [];
    if (groups.length > 1) throw new Error("AMBIGUOUS_STATISTIC_GROUP");
    const values = groups[0]?.statistics.filter((stat) => stat.name.toLowerCase() === "yards") ?? [];
    if (values.length > 1) throw new Error("AMBIGUOUS_STATISTIC_VALUE");
    const value = integer(values[0]?.value);
    const offense = row?.groups.some((group) => ["passing", "rushing", "receiving"].includes(group.name.toLowerCase())
      && group.statistics.some((stat) => ["attempts", "receptions"].includes(stat.name.toLowerCase()) && (integer(stat.value) ?? 0) > 0)) ?? false;
    const evidence = {
      provider: "API_SPORTS" as const, externalEventId: context.externalEventId,
      sourceEventId: context.sourceEventId, ...mapping, gameDate: context.gameDate,
      period: "FULL_GAME" as const, value,
      complete: context.final && context.completeBoxScore && value !== null,
      participation: offense ? "OFFENSE" as const : "UNKNOWN" as const,
      participationComplete: offense,
      sourceUpdatedAt: context.sourceUpdatedAt, fetchedAt: context.fetchedAt,
    };
    // Hash source meaning independently of fetch time so retries are idempotent.
    const content = { ...evidence, fetchedAt: undefined };
    return playerObservationSchema.parse({ ...evidence, contentHash: createHash("sha256").update(JSON.stringify(content)).digest("hex") });
  });
}
