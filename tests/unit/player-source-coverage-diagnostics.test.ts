import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  sourceSmokeDiagnosticSchema,
  diagnoseSmokeSourceFailure,
  SmokeSourceFailure,
} from "@/adapters/providers/api-sports/source-smoke-diagnostics";
import { validateSmokeCoverage } from "@/adapters/providers/api-sports/source-smoke-normalizer";

const now = "2026-09-15T15:00:00.000Z";
beforeEach(() => vi.useFakeTimers().setSystemTime(new Date(now)));
afterEach(() => vi.useRealTimers());
function source(errors: unknown = []) {
  return {
    fetchedAt: now,
    payload: {
      get: "leagues",
      parameters: { id: "1", season: "2026" },
      errors,
      results: 1,
      response: [
        {
          league: { id: 1 },
          seasons: [
            {
              year: 2026,
              coverage: {
                players: true,
                games: { statisitcs: { players: true } },
              },
            },
          ],
        },
      ],
    },
  };
}
function failure(input: Parameters<typeof validateSmokeCoverage>[0]) {
  try {
    validateSmokeCoverage(input);
  } catch (error) {
    expect(error).toBeInstanceOf(SmokeSourceFailure);
    return error as SmokeSourceFailure;
  }
  throw new Error("Expected coverage to fail closed");
}

it.each([
  ["plan", "PLAN"],
  ["subscription", "PLAN"],
  ["headers", "HEADERS"],
  ["token", "AUTHENTICATION"],
  ["x-apisports-key", "AUTHENTICATION"],
  ["rateLimit", "RATE_LIMIT"],
  ["requests", "RATE_LIMIT"],
  ["season", "PARAMETERS"],
  ["parameters", "PARAMETERS"],
  ["private-key-should-not-escape", "OTHER"],
  ["constructor", "OTHER"],
])(
  "classifies %s without exposing the provider key or text",
  (key, category) => {
    const result = failure(
      source({ [key]: "private-value-should-not-escape" }),
    );
    expect(result.failureCode).toBe("SOURCE_UNAVAILABLE");
    expect(result.diagnostic).toEqual({
      reason: "PROVIDER_ERROR",
      providerErrorCategories: [category],
      issues: [],
    });
    expect(JSON.stringify(result)).not.toContain("should-not-escape");
  },
);

it("reports season restriction only for explicit scoped provider denial", () => {
  const result = failure(
    source({
      plan: "Free plans do not have access to this season, try from 2021 to 2024.",
    }),
  );
  expect(result.failureCode).toBe("CURRENT_SEASON_UNAVAILABLE");
  expect(result.diagnostic).toEqual({
    reason: "PLAN_SEASON_RESTRICTED",
    providerErrorCategories: ["PLAN"],
    issues: [],
  });
  expect(JSON.stringify(result)).not.toContain("2024");
});

it.each([
  "plan is restricted",
  "Free plans include this season",
  "Your subscription is active",
  "x".repeat(1_001),
])("does not infer a required upgrade from generic plan text %#", (plan) => {
  const result = failure(source({ plan }));
  expect(result.failureCode).toBe("SOURCE_UNAVAILABLE");
  expect(result.diagnostic.reason).toBe("PROVIDER_ERROR");
});

it("does not turn another season's plan denial into 2026 evidence", () => {
  const input = source({
    plan: "Free plans do not have access to this season",
  });
  input.payload.parameters.season = "2025";
  expect(failure(input).failureCode).toBe("SOURCE_UNAVAILABLE");
});

it("handles non-string and array provider errors without reading or exposing arbitrary values", () => {
  const result = failure(
    source([{ token: "private-token" }, null, ["private-profile"]]),
  );
  expect(result.diagnostic.providerErrorCategories).toEqual(["OTHER"]);
  expect(JSON.stringify(result)).not.toContain("private-");
});

it("returns bounded schema paths and codes for an unsupported coverage row", () => {
  const input = source();
  const row = input.payload.response[0] as Record<string, unknown>;
  row.league = "private-response-value";
  row.seasons = "private-player-profile";
  const result = failure(input);
  expect(result.failureCode).toBe("SOURCE_SHAPE_UNSUPPORTED");
  expect(result.diagnostic).toEqual({
    reason: "SCHEMA_MISMATCH",
    providerErrorCategories: [],
    issues: [
      {
        path: ["*", "league"],
        code: "invalid_type",
        expectedType: "object",
        observedType: "string",
      },
      {
        path: ["*", "seasons"],
        code: "invalid_type",
        expectedType: "array",
        observedType: "string",
      },
    ],
  });
  expect(JSON.stringify(result)).not.toContain("private-");
});

it("redacts unknown path keys, issue messages and unrecognized_keys contents", () => {
  const parsed = z
    .object({ "secret-path-token": z.object({ league: z.string() }).strict() })
    .strict()
    .safeParse({
      "secret-path-token": { league: 123, "secret-extra-key": true },
      "secret-root-key": true,
    });
  if (parsed.success) throw new Error("Expected malformed fixture");
  const result = diagnoseSmokeSourceFailure(source(), parsed.error);
  expect(result.diagnostic.issues).toContainEqual({
    path: ["_", "league"],
    code: "invalid_type",
    expectedType: "string",
    observedType: "other",
  });
  expect(result.diagnostic.issues).toContainEqual({
    path: ["_"],
    code: "unrecognized_keys",
    expectedType: null,
    observedType: "other",
  });
  expect(JSON.stringify(result)).not.toMatch(/secret-|123|received/);
});

it.each([
  [null, "null"],
  [undefined, "undefined"],
  [[], "array"],
  [12, "number"],
  [false, "boolean"],
])(
  "distinguishes safe observed field types without returning their values %#",
  (value, observedType) => {
    const input = source();
    (input.payload.response[0] as Record<string, unknown>).league = value;
    expect(failure(input).diagnostic.issues[0]).toMatchObject({
      path: ["*", "league"],
      expectedType: "object",
      observedType,
    });
  },
);

it("caps diagnostic cardinality and emits only the strict safe schema", () => {
  const parsed = z
    .array(z.object({ league: z.string() }))
    .safeParse(
      Array.from({ length: 30 }, () => ({ league: "private-value".length })),
    );
  if (parsed.success) throw new Error("Expected malformed fixture");
  const diagnostic = diagnoseSmokeSourceFailure(
    source(),
    parsed.error,
  ).diagnostic;
  expect(diagnostic.issues).toHaveLength(8);
  expect(sourceSmokeDiagnosticSchema.safeParse(diagnostic).success).toBe(true);
  expect(
    sourceSmokeDiagnosticSchema.safeParse({
      ...diagnostic,
      raw: "private-value",
    }).success,
  ).toBe(false);
});

it("distinguishes empty transport success from malformed schema without proving current-season access", () => {
  const input = source();
  input.payload.response = [];
  input.payload.results = 0;
  const result = failure(input);
  expect(result.failureCode).toBe("SOURCE_UNAVAILABLE");
  expect(result.diagnostic.reason).toBe("EMPTY_RESPONSE");
});

it("keeps coverage-disabled and stale-source failures distinct", () => {
  const input = source();
  input.payload.response[0].seasons[0].coverage.players = false;
  expect(failure(input).diagnostic.reason).toBe("COVERAGE_UNAVAILABLE");
  input.fetchedAt = "2026-09-01T00:00:00Z";
  expect(failure(input).diagnostic.reason).toBe("SOURCE_STALE");
});
