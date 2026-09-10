import { afterEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/operations/scores/route";
const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("@/adapters/providers/the-odds-api/provider-requests", () => ({
  refreshLiveScores: mocks.refresh,
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
      body: '{"leagueId":"untrusted"}',
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(mocks.refresh).toHaveBeenCalledWith();
});
