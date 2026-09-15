import { createHash } from "node:crypto";
import { z } from "zod";
import {
  propQuoteImportSchema,
  type PropQuoteImport,
} from "@/application/providers/player-prop-quotes";

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const label = z.string().trim().min(1).max(120);
const provider = z.enum(["API_SPORTS", "NFLVERSE"]);
const proof = z.object({
  verified: z.boolean(),
  verifiedAt: z.iso.datetime(),
  evidenceHash: hash,
});
const eventSchema = z.object({
  externalEventId: label,
  scheduledStartAt: z.iso.datetime(),
  awayTeam: label.max(60),
  homeTeam: label.max(60),
  resultMapping: proof.extend({
    apiSportsEventId: z.string().regex(/^\d+$/).nullable(),
    nflverseEventId: z.string().regex(/^\d{4}_\d{2}_[A-Z0-9]+_[A-Z0-9]+$/),
    gameDate: z.iso.date(),
    awayTeam: label.max(60),
    homeTeam: label.max(60),
  }),
});
const directorySchema = proof.extend({
  canonicalKey: label.min(3),
  displayName: label,
  // The directory supplies the position. A rushing quote cannot supply it.
  position: label,
  team: label.max(60),
  validFrom: z.iso.date(),
  validThrough: z.iso.date(),
  // Aliases must have already been verified against this canonical player.
  // An empty list can be resolved by an exact, unique directory display name.
  bookmakerAliases: z.array(label).max(10),
});
const mappingSchema = proof.extend({
  canonicalKey: label.min(3),
  provider,
  externalEventId: label,
  externalPlayerId: label,
  team: label.max(60),
  gameDate: z.iso.date(),
  sourceTeam: label.max(60),
  secondaryPlayerId: label.nullable(),
  resultPathVerified: z.boolean(),
});
const roleSchema = proof.extend({
  canonicalKey: label.min(3),
  externalEventId: label,
  team: label.max(60),
  gameDate: z.iso.date(),
  kind: z.enum([
    "CONFIRMED_STARTER",
    "PROJECTED_STARTER",
    "LEAD_ROLE",
    "RECENT_USAGE",
  ]),
  // Comparisons only use the role's statistic: passing attempts, rushing
  // attempts, or receiving targets/receptions supplied by the verified adapter.
  statistic: z.enum(["PASSING_YARDS", "RUSHING_YARDS", "RECEIVING_YARDS"]),
  usage: z.number().nonnegative().nullable(),
  source: z.enum(["API_SPORTS", "NFLVERSE", "VERIFIED_ROLE_SOURCE"]),
  description: z.string().min(3).max(160),
});

export const playerCatalogBootstrapSchema = z.object({
  now: z.iso.datetime(),
  sourceVerifiedAt: z.iso.datetime().optional(),
  sourceExpiresAt: z.iso.datetime().optional(),
  sourcePolicy: z.enum(["API_SPORTS_NFLVERSE", "NFLVERSE_PRIMARY"]).optional(),
  selectionPolicy: z
    .enum(["LEGACY_ROLE_PRIORITY", "FEATURED_HIGHEST_STANDARD_LINES"])
    .optional(),
  events: z.array(eventSchema).min(1).max(16),
  directory: z.array(directorySchema).max(4000),
  mappings: z.array(mappingSchema).max(8000),
  roles: z.array(roleSchema).max(4000),
});
export type PlayerCatalogBootstrapInput = z.infer<
  typeof playerCatalogBootstrapSchema
