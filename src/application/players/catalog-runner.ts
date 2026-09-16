import { z } from "zod";
import { buildPlayerCatalogBootstrap } from "@/application/players/catalog-bootstrap";
import {
  normalizeCatalogGames,
  normalizeLiveCatalog,
  normalizeNflversePrimaryCatalog,
  sanitizeCatalogSource,
  sanitizeNflverseCatalog,
  type CatalogSource,
  type NflverseCatalogFiles,
} from "@/adapters/providers/player-catalog-normalizer";
import type { StatisticsUsage } from "@/adapters/providers/api-sports/client";
import type { PropQuoteImport } from "@/application/providers/player-prop-quotes";

type CatalogStatus = "READY" | "DISABLED" | "PENDING" | "UNAVAILABLE";
export type CatalogProgress = { status: CatalogStatus; missingSources: number };
export type CatalogPort = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};
export type CatalogFetchers = {
  api: (
    kind: "COVERAGE" | "GAMES" | "ROSTER",
    season: number,
    teamId: string | null,
    onUsage: (usage: StatisticsUsage) => void,
  ) => Promise<CatalogSource>;
  quota: () => Promise<{
    active: boolean;
    dailyLimit: number;
    used: number;
    observedAt: string;
  }>;
  nflverse: (
    season: number,
    options?: { includeUsageStats?: boolean },
  ) => Promise<NflverseCatalogFiles>;
  quotes: (
    weekId: string,
    deadlineAt?: number,
  ) => Promise<{ imports: PropQuoteImport[]; pending: boolean }>;
  now?: () => string;
};
const instant = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
const contextSchema = z.object({
  status: z.literal("CLAIMED"),
  leaseId: z.uuid(),
  weekId: z.uuid(),
  season: z.number().int().min(2020).max(2100),
  week: z.number().int().min(1).max(23),
  events: z
    .array(
      z.object({
        externalEventId: z.string().min(1),
        scheduledStartAt: instant,
        awayTeam: z.string().min(1),
        homeTeam: z.string().min(1),
      }),
    )
    .min(1)
    .max(16),
  sourcePolicy: z
    .enum(["API_SPORTS_NFLVERSE", "NFLVERSE_PRIMARY"])
    .default("API_SPORTS_NFLVERSE"),
  selectionPolicy: z
    .enum(["LEGACY_ROLE_PRIORITY", "FEATURED_HIGHEST_STANDARD_LINES"])
    .default("LEGACY_ROLE_PRIORITY"),
  apiSportsContractValidated: z.boolean(),
  nflverseContractValidated: z.boolean(),
  verifiedAliases: z
    .array(
      z.object({
        canonicalKey: z.string().min(3),
        name: z.string().min(1).max(120),
      }),
    )
    .max(4000)
    .default([]),
  cachedSources: z.record(z.string(), z.unknown()).default({}),
  progressiveSlots: z
    .array(
      z.object({
        externalEventId: z.string().min(1),
        team: z.string().min(1),
        slot: z.enum(["QB_PASS", "RB_RUSH", "RECEIVER"]),
      }),
    )
    .min(1)
    .max(96)
    .nullish(),
});
const progressiveResultSchema = z.object({
  progressive: z.literal(true),
  publishedSlots: z.number().int().min(0).max(96),
  remainingSlots: z.number().int().min(0).max(96),
  replayed: z.boolean(),
});
const sourceSchema = z.object({
  fetchedAt: instant,
  sourceUpdatedAt: instant.nullable().optional(),
  payload: z.unknown(),
});
const nflSchema = z.object({
  fetchedAt: instant,
  sourceUpdatedAt: instant,
  rosterCsv: z.string(),
  scheduleCsv: z.string(),
  statsCsv: z.string(),
});
async function rpc(
  port: CatalogPort,
  name: string,
  args?: Record<string, unknown>,
) {
  const result = await port.rpc(name, args);
  if (result.error) throw new Error(`CATALOG_RPC_${name.toUpperCase()}`);
  return result.data;
}

