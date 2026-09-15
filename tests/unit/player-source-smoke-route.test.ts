import { afterEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/operations/player-source-smoke/route";
const mocks = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("@/adapters/providers/api-sports/source-smoke", () => ({
  checkPlayerSourceSmoke: mocks.check,
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
function request(
  authorization = "Bearer fixture-secret",
  operation = "source-smoke-2026-1",
) {
  return new Request("http://localhost/api/operations/player-source-smoke", {
    method: "POST",
    headers: { authorization, "x-operation-key": operation },
    body: '{"season":2025,"gameId":"untrusted","apiKey":"untrusted","url":"https://example.test"}',
  });
}
it.each(["", "Bearer wrong", "Bearer undefined"])(
  "rejects authorization %s before diagnostic access",
  async (authorization) => {
    vi.stubEnv("SCORE_JOB_SECRET", "fixture-secret");
    expect((await POST(request(authorization))).status).toBe(401);
    expect(mocks.check).not.toHaveBeenCalled();
  },
);
it("rejects even well-shaped diagnostics when the operator secret is missing", async () => {
  vi.stubEnv("SCORE_JOB_SECRET", "");
  expect((await POST(request("Bearer "))).status).toBe(401);
  expect(mocks.check).not.toHaveBeenCalled();
});
it.each(["", "short", "bad operation", "a".repeat(121)])(
  "requires a bounded opaque operation key %#",
  async (operation) => {
    vi.stubEnv("SCORE_JOB_SECRET", "fixture-secret");
    expect((await POST(request(undefined, operation))).status).toBe(400);
    expect(mocks.check).not.toHaveBeenCalled();
  },
);
it("accepts only the operation identifier and returns uncached normalized facts", async () => {
  vi.stubEnv("SCORE_JOB_SECRET", "fixture-secret");
  mocks.check.mockResolvedValueOnce({
    status: "CHECKED",
    report: { completenessValidated: false },
  });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.check).toHaveBeenCalledExactlyOnceWith("source-smoke-2026-1");
  expect(await response.json()).toEqual({
    status: "CHECKED",
    report: { completenessValidated: false },
  });
});
it.each(["UNCONFIGURED", "LIMIT", "BUSY", "DEFERRED", "UNAVAILABLE"])(
  "reports %s without pretending the source is ready",
  async (status) => {
    vi.stubEnv("SCORE_JOB_SECRET", "fixture-secret");
    mocks.check.mockResolvedValueOnce({ status });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status });
  },
);
it("does not log or return raw errors containing provider secrets", async () => {
  vi.stubEnv("SCORE_JOB_SECRET", "fixture-secret");
  const log = vi.spyOn(console, "error");
  mocks.check.mockRejectedValueOnce(new Error("private-provider-key"));
  expect(await (await POST(request())).json()).toEqual({
    status: "UNAVAILABLE",
  });
  expect(log).not.toHaveBeenCalled();
  log.mockRestore();
});

it("returns bounded source diagnostics only through the authorized uncached response", async () => {
  vi.stubEnv("SCORE_JOB_SECRET", "fixture-secret");
  const result = {
    status: "UNAVAILABLE",
    failureStage: "COVERAGE",
    failureCode: "SOURCE_SHAPE_UNSUPPORTED",
    sourceDiagnostic: {
      reason: "SCHEMA_MISMATCH",
      providerErrorCategories: [],
      issues: [
        {
          path: ["*", "league"],
          code: "invalid_type",
          expectedType: "object",
          observedType: "undefined",
        },
      ],
    },
  };
  mocks.check.mockResolvedValue(result);
  const unauthorized = await POST(request("Bearer wrong"));
  expect(unauthorized.status).toBe(401);
  expect(await unauthorized.json()).toEqual({ error: "Unauthorized" });
  expect(mocks.check).not.toHaveBeenCalled();
  const authorized = await POST(request());
  expect(authorized.status).toBe(503);
  expect(authorized.headers.get("cache-control")).toBe("private, no-store");
  expect(await authorized.json()).toEqual(result);
});