> & {
  quotes?: readonly PropQuoteImport[];
};
export type PlayerCatalogImportRecord = {
  canonicalKey: string;
  displayName: string;
  position: "QB" | "RB" | "WR" | "TE";
  provider: "THE_ODDS_API" | "API_SPORTS" | "NFLVERSE";
  externalEventId: string;
  externalPlayerId: string;
  team: string;
  gameDate: string;
  verifiedAt: string;
  evidenceHash: string;
  roleRank: number;
  roleEvidence: string;
  resultPathVerified: boolean;
  sourceTeam?: string;
  secondaryPlayerId?: string;
};
export type PlayerCatalogException = {
  externalEventId: string;
  team: string | null;
  canonicalKey: string | null;
  code: string;
};
const slots = [
  { slot: "QB_PASS", statistic: "PASSING_YARDS", positions: ["QB"] },
  { slot: "RB_RUSH", statistic: "RUSHING_YARDS", positions: ["RB"] },
  { slot: "RECEIVER", statistic: "RECEIVING_YARDS", positions: ["WR", "TE"] },
] as const;
type Slot = (typeof slots)[number];
export type PlayerCatalogProposal = {
  externalEventId: string;
  team: string;
  slot: Slot["slot"];
  statistic: Slot["statistic"];
  proposedCanonicalKey: string | null;
  availableQuotes: number;
  candidates: {
    canonicalKey: string;
    displayName: string;
    roleRank: number;
    roleEvidence: string;
  }[];
  warnings: string[];
  nominationEvidenceHash?: string;
  nominationVerifiedAt?: string;
  nominationExpiresAt?: string;
};
export type PlayerCatalogBootstrapResult = {
  records: PlayerCatalogImportRecord[];
  resultEvents: {
    externalEventId: string;
    apiSportsEventId: string | null;
    nflverseEventId: string;
    gameDate: string;
    awayTeam: string;
    homeTeam: string;
    evidenceHash: string;
  }[];
  proposals: PlayerCatalogProposal[];
  exceptions: PlayerCatalogException[];
};

