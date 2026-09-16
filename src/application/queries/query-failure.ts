import "server-only";
import { randomUUID } from "node:crypto";

type QueryOperation =
  | "get_stage1_state"
  | "get_live_quote_heads"
  | "get_player_prop_menu"
  | "get_card_review_context"
  | "get_weekly_close_state";

const safeCodes = new Set([
  "42501",
  "28000",
  "P0002",
  "PGRST116",
  "PGRST202",
  "55000",
  "57014",
  "53300",
  "40P01",
  "40001",
  "08006",
  "XX000",
]);

/** Deliberately not a query wrapper: each caller retains its authorization,
 * compatibility fallback and null/error decisions. Never attach the raw cause.
 */
export function queryFailure(
  operation: QueryOperation,
  startedAt: number,
  cause: { code?: string },
  message: string,
) {
  const correlationId = randomUUID();
  console.error("league_query_failed", {
    operation,
    code: safeCodes.has(cause.code ?? "") ? cause.code : "UNCLASSIFIED",
    correlationId,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
  });
  return new Error(message, { cause: { correlationId } });
}
