import { z } from "zod";
import type { OddsUsage } from "@/adapters/providers/the-odds-api/client";
import { propFamilySchema } from "@/application/providers/player-prop-quotes";
const runSchema = z.discriminatedUnion("status", [
  z.object({ status: z.enum(["DISABLED", "IDLE"]) }),
  z.object({ status: z.literal("CLAIMED"), runId: z.uuid() }),
]);
const requestSchema = z.discriminatedUnion("status", [
  z.object({ status: z.enum(["IDLE", "DEFERRED"]) }),
  z.object({
    status: z.literal("WAIT"),
    retryAfterMs: z.number().int().min(1).max(3000),
  }),
  z.object({
    status: z.literal("CLAIMED"),
    requestId: z.uuid(),
    kind: z.enum(["MAIN", "PROPS"]),
    eventIds: z.array(z.string()).min(1).max(32),
    families: z.array(z.string()).min(1).max(3),
  }),
]);
const applicationSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("IDLE") }),
  z.object({
    status: z.literal("READY"),
    eventId: z.uuid(),
    requestIds: z.array(z.uuid()).min(1).max(4),
  }),
]);
type Claim = Extract<z.infer<typeof requestSchema>, { status: "CLAIMED" }>;
export async function executeBackgroundQuotes(deps: {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  fetch: (
    claim: Claim,
    onUsage: (usage: OddsUsage) => void,
  ) => Promise<unknown>;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
}) {
  const now = deps.now ?? Date.now,
    started = now();
  const wait =
    deps.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  async function rpc(name: string, args?: Record<string, unknown>) {
    const result = await deps.rpc(name, args);
    if (result.error) throw new Error(result.error.message);
    return result.data;
  }
  const run = runSchema.parse(await rpc("claim_background_quote_run"));
  if (run.status !== "CLAIMED")
    return { status: run.status, fetched: 0, applied: 0, failed: 0 };
  const runId = run.runId;
  let fetched = 0,
    applied = 0,
    failed = 0,
    deferred = false;
  async function fanout(limit: number) {
    for (let n = 0; n < limit && now() - started < 46_000; n++) {
      const target = applicationSchema.parse(
        await rpc("next_background_quote_application", { p_run_id: runId }),
      );
      if (target.status === "IDLE") break;
      const result = z.object({ status: z.string() }).parse(
        await rpc("apply_background_quote_event", {
          p_run_id: runId,
          p_event_id: target.eventId,
          p_request_ids: target.requestIds,
        }),
      );
      if (result.status === "FAILED") failed++;
      else applied++;
    }
  }
  try {
    // Finish saved acquisitions first, including a preceding worker crash.
    await fanout(40);
    for (let n = 0; n < 8 && now() - started < 32_000;) {
      const claim = requestSchema.parse(
        await rpc("claim_background_quote_request", { p_run_id: runId }),
      );
      if (claim.status === "WAIT") {
        await wait(claim.retryAfterMs);
        continue;
      }
      if (claim.status === "IDLE" || claim.status === "DEFERRED") {
        deferred = claim.status === "DEFERRED";
        break;
      }
      if (claim.status !== "CLAIMED") break;
      n++;
      let usage: OddsUsage = { remaining: null, used: null, last: null };
      try {
        if (claim.kind === "PROPS") {
          z.array(propFamilySchema).parse(claim.families);
          z.array(z.string()).length(1).parse(claim.eventIds);
        }
        const payload = await deps.fetch(claim, (value) => {
          usage = value;
        });
        const result = z.object({ status: z.string() }).parse(
          await rpc("complete_background_quote_request", {
            p_run_id: runId,
            p_request_id: claim.requestId,
            p_import: payload,
            p_usage: usage,
          }),
        );
        if (result.status !== "SUCCEEDED")
          throw new Error("Quote completion failed");
        fetched++;
      } catch (error) {
        const detail = error as {
          statusCode?: number;
          retryAfterSeconds?: number;
        };
        await rpc("complete_background_quote_request", {
          p_run_id: runId,
          p_request_id: claim.requestId,
          p_import: null,
          p_usage: usage,
          p_failure:
            detail.statusCode === 429
              ? "RATE_LIMIT"
              : detail.statusCode === 401 || detail.statusCode === 402
                ? "QUOTA"
                : "SOURCE",
          p_retry_after_seconds: detail.retryAfterSeconds ?? null,
        });
        failed++;
        break;
      }
      await fanout(40);
    }
    await fanout(40);
    await rpc("finish_background_quote_run", { p_run_id: runId });
  } catch {
    failed++;
  }
  return {
    status: failed ? "PARTIAL" : deferred ? "DEFERRED" : "COMPLETE",
    fetched,
    applied,
    failed,
  };
}