function easternDate(instant: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function freshProof(value: z.infer<typeof proof>, now: number): boolean {
  return value.verified && Date.parse(value.verifiedAt) <= now;
}
function supportedPosition(
  position: string,
): position is PlayerCatalogImportRecord["position"] {
  return ["QB", "RB", "WR", "TE"].includes(position);
}

/** Adapter boundary for an operator-controlled, verified directory/crosswalk.
 * It makes no provider calls and does not turn unverified names into identities.
 * Persist its records through the service-only catalog RPC, then use the normal
 * commissioner bulk review. Missing live credentials gate verification, not this
 * deterministic preparation. Private drafts and member selections are not inputs.
 */
export function buildPlayerCatalogBootstrap(
  input: PlayerCatalogBootstrapInput,
): PlayerCatalogBootstrapResult {
  const data = playerCatalogBootstrapSchema.parse(input);
  const now = Date.parse(data.now);
  const pilot = data.sourcePolicy === "NFLVERSE_PRIMARY";
  if (pilot !== (data.selectionPolicy === "FEATURED_HIGHEST_STANDARD_LINES"))
    throw new Error("CATALOG_POLICY_MISMATCH");
  if (
    pilot &&
    ((data.sourceVerifiedAt && Date.parse(data.sourceVerifiedAt) > now) ||
      (data.sourceExpiresAt && Date.parse(data.sourceExpiresAt) <= now))
  )
    throw new Error("CATALOG_SOURCE_REVISION_UNAVAILABLE");
  const result: PlayerCatalogBootstrapResult = {
    records: [],
    resultEvents: [],
    proposals: [],
    exceptions: [],
  };
  if (
    new Set(data.events.map((event) => event.externalEventId)).size !==
    data.events.length
  ) {
    throw new Error("DUPLICATE_CATALOG_EVENT");
  }
  const exception = (
    externalEventId: string,
    team: string | null,
    canonicalKey: string | null,
    code: string,
  ) => {
    result.exceptions.push({ externalEventId, team, canonicalKey, code });
  };
  for (const event of [...data.events].sort((a, b) =>
    a.externalEventId.localeCompare(b.externalEventId),
  )) {
    const gameDate = easternDate(event.scheduledStartAt);
    const verifiedEvent =
      freshProof(event.resultMapping, now) &&
      (pilot
        ? event.resultMapping.apiSportsEventId === null
        : event.resultMapping.apiSportsEventId !== null) &&
      (!pilot || Date.parse(event.scheduledStartAt) > now) &&
      event.awayTeam !== event.homeTeam &&
      event.resultMapping.gameDate === gameDate &&
      event.resultMapping.awayTeam === event.awayTeam &&
      event.resultMapping.homeTeam === event.homeTeam;
    if (!verifiedEvent)
      exception(
        event.externalEventId,
        null,
        null,
        "RESULT_EVENT_MAPPING_UNVERIFIED",
      );
    else {
      const { apiSportsEventId, nflverseEventId, evidenceHash } =
        event.resultMapping;
      result.resultEvents.push({
        externalEventId: event.externalEventId,
        apiSportsEventId,
        nflverseEventId,
        evidenceHash,
        gameDate,
        awayTeam: event.awayTeam,
        homeTeam: event.homeTeam,
      });
    }
    const roster = data.directory.filter(
      (player) =>
        freshProof(player, now) &&
        [event.awayTeam, event.homeTeam].includes(player.team) &&
        player.validFrom <= gameDate &&
        player.validThrough >= gameDate,
    );
    const pilotSnapshots = new Map(
      slots.map((slot) => [
        slot.statistic,
        pilot
          ? nominationQuoteSnapshot(
              input.quotes ?? [],
              event.externalEventId,
              event.scheduledStartAt,
              slot.statistic,
              now,
            )
          : null,
      ]),
    );
    if ([...pilotSnapshots.values()].some((snapshot) => snapshot?.unavailable))
      exception(
        event.externalEventId,
        null,
        null,
        "PREGAME_QUOTE_SOURCE_UNAVAILABLE",
      );
    const quotes = pilot
      ? slots.flatMap((slot) => {
          const bundle = pilotSnapshots.get(slot.statistic)?.bundle;
          if (!bundle) return [];
          return bundle.events.map((quote) => ({
            ...quote,
            markets: quote.markets.filter(
              (market) =>
                market.statistic === slot.statistic &&
                Date.parse(market.observedAt) <= Date.parse(bundle.fetchedAt) &&
                Date.parse(bundle.fetchedAt) - Date.parse(market.observedAt) <=
                  600000 &&
                market.marketType === `PLAYER_${market.statistic}` &&
                market.lineMilli >= 0,
            ),
          }));
        })
      : (input.quotes ?? [])
          .flatMap((bundle) => bundle.events)
          .filter((quote) => quote.externalEventId === event.externalEventId);
    const quoteRows = quotes.flatMap((quote) => {
      if (
        quote.awayTeam !== event.awayTeam ||
        quote.homeTeam !== event.homeTeam ||
        // The database and provider serialize the same validated instant with
        // different fractional-second precision. Compare time, not formatting.
        Date.parse(quote.scheduledStartAt) !==
          Date.parse(event.scheduledStartAt)
      ) {
        exception(
          event.externalEventId,
          null,
          null,
          "QUOTE_EVENT_MAPPING_MISMATCH",
        );
        return [];
      }
      return quote.markets;
    });
    // Exact aliases retain suffixes, punctuation and case. A same-name collision
    // anywhere in the game's rosters makes that bookmaker identity unavailable.
    const aliases = new Map<string, Set<string>>();
    for (const player of roster) {
      for (const name of new Set([
        player.displayName,
        ...player.bookmakerAliases,
      ])) {
        const keys = aliases.get(name) ?? new Set<string>();
        keys.add(player.canonicalKey);
        aliases.set(name, keys);
      }
    }
    for (const name of new Set(
      quoteRows.map((quote) => quote.externalPlayerId),
    )) {
      if (!aliases.has(name))
        exception(
          event.externalEventId,
          null,
          null,
          "UNMAPPED_BOOKMAKER_PLAYER",
        );
      else if (aliases.get(name)!.size !== 1)
        exception(
          event.externalEventId,
          null,
          null,
          "AMBIGUOUS_BOOKMAKER_PLAYER",
        );
    }
    for (const team of [event.awayTeam, event.homeTeam]) {
      for (const slot of slots) {
        const pilotSnapshot = pilotSnapshots.get(slot.statistic);
        const candidates = [];
        for (const player of roster.filter(
          (row) =>
            row.team === team &&
            (slot.positions as readonly string[]).includes(row.position),
        )) {
          if (
            roster.filter((row) => row.canonicalKey === player.canonicalKey)
              .length !== 1
          ) {
            exception(
              event.externalEventId,
              team,
              player.canonicalKey,
              "CONFLICTING_CURRENT_DIRECTORY",
            );
            continue;
          }
          const namedQuotes = quoteRows.filter(
            (quote) =>
              quote.statistic === slot.statistic &&
              aliases.get(quote.externalPlayerId)?.size === 1 &&
              aliases.get(quote.externalPlayerId)?.has(player.canonicalKey),
          );
          const names = [
            ...new Set(namedQuotes.map((quote) => quote.externalPlayerId)),
          ];
          const verifiedAliases = player.bookmakerAliases.filter(
            (name) => aliases.get(name)?.size === 1,
          );
          // An explicit verified alias allows the menu to exist before quotes.
          // Do not invent a sportsbook label just because a canonical name exists.
          const bookmakerIdentity =
            names.length === 1
              ? names[0]
              : names.length === 0 && verifiedAliases.length === 1
                ? verifiedAliases[0]
                : null;
          if (!bookmakerIdentity) {
            exception(
              event.externalEventId,
              team,
              player.canonicalKey,
              names.length > 1 || verifiedAliases.length > 1
                ? "AMBIGUOUS_BOOKMAKER_ALIAS"
                : "BOOKMAKER_IDENTITY_UNVERIFIED",
            );
            continue;
          }
          const mappings = data.mappings.filter(
            (mapping) =>
              mapping.canonicalKey === player.canonicalKey &&
              mapping.externalEventId === event.externalEventId &&
              mapping.team === team &&
              mapping.gameDate === gameDate &&
              freshProof(mapping, now),
          );
          const duplicateProvider = ["API_SPORTS", "NFLVERSE"].some(
            (source) =>
              mappings.filter((mapping) => mapping.provider === source).length >
              1,
          );
          const conflictingSourceId = mappings.some((mapping) =>
            data.mappings.some(
              (other) =>
                other.provider === mapping.provider &&
                other.externalEventId === mapping.externalEventId &&
                other.externalPlayerId === mapping.externalPlayerId &&
                other.canonicalKey !== player.canonicalKey,
            ),
          );
          if (duplicateProvider || conflictingSourceId) {
            exception(
              event.externalEventId,
              team,
              player.canonicalKey,
              "AMBIGUOUS_RESULT_PLAYER_MAPPING",
            );
            continue;
          }
          const nflverse = mappings.find(
            (mapping) => mapping.provider === "NFLVERSE",
          );
          // The fallback must prove both totals and offensive snaps, including
          // DNP cases API-Sports' ordinary box score cannot establish alone.
          const resultPathVerified =
            verifiedEvent &&
            nflverse?.resultPathVerified === true &&
            !!nflverse.secondaryPlayerId;
          if (!resultPathVerified) {
            exception(
              event.externalEventId,
              team,
              player.canonicalKey,
              "COMPLETE_RESULT_PATH_UNVERIFIED",
            );
            continue;
          }
          if (
            !pilot &&
            !mappings.some(
              (mapping) =>
                mapping.provider === "API_SPORTS" && mapping.resultPathVerified,
            )
          ) {
            exception(
              event.externalEventId,
              team,
              player.canonicalKey,
              "EARLY_RESULT_SOURCE_UNVERIFIED",
            );
          }
          const roles = data.roles
            .filter(
              (role) =>
                role.canonicalKey === player.canonicalKey &&
                role.externalEventId === event.externalEventId &&
                role.team === team &&
                role.gameDate === gameDate &&
                role.statistic === slot.statistic &&
                freshProof(role, now) &&
                now - Date.parse(role.verifiedAt) <=
                  (pilot ? 48 * 3600000 : 7 * 24 * 60 * 60 * 1000),
            )
            .sort(
              (a, b) =>
                rolePriority(a.kind, slot) - rolePriority(b.kind, slot) ||
                (b.usage ?? -1) - (a.usage ?? -1) ||
                b.verifiedAt.localeCompare(a.verifiedAt) ||
                a.evidenceHash.localeCompare(b.evidenceHash),
            );
          const role = roles[0];
          const line = pilot
            ? pairedPregameLine(namedQuotes, bookmakerIdentity)
            : (namedQuotes
                .filter(
                  (quote) =>
                    quote.externalPlayerId === bookmakerIdentity &&
                    quote.outcomeKey === "OVER",
                )
                .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0]
                ?.lineMilli ?? null);
          if (pilot && line === null) {
            exception(
              event.externalEventId,
              team,
              player.canonicalKey,
              "FEATURED_LINE_UNAVAILABLE",
            );
            continue;
          }
          const roleEvidence = pilot
            ? `Highest eligible standard ${slot.statistic.toLowerCase().replaceAll("_", " ")} line; featured player, not a confirmed starter. Snapshot ${pilotSnapshot!.bundle!.fetchedAt}.`
            : role
              ? `${role.kind}: ${role.description}`
              : line !== null
                ? "Highest available standard line fallback; role unconfirmed."
                : "Verified player; role unconfirmed and quote not yet available.";
          candidates.push({
            player,
            mappings,
            bookmakerIdentity,
            line,
            priority: pilot
              ? 10
              : role
                ? rolePriority(role.kind, slot)
                : line !== null
                  ? 10
                  : 11,
            usage: pilot ? -1 : (role?.usage ?? -1),
            roleEvidence,
            resultPathVerified,
          });
        }
        candidates.sort(
          (a, b) =>
            a.priority - b.priority ||
            b.usage - a.usage ||
            (a.priority === 10
              ? (b.line ?? -Infinity) - (a.line ?? -Infinity)
              : 0) ||
            a.player.canonicalKey.localeCompare(b.player.canonicalKey),
        );
        const warnings: string[] = [];
        if (candidates.length === 0)
          warnings.push(
            "Player identity or complete result path needs verification.",
          );
        if (!pilot && candidates[0]?.priority >= 10)
          warnings.push("Proposed role is unconfirmed; review this choice.");
        if (candidates[0] && candidates[0].line === null)
          warnings.push("Known player; bookmaker quote not yet available.");
        if (
          candidates.length > 1 &&
          candidates[0].priority === candidates[1].priority &&
          candidates[0].usage === candidates[1].usage &&
          candidates[0].line === candidates[1].line
        ) {
          warnings.push(
            "Equally ranked candidates; confirm the proposed choice.",
          );
        }
        const nominationVerifiedAt = new Date(
          Math.max(
            Date.parse(data.sourceVerifiedAt ?? event.resultMapping.verifiedAt),
            ...roster
              .filter(
                (player) =>
                  player.team === team &&
                  (slot.positions as readonly string[]).includes(
                    player.position,
                  ),
              )
              .map((player) => Date.parse(player.verifiedAt)),
            ...(pilotSnapshot?.bundle
              ? [Date.parse(pilotSnapshot.bundle.fetchedAt)]
              : []),
          ),
        ).toISOString();
        const nominationEvidenceHash = digest({
          sourcePolicy: data.sourcePolicy,
          selectionPolicy: data.selectionPolicy,
          externalEventId: event.externalEventId,
          team,
          slot: slot.slot,
          sourceVerifiedAt: data.sourceVerifiedAt,
          eventEvidence: event.resultMapping.evidenceHash,
          quoteSnapshot: pilotSnapshot?.evidenceHash ?? null,
          proposedCanonicalKey: candidates[0]?.player.canonicalKey ?? null,
          // Bind the entire comparison and empty/removed membership. Source
          // acquisitions order new observations; retries never invent a time.
          candidates: candidates.map((candidate, roleRank) => ({
            canonicalKey: candidate.player.canonicalKey,
            roleRank,
            line: candidate.line,
            roleEvidence: candidate.roleEvidence,
            directoryEvidence: candidate.player.evidenceHash,
            mappingEvidence: candidate.mappings
              .map((mapping) => mapping.evidenceHash)
              .sort(),
          })),
        });
        const nominationExpiresAt = new Date(
          Math.min(
            Date.parse(event.scheduledStartAt),
            Date.parse(
              data.sourceExpiresAt ??
                new Date(
                  Date.parse(
                    data.sourceVerifiedAt ?? event.resultMapping.verifiedAt,
                  ) +
                    48 * 3600000,
                ).toISOString(),
            ),
            Date.parse(
              pilotSnapshot?.bundle?.fetchedAt ??
                data.sourceVerifiedAt ??
                event.resultMapping.verifiedAt,
            ) +
              12 * 3600000,
          ),
        ).toISOString();
        result.proposals.push({
          externalEventId: event.externalEventId,
          team,
          slot: slot.slot,
          statistic: slot.statistic,
          proposedCanonicalKey: candidates[0]?.player.canonicalKey ?? null,
          availableQuotes: candidates.filter(
            (candidate) => candidate.line !== null,
          ).length,
          warnings,
          ...(pilot
            ? {
                nominationEvidenceHash,
                nominationVerifiedAt,
                nominationExpiresAt,
              }
            : {}),
          candidates: candidates.map((candidate, roleRank) => ({
            canonicalKey: candidate.player.canonicalKey,
            displayName: candidate.player.displayName,
            roleRank,
            roleEvidence: candidate.roleEvidence,
          })),
        });
        for (const [roleRank, candidate] of candidates.entries()) {
          const { player } = candidate;
          if (!supportedPosition(player.position)) continue;
          const base = {
            canonicalKey: player.canonicalKey,
            displayName: player.displayName,
            position: player.position,
            externalEventId: event.externalEventId,
            team,
            gameDate,
            roleRank: Math.min(roleRank, 999),
            roleEvidence: candidate.roleEvidence,
            resultPathVerified: candidate.resultPathVerified,
          };
          // Canonical mapping keys stay immutable. Primary observations also
          // bind nomination evidence so changed ranks append a truthful revision.
          result.records.push({
            ...base,
            provider: "THE_ODDS_API",
            externalPlayerId: candidate.bookmakerIdentity,
            verifiedAt: pilot ? nominationVerifiedAt : player.verifiedAt,
            evidenceHash: digest({
              canonicalKey: player.canonicalKey,
              provider: "THE_ODDS_API",
              externalEventId: event.externalEventId,
              externalPlayerId: candidate.bookmakerIdentity,
              team,
              gameDate,
              directoryEvidence: player.evidenceHash,
              ...(pilot
                ? {
                    nominationEvidenceHash,
                    roleRank,
                    roleEvidence: candidate.roleEvidence,
                  }
                : {}),
            }),
          });
          for (const mapping of candidate.mappings.sort((a, b) =>
            a.provider.localeCompare(b.provider),
          )) {
            result.records.push({
              ...base,
              provider: mapping.provider,
              externalPlayerId: mapping.externalPlayerId,
              verifiedAt: mapping.verifiedAt,
              evidenceHash: mapping.evidenceHash,
              resultPathVerified: mapping.resultPathVerified,
              sourceTeam: mapping.sourceTeam,
              ...(mapping.secondaryPlayerId
                ? { secondaryPlayerId: mapping.secondaryPlayerId }
                : {}),
            });
          }
        }
      }
    }
  }
  if (result.records.length > 2000)
    throw new Error("CATALOG_IMPORT_BATCH_TOO_LARGE");
  result.exceptions.sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  );
  return result;
}

