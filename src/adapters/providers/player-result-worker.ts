import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabasePublicConfig } from "@/adapters/supabase/config";
import { getSupabaseServerSecret } from "@/adapters/supabase/server-secret";
import {
  fetchApiSportsBoxScore,
  fetchApiSportsQuotaStatus,
  type StatisticsUsage,
} from "@/adapters/providers/api-sports/client";
import { normalizeApiSportsPlayerResults } from "@/adapters/providers/api-sports/normalize-player-results";
import { fetchNflverseSeasonEvidence } from "@/adapters/providers/nflverse/client";
import { normalizeNflversePlayerResults } from "@/adapters/providers/nflverse/normalize-player-results";
import {
  resultPlayerMappingSchema,
  type PlayerObservation,
} from "@/application/providers/player-results";

const contextSchema = z.object({
  externalEventId: z.string().min(1),
  sourceEventId: z.string().min(1),
  gameDate: z.iso.date(),
  final: z.literal(true),
  mappings: z
    .array(
      resultPlayerMappingSchema.extend({ pfrPlayerId: z.string().nullable() }),
    )
    .max(96),
});
const jobsSchema = z.object({
  status: z.enum(["DISABLED", "BACKOFF", "BUDGET", "IDLE", "CLAIMED"]),
  jobs: z
    .array(z.object({ leaseId: z.uuid(), context: contextSchema }))
    .max(16),
});

/** One bounded scheduler action: public evidence only, scopes from persisted DB
 * jobs, no member data or request-supplied game IDs, no browser-triggered calls. */
export async function processPlayerResults() {
  const secret = getSupabaseServerSecret();
  if (!secret) return { status: "UNCONFIGURED", attempted: 0, reconciled: 0 };
  const admin = createClient(getSupabasePublicConfig().url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).schema("api");
  let attempted = 0;
  let reconciled = 0;
  let failures = 0;
  let apiReady = Boolean(process.env.API_SPORTS_NFL_KEY);
  if (apiReady) {
    const claimed = await admin.rpc("claim_player_statistics_status");
    if (claimed.error) throw new Error("PLAYER_STATISTICS_STATUS_CLAIM_FAILED");
    const status = z
      .object({
        status: z.enum(["DISABLED", "IDLE", "BUSY", "CLAIMED"]),
        leaseId: z.uuid().optional(),
      })
      .parse(claimed.data);
    if (status.status === "BUSY" || status.status === "DISABLED")
      apiReady = false;
    if (status.status === "CLAIMED") {
      try {
        const quota = await fetchApiSportsQuotaStatus();
        const completed = await admin.rpc("complete_player_statistics_status", {
          p_lease_id: status.leaseId,
          p_active: quota.active,
          p_daily_limit: quota.dailyLimit,
          p_used: quota.used,
          p_observed_at: quota.observedAt,
        });
        if (completed.error)
          throw new Error("PLAYER_STATISTICS_STATUS_RECORD_FAILED");
        apiReady = quota.active;
      } catch {
        apiReady = false;
        failures++;
      }
    }
  }
  const apiClaim = apiReady
    ? await admin.rpc("claim_player_result_jobs")
    : { data: { status: "DISABLED", jobs: [] }, error: null };
  if (apiClaim.error) throw new Error("PLAYER_RESULTS_CLAIM_FAILED");
  const jobs = jobsSchema.parse(apiClaim.data);
  // Eight global requests/minute at most, in two groups of four. Each fetch has
  // a twelve-second abort; DB leases last ninety seconds. No unbounded retries.
  for (let index = 0; index < jobs.jobs.length; index += 4) {
    await Promise.all(
      jobs.jobs.slice(index, index + 4).map(async (job) => {
        attempted++;
        let observations: PlayerObservation[] | null = null;
        let usage: StatisticsUsage = {
          remaining: null,
          rateLimit: null,
          retryAfterSeconds: null,
        };
        try {
          const fetched = await fetchApiSportsBoxScore(
            job.context.sourceEventId,
            (value) => {
              usage = value;
            },
          );
          observations = normalizeApiSportsPlayerResults(fetched.payload, {
            ...job.context,
            fetchedAt: fetched.fetchedAt,
            sourceUpdatedAt: fetched.sourceUpdatedAt,
            // Claim is gated by validated current-account full-game endpoint semantics.
            // A content hash revisions evidence even without a source timestamp.
            completeBoxScore: true,
          });
        } catch {
          failures++;
        }
        const completed = await admin.rpc("complete_player_result_request", {
          p_request_id: job.leaseId,
          p_observations: observations,
          p_remaining: usage.remaining,
          p_rate_limit: usage.rateLimit,
          p_retry_after_seconds: usage.retryAfterSeconds,
        });
        if (completed.error) failures++;
      }),
    );
  }
  const claimed = await admin.rpc("claim_nflverse_reconciliation");
  if (claimed.error) throw new Error("PLAYER_RECONCILIATION_CLAIM_FAILED");
  const reconciliation = jobsSchema.parse(claimed.data);
  if (reconciliation.jobs.length > 0) {
    const lease = reconciliation.jobs[0].leaseId;
    let observations: PlayerObservation[] | null = null;
    try {
      const seasons = new Set(
        reconciliation.jobs.map((job) =>
          Number(job.context.sourceEventId.slice(0, 4)),
        ),
      );
      // NFL season year comes from the verified nflverse game ID, including Jan.
      if (seasons.size !== 1) throw new Error("MULTI_SEASON_RESULT_BATCH");
      const files = await fetchNflverseSeasonEvidence([...seasons][0]);
      observations = reconciliation.jobs.flatMap((job) =>
        normalizeNflversePlayerResults({
          ...job.context,
          ...files,
          sourceUpdatedAt: files.statsSourceUpdatedAt,
          participationSourceUpdatedAt: files.snapsSourceUpdatedAt,
          statsComplete: true,
          snapsComplete: true,
        }),
      );
      reconciled = reconciliation.jobs.length;
    } catch {
      failures++;
    }
    const completed = await admin.rpc("complete_nflverse_reconciliation", {
      p_lease_id: lease,
      p_observations: observations,
    });
    if (completed.error) failures++;
  }
  return {
    status: failures
      ? "PARTIAL"
      : attempted || reconciled
        ? "PROCESSED"
        : "IDLE",
    attempted,
    reconciled,
  };
}
