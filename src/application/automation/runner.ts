import { z } from "zod";
import {
  expectedAutomationGames,
  normalizeAutomationSchedule,
  selectAutomationMarkets,
} from "./schedule";
import type { NormalizedProviderEventWithMarkets } from "@/application/providers/normalized-provider";

type Rpc = (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;
const claimSchema = z.discriminatedUnion("status", [
  z.object({ status: z.enum(["DISABLED", "IDLE"]) }),
  z.object({
    status: z.literal("CLAIMED"),
    runId: z.uuid(),
    operation: z.enum([
      "SYNC_SCHEDULE",
      "PREPARE",
      "VALIDATE",
      "OPEN",
      "RECONCILE",
      "QUALIFY",
      "CHAMPION",
      "ARCHIVE",
    ]),
    week: z.number().int().min(1).max(18),
    season: z.number().int(),
    preset: z.enum(["ALL_NFL_GAMES", "SUNDAY_AFTERNOON_AND_MONDAY"]),
  }),
]);
export type AutomationDependencies = {
  rpc: Rpc;
  schedule: (season: number) => Promise<string>;
  odds: (onUsage: (remaining: number | null) => void) => Promise<{
    source: string;
    fetchedAt: string;
    events: NormalizedProviderEventWithMarkets[];
  }>;
  now?: () => number;
};

/** Small fair batch; every claim performs one action. HTTP scope comes only from
 * the database. No network call is made for idle or stored-state-only actions. */
export async function executeSeasonAutomation(deps: AutomationDependencies) {
  const now = deps.now ?? Date.now,
    deadline = now() + 45_000;
  let attempted = 0,
    failed = 0;
  for (let count = 0; count < 3 && now() < deadline - 25_000; count++) {
    const claimed = await deps.rpc("claim_season_automation");
    if (claimed.error) throw new Error("AUTOMATION_CLAIM_UNAVAILABLE");
    const claim = claimSchema.parse(claimed.data);
    if (claim.status !== "CLAIMED")
      return {
        status: failed ? "PARTIAL" : attempted ? "COMPLETE" : claim.status,
        attempted,
        failed,
      };
    attempted++;
    let schedule: ReturnType<typeof normalizeAutomationSchedule> | null = null;
    let imported: Awaited<ReturnType<AutomationDependencies["odds"]>> | null =
      null;
    let failure: string | null = null;
    try {
      if (
        claim.operation === "SYNC_SCHEDULE" ||
        claim.operation === "PREPARE"
      ) {
        failure = "SCHEDULE_UNAVAILABLE";
        schedule = normalizeAutomationSchedule(
          await deps.schedule(claim.season),
          claim.season,
        );
      }
      if (claim.operation === "PREPARE") {
        failure = "PROVIDER_BUDGET";
        const reservation = await deps.rpc("claim_season_automation_odds", {
          p_run: claim.runId,
        });
        if (reservation.error) throw new Error("PROVIDER_BUDGET");
        const requestId = z.uuid().parse(reservation.data);
        let remaining: number | null = null,
          succeeded = false;
        try {
          failure = "MARKETS_UNAVAILABLE";
          const all = await deps.odds((value) => {
            remaining = value;
          });
          succeeded = true;
          imported = {
            ...all,
            events: selectAutomationMarkets(
              all.events,
              expectedAutomationGames(schedule!, claim.week, claim.preset),
            ),
          };
        } finally {
          const finished = await deps.rpc("complete_provider_request", {
            p_request_id: requestId,
            p_import: succeeded ? {} : null,
            p_requests_remaining: remaining ?? undefined,
          });
          if (finished.error) throw new Error("PROVIDER_USAGE_UNAVAILABLE");
        }
      }
      failure = null;
    } catch {
      failure ??= "WORKER_UNAVAILABLE";
    }
    try {
      const completed = await deps.rpc("complete_season_automation", {
        p_run: claim.runId,
        p_schedule: schedule,
        p_import: imported,
        p_failure: failure,
      });
      if (
        completed.error ||
        z.object({ status: z.string() }).parse(completed.data).status ===
          "FAILED"
      )
        failed++;
    } catch {
      failed++;
    }
  }
  return {
    status: failed ? "PARTIAL" : attempted ? "COMPLETE" : "IDLE",
    attempted,
    failed,
  };
}
