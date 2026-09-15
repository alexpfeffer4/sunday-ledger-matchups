import { afterEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/operations/scores/route";
const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  entitlement: vi.fn(async () => "IDLE"),
  account: vi.fn(),
}));
vi.mock("@/adapters/providers/the-odds-api/account-check", () => ({
  checkOddsAccount: mocks.account,
}));
vi.mock("@/adapters/providers/the-odds-api/provider-requests", () => ({
  refreshLiveScores: mocks.refresh,
}));
vi.mock("@/adapters/providers/the-odds-api/entitlement", () => ({
  reconcileOddsEntitlement: mocks.entitlement,
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it.each([undefined, "", "Bearer wrong", "Bearer undefined"])(
  "rejects unauthenticated invocation %s before provider access",
  async (authorization) => {
    vi.stubEnv("SCORE_JOB_SECRET", "test-job-secret");
    const response = await POST(
      new Request("http://localhost/api/operations/scores", {
        method: "POST",
        headers: authorization ? { authorization } : {},
      }),
    );
    expect(response.status).toBe(401);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.entitlement).not.toHaveBeenCalled();
  },
);
it("fails closed when the endpoint secret is absent", async () => {
  vi.stubEnv("SCORE_JOB_SECRET", "");
  expect((await POST(new Request("http://localhost"))).status).toBe(401);
});
it("ignores caller event scope and never caches the operational response", async () => {
  vi.stubEnv("SCORE_JOB_SECRET", "test-job-secret");
  mocks.refresh.mockResolvedValue({ status: "IDLE", eventCount: 0 });
  const response = await POST(
    new Request("http://localhost", {
      method: "POST",
      headers: { authorization: "Bearer test-job-secret" },
      body: '{"leagueId":"untrusted","check":"odds-account"}',
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(mocks.refresh).toHaveBeenCalledWith();
  expect(mocks.account).not.toHaveBeenCalled();
});

const checkUrl = "http://localhost/api/operations/scores?check=odds-account";
function checkRequest(authorization = "Bearer test-job-secret") {
  return new Request(checkUrl, {
    method: "POST",
    headers: { authorization },
    body: '{"eventId":"untrusted","url":"https://example.test/paid"}',
  });
}
it.each(["", "Bearer wrong", "Bearer undefined"])(
  "authenticates account checks before any provider access: %s",
  async (authorization) => {
    vi.stubEnv("SCORE_JOB_SECRET", "test-job-secret");
    const response = await POST(checkRequest(authorization));
    expect(response.status).toBe(401);
    expect(mocks.account).not.toHaveBeenCalled();
    expect(mocks.entitlement).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  },
);
it.each(["UNCONFIGURED", "DEFERRED", "UNAVAILABLE"])(
  "reports account check %s without running ordinary jobs",
  async (status) => {
    vi.stubEnv("SCORE_JOB_SECRET", "test-job-secret");
    mocks.account.mockResolvedValueOnce({ status });
    const response = await POST(checkRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.account).toHaveBeenCalledWith();
    expect(mocks.entitlement).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  },
);
it("returns verified account proof without caller scope or score work", async () => {
  vi.stubEnv("SCORE_JOB_SECRET", "test-job-secret");
  const proof = {
    status: "READY",
    remaining: 19999,
    used: 1,
    last: 0,
    observedAt: "2026-09-15T12:00:00Z",
  };
  mocks.account.mockResolvedValueOnce(proof);
  const response = await POST(checkRequest());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(proof);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.account).toHaveBeenCalledWith();
  expect(mocks.entitlement).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("sanitizes account-check failures without running jobs or leaking errors", async () => {
  vi.stubEnv("SCORE_JOB_SECRET", "test-job-secret");
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.account.mockRejectedValueOnce(new Error("private-account-key"));
  const response = await POST(checkRequest());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "UNAVAILABLE" });
  expect(JSON.stringify(log.mock.calls)).not.toContain("private-account-key");
  expect(mocks.entitlement).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
  log.mockRestore();
});
