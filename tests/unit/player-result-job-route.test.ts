import { afterEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/operations/player-results/route";
const mocks = vi.hoisted(() => ({ process: vi.fn() }));
vi.mock("@/adapters/providers/player-result-worker", () => ({ processPlayerResults: mocks.process }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it.each([undefined, "", "Bearer wrong", "Bearer undefined"])("rejects unauthenticated invocation %s before result access", async (authorization) => {
  vi.stubEnv("SCORE_JOB_SECRET", "test-job-secret");
  const response = await POST(new Request("http://localhost/api/operations/player-results", { method: "POST", headers: authorization ? { authorization } : {} }));
  expect(response.status).toBe(401); expect(mocks.process).not.toHaveBeenCalled();
});
it("ignores caller scope and disables response caches", async () => {
  vi.stubEnv("SCORE_JOB_SECRET", "test-job-secret"); mocks.process.mockResolvedValue({ status: "IDLE", attempted: 0, reconciled: 0 });
  const response = await POST(new Request("http://localhost/api/operations/player-results", { method: "POST", headers: { authorization: "Bearer test-job-secret" }, body: '{"eventId":"untrusted"}' }));
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store"); expect(mocks.process).toHaveBeenCalledWith();
});