function rolePriority(
  kind: z.infer<typeof roleSchema>["kind"],
  slot: Slot,
): number {
  if (kind === "CONFIRMED_STARTER" && slot.slot === "QB_PASS") return 0;
  if (kind === "PROJECTED_STARTER" && slot.slot === "QB_PASS") return 1;
  if (kind === "LEAD_ROLE" && slot.slot === "RB_RUSH") return 0;
  if (kind === "RECENT_USAGE") return slot.slot === "RECEIVER" ? 0 : 2;
  return 3;
}

/** A single current full-game main line requires both sides. Conflicting lines
 * or prices at the same source revision cannot become a receiver tie-break. */
function pairedPregameLine(
  quotes: PropQuoteImport["events"][number]["markets"],
  name: string,
): number | null {
  const named = quotes.filter(
    (quote) =>
      quote.externalPlayerId === name &&
      quote.sourceBook === "draftkings" &&
      quote.period === "FULL_GAME",
  );
  const latest = Math.max(
    ...named.map((quote) => Date.parse(quote.observedAt)),
  );
  const current = named.filter(
    (quote) => Date.parse(quote.observedAt) === latest,
  );
  const lines = new Set(current.map((quote) => quote.lineMilli));
  if (
    lines.size !== 1 ||
    !["OVER", "UNDER"].every(
      (side) =>
        new Set(
          current
            .filter((quote) => quote.outcomeKey === side)
            .map((quote) => quote.americanOdds),
        ).size === 1,
    )
  )
    return null;
  return current[0].lineMilli;
}