/** Two charged metadata requests at most per durable job attempt. Each source is
 * shared across leagues with a DB lease/cache; failed/unknown calls keep their
 * reservation. Remaining work resumes on the existing five-minute dispatcher. */
export async function executePlayerCatalogJob(
  port: CatalogPort,
  fetchers: CatalogFetchers,
  weekId?: string,
): Promise<CatalogProgress> {
  const startedAt = Date.now();
  const withinDeadline = () => Date.now() - startedAt < 80_000;
  const claim = await rpc(port, "claim_player_catalog_job", {
    p_week_id: weekId ?? null,
  });
  const status = z.object({ status: z.string() }).parse(claim).status;
  if (status !== "CLAIMED")
    return {
      status:
        status === "READY"
          ? "READY"
          : status === "UNAVAILABLE"
            ? "UNAVAILABLE"
            : status === "DISABLED"
              ? "DISABLED"
              : "PENDING",
      missingSources: 0,
    };
  const context = contextSchema.parse(claim);
  let attempted = 0,
    missing = 0;
  const finish = async (value: CatalogProgress, error?: string) => {
    await rpc(port, "complete_player_catalog_job", {
      p_lease_id: context.leaseId,
      p_status: value.status === "DISABLED" ? "PENDING" : value.status,
      p_missing_sources: value.missingSources,
      p_error: error ?? null,
    });
    return value;
  };
  const defer = () =>
    finish({ status: "PENDING", missingSources: 1 }, "CATALOG_WORK_DEFERRED");
  try {
    const primary = context.sourcePolicy === "NFLVERSE_PRIMARY";
    if (
      primary !==
        (context.selectionPolicy === "FEATURED_HIGHEST_STANDARD_LINES") ||
      (context.progressiveSlots && !primary)
    )
      return finish(
        { status: "UNAVAILABLE", missingSources: 1 },
        "CATALOG_POLICY_MISMATCH",
      );
    const slotKey = (slot: {
      externalEventId: string;
      team: string;
      slot: string;
    }) => JSON.stringify([slot.externalEventId, slot.team, slot.slot]);
    const progressiveKeys = context.progressiveSlots
      ? new Set(context.progressiveSlots.map(slotKey))
      : null;
    if (
      context.progressiveSlots &&
      (progressiveKeys!.size !== context.progressiveSlots.length ||
        context.progressiveSlots.some(
          (slot) =>
            !context.events.some(
              (event) =>
                event.externalEventId === slot.externalEventId &&
                [event.awayTeam, event.homeTeam].includes(slot.team),
            ),
        ))
    )
      return finish(
        { status: "UNAVAILABLE", missingSources: 1 },
        "CATALOG_PROGRESSIVE_SCOPE_INVALID",
      );
    if (!primary) {
      const quotaClaim = z
        .object({ status: z.string(), leaseId: z.uuid().optional() })
        .parse(await rpc(port, "claim_player_statistics_status"));
      if (["DISABLED", "BUSY"].includes(quotaClaim.status))
        return finish(
          { status: "PENDING", missingSources: 1 },
          "STATISTICS_ACCOUNT_CHECK_PENDING",
        );
      if (quotaClaim.status === "CLAIMED") {
        const quota = await fetchers.quota();
        await rpc(port, "complete_player_statistics_status", {
          p_lease_id: quotaClaim.leaseId,
          p_active: quota.active,
          p_daily_limit: quota.dailyLimit,
          p_used: quota.used,
          p_observed_at: quota.observedAt,
        });
        if (!quota.active)
          return finish(
            { status: "UNAVAILABLE", missingSources: 1 },
            "STATISTICS_ACCOUNT_INACTIVE",
          );
      }
    }
    const now = () => fetchers.now?.() ?? new Date().toISOString();
    const source = async (
      kind: "COVERAGE" | "GAMES" | "ROSTER" | "NFLVERSE" | "NFLVERSE_PRIMARY",
      teamId: string | null = null,
    ): Promise<unknown | null> => {
      const key = `${kind}:${context.season}${teamId ? `:${teamId}` : ""}`;
      if (context.cachedSources[key]) return context.cachedSources[key];
      if (
        !withinDeadline() ||
        (!kind.startsWith("NFLVERSE") && attempted >= 2)
      ) {
        missing++;
        return null;
      }
      const cached = z
        .object({
          status: z.string(),
          payload: z.unknown().optional(),
          leaseId: z.uuid().optional(),
        })
        .parse(
          await rpc(port, "claim_player_catalog_source", { p_cache_key: key }),
        );
      if (cached.status === "CACHED") return cached.payload;
      if (cached.status !== "CLAIMED") {
        missing++;
        return null;
      }
      let requestId: string | null = null,
        usage: StatisticsUsage = {
          remaining: null,
          rateLimit: null,
          retryAfterSeconds: null,
        },
        value: unknown = null;
      try {
        if (kind === "NFLVERSE" || kind === "NFLVERSE_PRIMARY")
          value = sanitizeNflverseCatalog(
            await fetchers.nflverse(context.season, {
              includeUsageStats: kind !== "NFLVERSE_PRIMARY",
            }),
            context.season,
          );
        else {
          const reserved = await port.rpc("reserve_player_metadata_request");
          if (reserved.error) return null; // Results priority/day/rate/backoff: defer, never bypass.
          requestId = z.uuid().parse(reserved.data);
          attempted++;
          const received = await fetchers.api(
            kind,
            context.season,
            teamId,
            (current) => {
              usage = current;
            },
          );
          value = sanitizeCatalogSource(
            kind,
            received,
            context.season,
            teamId,
            now(),
          );
        }
        return value;
      } finally {
        if (requestId)
          await rpc(port, "complete_player_result_request", {
            p_request_id: requestId,
            p_observations: value ? [] : null,
            p_remaining: usage.remaining,
            p_rate_limit: usage.rateLimit,
            p_retry_after_seconds: usage.retryAfterSeconds,
          });
        await rpc(port, "complete_player_catalog_source", {
          p_cache_key: key,
          p_lease_id: cached.leaseId,
          p_payload: value,
        });
        if (!value) missing++;
      }
    };
    let nflverse: NflverseCatalogFiles | undefined;
    let coverage: CatalogSource | undefined;
    let games: CatalogSource | undefined;
    const rosters: Record<string, CatalogSource> = {};
    if (!primary) {
      const coverageRaw = await source("COVERAGE");
      if (!coverageRaw)
        return finish({ status: "PENDING", missingSources: missing });
      coverage = sourceSchema.parse(coverageRaw);
      const gamesRaw = await source("GAMES");
      if (!gamesRaw)
        return finish({ status: "PENDING", missingSources: missing });
      games = sourceSchema.parse(gamesRaw);
      const relevantGames = normalizeCatalogGames(
        games,
        context.season,
        now(),
      ).filter((game) =>
        context.events.some(
          (event) =>
            event.awayTeam === game.away.name &&
            event.homeTeam === game.home.name &&
            event.scheduledStartAt === game.scheduledStartAt,
        ),
      );
      if (relevantGames.length !== context.events.length)
        return finish(
          {
            status: "UNAVAILABLE",
            missingSources: context.events.length - relevantGames.length,
          },
          "EVENT_IDENTITY_UNRESOLVED",
        );
      const nflRaw = await source("NFLVERSE");
      if (!nflRaw)
        return finish({ status: "PENDING", missingSources: missing });
      nflverse = nflSchema.parse(nflRaw);
      for (const teamId of [
        ...new Set(
          relevantGames.flatMap((game) => [game.away.id, game.home.id]),
        ),
      ].sort()) {
        const raw = await source("ROSTER", teamId);
        if (raw) rosters[teamId] = sourceSchema.parse(raw);
      }
      if (missing)
        return finish({ status: "PENDING", missingSources: missing });
    }
    if (!nflverse) {
      const nflRaw = await source("NFLVERSE_PRIMARY");
      if (!nflRaw)
        return finish({ status: "PENDING", missingSources: missing });
      nflverse = nflSchema.parse(nflRaw);
    }
    // Acquisition may validate access before release/source contracts. Do not
    // insert false immutable mapping rows that cannot later be safely promoted.
    if (
      (!primary && !context.apiSportsContractValidated) ||
      !context.nflverseContractValidated
    )
      return finish(
        { status: "PENDING", missingSources: 1 },
        "RESULT_CONTRACT_VALIDATION_PENDING",
      );
    if (!withinDeadline()) return defer();
    // Source acquisition shares this absolute budget. Leave twenty seconds of
    // the existing eighty-second worker window for mappings and nominations.
    const quotes = await fetchers.quotes(context.weekId, startedAt + 60_000);
    if (!withinDeadline()) return defer();
    const common = { ...context, now: now(), nflverse, quotes: quotes.imports };
    const normalized = primary
      ? normalizeNflversePrimaryCatalog(common)
      : normalizeLiveCatalog({
          ...common,
          coverage: coverage!,
          games: games!,
          rosters,
        });
    const prepared = buildPlayerCatalogBootstrap(normalized);
    // A post-publication claim names only still-empty, pregame slots. Already
    // published players never enter this import or publication proposal batch.
    const proposals = progressiveKeys
      ? prepared.proposals.filter((proposal) =>
          progressiveKeys.has(slotKey(proposal)),
        )
      : prepared.proposals;
    const candidateKeys = new Set(
      proposals.flatMap((proposal) =>
        proposal.candidates.map((candidate) =>
          JSON.stringify([
            proposal.externalEventId,
            proposal.team,
            candidate.canonicalKey,
          ]),
        ),
      ),
    );
    const records = progressiveKeys
      ? prepared.records.filter((record) =>
          candidateKeys.has(
            JSON.stringify([
              record.externalEventId,
              record.team,
              record.canonicalKey,
            ]),
          ),
        )
      : prepared.records;
    for (const event of prepared.resultEvents) {
      if (!withinDeadline()) return defer();
      await rpc(port, "register_player_result_event", { p_mapping: event });
    }
    if (records.length) {
      if (!withinDeadline()) return defer();
      await rpc(port, "import_player_catalog", { p_records: records });
    }
    let unresolved =
      (context.progressiveSlots?.length ?? context.events.length * 6) -
      proposals.filter((row) => row.proposedCanonicalKey !== null).length;
    if (primary) {
      if (!withinDeadline()) return defer();
      const recorded = await rpc(port, "record_player_catalog_nominations", {
        p_lease_id: context.leaseId,
        p_proposals: proposals,
      });
      if (progressiveKeys) {
        const result = progressiveResultSchema.safeParse(recorded);
        if (!result.success)
          throw new Error("CATALOG_PROGRESSIVE_RESULT_INVALID");
        // SQL owns one-time publication and may retain tied, closed or otherwise
        // unresolved slots. A locally proposed name alone cannot mark them ready.
        unresolved = result.data.remainingSlots;
      }
    }
    return finish(
      {
        status: unresolved
          ? primary || quotes.pending
            ? "PENDING"
            : "UNAVAILABLE"
          : "READY",
        missingSources: unresolved,
      },
      unresolved ? "CATALOG_IDENTITIES_OR_ROLES_UNRESOLVED" : undefined,
    );
  } catch (error) {
    const safe =
      error instanceof Error && /^CATALOG_[A-Z_]+$/.test(error.message)
        ? error.message.slice(0, 100)
        : "CATALOG_SOURCE_UNAVAILABLE";
    return finish(
      { status: "PENDING", missingSources: Math.max(1, missing) },
      safe,
    );
  }
}
