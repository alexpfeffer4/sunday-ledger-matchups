import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/operations/player-results/route";
const mocks = vi.hoisted(() => ({
  process: vi.fn(),
  catalog: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/adapters/providers/player-result-worker", () => ({
  processPlayerResults: mocks.process,
}));
vi.mock("@/application/players/catalog-preparation", () => ({
  processPendingPlayerCatalog: mocks.catalog,
}));
beforeEach(() => {
  vi.stubEnv("API_SPORTS_NFL_KEY", "");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.catalog.mockResolvedValue({ status: "DISABLED", missingSources: 0 });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it.each([undefined, "", "Bearer wrong", "Bearer undefined"])(
  "rejects unauthenticated invocation %s before result access",
  async (authorization) => {
    vi.stubEnv("SCORE_JOB_SECRET", "test-job-secret");
    const response = await POST(
      new Request("http://localhost/api/operations/player-results", {
        method: "POST",
        headers: authorization ? { authorization } : {},
      }),
    );
    expect(response.status).toBe(401);
    expect(mocks.process).not.toHaveBeenCalled();
    expect(mocks.catalog).not.toHaveBeenCalled();
  },
);
it("ignores caller scope and disables response caches", async () => {
  vi.stubEnv("SCORE_JOB_SECRET", "test-job-secret");
  mocks.process.mockResolvedValue({
    status: "IDLE",
    attempted: 0,
    reconciled: 0,
  });
  const response = await POST(
    new Request("http://localhost/api/operations/player-results", {
      method: "POST",
      headers: { authorization: "Bearer test-job-secret" },
      body: '{"eventId":"untrusted","check":"statistics-account"}',
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(mocks.process).toHaveBeenCalledWith();
  expect(mocks.catalog).toHaveBeenCalledWith();
  expect(mocks.fetch).not.toHaveBeenCalled();
});

const accountCheckUrl =
  "http://localhost/api/operations/player-results?check=statistics-account";
function accountCheckRequest(authorization = "Bearer test-job-secret") {
  return new Request(accountCheckUrl, {
    method: "POST",
    headers: { authorization },
  });
}
function expectNoJobWork() {
  expect(mocks.process).not.toHaveBeenCalled();
  expect(mocks.catalog).not.toHaveBeenCalled();
}

it.each(["", "Bearer wrong", "Bearer undefined"])(
  "rejects an account check with authorization %s before provider access",
  async (authorization) => {
    vi.stubEnv("SCORE_JOB_SECRET", "test-job-secret");
    vi.stubEnv("API_SPORTS_NFL_KEY", "fixture-provider-key");
    const response = await POST(accountCheckRequest(authorization));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expectNoJobWork();
  },
);

it("rejects an account check when the server job secret is unconfigured", async () => {
  vi.stubEnv("SCORE_JOB_SECRET", "");
  vi.stubEnv("API_SPORTS_NFL_KEY", "fixture-provider-key");
  const response = await POST(accountCheckRequest("Bearer "));
  expect(response.status).toBe(401);
  expect(mocks.fetch).not.toHaveBeenCalled();
  expectNoJobWork();
});

it("reports an absent statistics key without fetching or dispatching work", async () => {
  vi.stubEnv("SCORE_JOB_SECRET", "test-job-secret");
  const response = await POST(accountCheckRequest());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "UNCONFIGURED" });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.fetch).not.toHaveBeenCalled();
  expectNoJobWork();
});

it.each([true, false])(
  "returns only normalized account status for an active=%s subscription",
  async (active) => {
    vi.stubEnv("SCORE_JOB_SECRET", "test-job-secret");
    vi.stubEnv("API_SPORTS_NFL_KEY", "fixture-provider-key");
    mocks.fetch.mockResolvedValueOnce(
      Response.json({
        response: {
          account: { email: "private@example.test", firstname: "Private" },
          subscription: { active, plan: "Free", key: "private-account-field" },
          requests: { current: 4, limit_day: 100 },
        },
      }),
    );
    const response = await POST(accountCheckRequest());
    expect(response.status).toBe(active ? 200 : 503);
    expect(await response.json()).toEqual({
      status: active ? "READY" : "UNAVAILABLE",
      active,
      dailyLimit: 100,
      used: 4,
      observedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://v1.american-football.api-sports.io/status",
      expect.objectContaining({
        headers: {
          "x-apisports-key": "fixture-provider-key",
          Accept: "application/json",
        },
        cache: "no-store",
      }),
    );
    expectNoJobWork();
  },
);

it.each(["network", "http", "invalid-payload"])(
  "sanitizes an account check %s failure without starting jobs",
  async (failure) => {
    vi.stubEnv("SCORE_JOB_SECRET", "test-job-secret");
    vi.stubEnv("API_SPORTS_NFL_KEY", "fixture-provider-key");
    if (failure === "network") {
      mocks.fetch.mockRejectedValueOnce(new Error("private provider details"));
    } else if (failure === "http") {
      mocks.fetch.mockResolvedValueOnce(
        new Response("private provider details", { status: 403 }),
      );
    } else {
      mocks.fetch.mockResolvedValueOnce(
        Response.json({ account: { email: "private@example.test" } }),
      );
    }
    const response = await POST(accountCheckRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "UNAVAILABLE" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expectNoJobWork();
  },
);
it("continues accepted-result processing when independent catalog acquisition fails", async () => {
  vi.stubEnv("SCORE_JOB_SECRET", "test-job-secret");
  mocks.process.mockResolvedValue({
    status: "PROCESSED",
    attempted: 8,
    reconciled: 1,
  });
  mocks.catalog.mockRejectedValue(new Error("private provider failure"));
  const response = await POST(
    new Request("http://localhost/api/operations/player-results", {
      method: "POST",
      headers: { authorization: "Bearer test-job-secret" },
    }),
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    status: "PROCESSED",
    attempted: 8,
    reconciled: 1,
    catalog: { status: "UNAVAILABLE", missingSources: 0 },
  });
});
it("resumes catalog preparation while result processing has no work", async () => {
  vi.stubEnv("SCORE_JOB_SECRET", "test-job-secret");
  mocks.process.mockResolvedValue({
    status: "IDLE",
    attempted: 0,
    reconciled: 0,
  });
  mocks.catalog.mockResolvedValue({ status: "PENDING", missingSources: 7 });
  const response = await POST(
    new Request("http://localhost/api/operations/player-results", {
      method: "POST",
      headers: { authorization: "Bearer test-job-secret" },
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    catalog: { status: "PENDING", missingSources: 7 },
  });
});