/** Discovery snapshots live for 12h across durable jobs. Each statistic uses
 * one complete latest family response, never a mixture of earlier players or
 * prices. These snapshots cannot authorize a bet; submit-time gates are separate. */
function nominationQuoteSnapshot(
  bundles: readonly PropQuoteImport[],
  eventId: string,
  kickoff: string,
  statistic: Slot["statistic"],
  now: number,
) {
  const family = {
    PASSING_YARDS: "player_pass_yds",
    RUSHING_YARDS: "player_rush_yds",
    RECEIVING_YARDS: "player_reception_yds",
  }[statistic];
  const relevant = bundles.filter((bundle) =>
    bundle.events.some(
      (event) =>
        event.externalEventId === eventId &&
        (event.requestedFamilies as readonly string[]).includes(family),
    ),
  );
  const eligible = relevant.flatMap((bundle) => {
    const parsed = propQuoteImportSchema.safeParse(bundle);
    if (
      !parsed.success ||
      Date.parse(bundle.fetchedAt) > now ||
      Date.parse(bundle.fetchedAt) >= Date.parse(kickoff) ||
      now - Date.parse(bundle.fetchedAt) > 12 * 3600000
    )
      return [];
    return [parsed.data];
  });
  const latest = Math.max(
    ...eligible.map((bundle) => Date.parse(bundle.fetchedAt)),
  );
  const current = eligible.filter(
    (bundle) => Date.parse(bundle.fetchedAt) === latest,
  );
  const evidence = new Set(
    current.map((bundle) =>
      digest({
        fetchedAt: bundle.fetchedAt,
        events: bundle.events.map((event) => ({
          externalEventId: event.externalEventId,
          scheduledStartAt: event.scheduledStartAt,
          awayTeam: event.awayTeam,
          homeTeam: event.homeTeam,
          statistic,
          markets: event.markets
            .filter((market) => market.statistic === statistic)
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
        })),
      }),
    ),
  );
  const bundle = evidence.size === 1 ? current[0] : null;
  return {
    bundle,
    evidenceHash: bundle ? [...evidence][0] : null,
    unavailable: !bundle && relevant.length > 0,
  };
}
