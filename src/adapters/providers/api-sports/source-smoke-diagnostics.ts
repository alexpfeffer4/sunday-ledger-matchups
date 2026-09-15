import { z } from "zod";
import type { CatalogSource } from "@/adapters/providers/player-catalog-normalizer";

const pathPart = z.enum([
  "get",
  "parameters",
  "errors",
  "results",
  "response",
  "id",
  "season",
  "league",
  "seasons",
  "year",
  "coverage",
  "players",
  "games",
  "statistics",
  "statisitcs",
  "game",
  "stage",
  "status",
  "short",
  "date",
  "timestamp",
  "teams",
  "away",
  "home",
  "team",
  "name",
  "position",
  "player",
  "groups",
  "value",
  "*",
  "_",
]);
const issueCode = z.enum([
  "invalid_type",
  "invalid_value",
  "invalid_format",
  "too_big",
  "too_small",
  "invalid_union",
  "unrecognized_keys",
  "invalid_key",
  "invalid_element",
  "not_multiple_of",
  "custom",
]);
const valueType = z.enum([
  "null",
  "undefined",
  "array",
  "object",
  "string",
  "number",
  "boolean",
  "other",
]);
const providerCategory = z.enum([
  "PLAN",
  "HEADERS",
  "AUTHENTICATION",
  "RATE_LIMIT",
  "PARAMETERS",
  "OTHER",
]);
export const sourceSmokeDiagnosticSchema = z
  .object({
    reason: z.enum([
      "PLAN_SEASON_RESTRICTED",
      "PROVIDER_ERROR",
      "SCHEMA_MISMATCH",
      "EMPTY_RESPONSE",
      "COVERAGE_UNAVAILABLE",
      "SOURCE_SCOPE_UNVERIFIED",
      "SOURCE_STALE",
      "SOURCE_UNAVAILABLE",
    ]),
    providerErrorCategories: z.array(providerCategory).max(6),
    issues: z
      .array(
        z
          .object({
            path: z.array(pathPart).max(12),
            code: issueCode,
            expectedType: valueType.nullable(),
            observedType: valueType,
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
type SourceSmokeDiagnostic = z.infer<typeof sourceSmokeDiagnosticSchema>;

export class SmokeSourceFailure extends Error {
  constructor(
    readonly failureCode:
      | "SOURCE_UNAVAILABLE"
      | "SOURCE_SHAPE_UNSUPPORTED"
      | "CURRENT_SEASON_UNAVAILABLE",
    readonly diagnostic: SourceSmokeDiagnostic,
  ) {
    super(failureCode);
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function observedTypeAtPath(
  payload: unknown,
  path: PropertyKey[],
): z.infer<typeof valueType> {
  if (path.length > 12) return "other";
  // The shared catalog normalizer first parses the envelope, then parses the
  // unwrapped response array. A leading index identifies that second schema.
  let value = typeof path[0] === "number" ? object(payload)?.response : payload;
  for (const part of path) {
    if (typeof part === "number") {
      if (!Number.isSafeInteger(part) || part < 0 || part > 10_000)
        return "other";
      value = Array.isArray(value) ? value[part] : undefined;
    } else {
      const parsed = pathPart.safeParse(part);
      if (!parsed.success || parsed.data === "*" || parsed.data === "_")
        return "other";
      const current = object(value);
      value =
        current && Object.hasOwn(current, parsed.data)
          ? current[parsed.data]
          : undefined;
    }
  }
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return valueType.safeParse(typeof value).data ?? "other";
}
const providerKeys: Record<string, z.infer<typeof providerCategory>> = {
  plan: "PLAN",
  subscription: "PLAN",
  headers: "HEADERS",
  header: "HEADERS",
  token: "AUTHENTICATION",
  key: "AUTHENTICATION",
  authentication: "AUTHENTICATION",
  "x-apisports-key": "AUTHENTICATION",
  ratelimit: "RATE_LIMIT",
  requests: "RATE_LIMIT",
  parameters: "PARAMETERS",
  id: "PARAMETERS",
  season: "PARAMETERS",
};

/** Inspect only a failed source response. Never return provider text, unknown
 * object keys, input values, Zod messages, or unrecognized_keys contents. These
 * bounded diagnostics are ephemeral; the run ledger retains its existing enum. */
export function diagnoseSmokeSourceFailure(
  source: CatalogSource,
  error: unknown,
): SmokeSourceFailure {
  const payload = object(source.payload);
  const parameters = object(payload?.parameters);
  const scopeMatches =
    payload?.get === "leagues" &&
    (parameters?.id === "1" || parameters?.id === 1) &&
    (parameters?.season === "2026" || parameters?.season === 2026);
  const errors = payload?.errors;
  const entries = Array.isArray(errors)
    ? errors.slice(0, 16).map((value) => ["", value] as const)
    : Object.entries(object(errors) ?? {}).slice(0, 16);
  if (entries.length) {
    const categories = [
      ...new Set(
        entries.map(([key]) =>
          Object.hasOwn(providerKeys, key.toLowerCase())
            ? providerKeys[key.toLowerCase()]
            : "OTHER",
        ),
      ),
    ];
    // A generic plan error does not prove a paid upgrade is needed. Recognize
    // only an explicit denial of this season in the correctly scoped response.
    const seasonRestricted =
      scopeMatches &&
      entries.some(
        ([, value]) =>
          typeof value === "string" &&
          value.length <= 1_000 &&
          /^(?:Free plans|Your (?:current )?(?:plan|subscription)) (?:do(?:es)? not have access to|does not support) (?:this|the requested) season\b/i.test(
            value.trim(),
          ),
      );
    return new SmokeSourceFailure(
      seasonRestricted ? "CURRENT_SEASON_UNAVAILABLE" : "SOURCE_UNAVAILABLE",
      {
        reason: seasonRestricted ? "PLAN_SEASON_RESTRICTED" : "PROVIDER_ERROR",
        providerErrorCategories: categories,
        issues: [],
      },
    );
  }
  if (error instanceof z.ZodError)
    return new SmokeSourceFailure("SOURCE_SHAPE_UNSUPPORTED", {
      reason: "SCHEMA_MISMATCH",
      providerErrorCategories: [],
      issues: error.issues.slice(0, 8).map((issue) => ({
        path: issue.path.slice(0, 12).map((part) => {
          if (typeof part === "number") return "*";
          const parsed = pathPart.safeParse(part);
          return parsed.success ? parsed.data : "_";
        }),
        code: issueCode.safeParse(issue.code).data ?? "custom",
        expectedType:
          "expected" in issue
            ? (valueType.safeParse(issue.expected).data ?? "other")
            : null,
        observedType: observedTypeAtPath(source.payload, issue.path),
      })),
    });
  const message = error instanceof Error ? error.message : "";
  const reason =
    message === "CATALOG_CURRENT_SEASON_UNAVAILABLE"
      ? "COVERAGE_UNAVAILABLE"
      : message === "CATALOG_SOURCE_STALE"
        ? "SOURCE_STALE"
        : message === "CATALOG_SOURCE_SCOPE_UNVERIFIED"
          ? scopeMatches &&
            payload?.results === 0 &&
            Array.isArray(payload.response) &&
            payload.response.length === 0
            ? "EMPTY_RESPONSE"
            : "SOURCE_SCOPE_UNVERIFIED"
          : "SOURCE_UNAVAILABLE";
  return new SmokeSourceFailure(
    reason === "COVERAGE_UNAVAILABLE"
      ? "CURRENT_SEASON_UNAVAILABLE"
      : "SOURCE_UNAVAILABLE",
    { reason, providerErrorCategories: [], issues: [] },
  );
}
