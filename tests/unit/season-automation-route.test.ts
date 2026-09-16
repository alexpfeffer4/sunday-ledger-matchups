import { afterEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/operations/season-automation/route";
const mocks = vi.hoisted(() => ({ process: vi.fn() }));
vi.mock("@/application/automation/worker", () => ({
  processSeasonAutomation: mocks.process,
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it.each([undefined, "", "Bearer wrong", "Bearer undefined"])(
  "rejects unauthorized invocation %s before any work",
  async (authorization) => {
    vi.stubEnv("SCORE_JOB_SECRET", "fixture-secret");
    const response = await POST(
      new Request("http://localhost/api/operations/season-automation", {
        method: "POST",
        headers: authorization ? { authorization } : {},
      }),
    );
    expect(response.status).toBe(401);
    expect(mocks.process).not.toHaveBeenCalled();
  },
);
it.each([
  ["?week=3", "{}"],
  ["", '{"seasonId":"untrusted"}'],
  ["", '{"url":"https://example.test"}'],
])("rejects caller scope %s %s", async (query, body) => {
  vi.stubEnv("SCORE_JOB_SECRET", "fixture-secret");
  const response = await POST(
    new Request(`http://localhost/api/operations/season-automation${query}`, {
      method: "POST",
      headers: { authorization: "Bearer fixture-secret" },
      body,
    }),
  );
  expect(response.status).toBe(400);
  expect(mocks.process).not.toHaveBeenCalled();
});
it("returns no-cache bounded worker outcomes", async () => {
  vi.stubEnv("SCORE_JOB_SECRET", "fixture-secret");
  mocks.process.mockResolvedValueOnce({
    status: "PARTIAL",
    attempted: 3,
    failed: 1,
  });
  const response = await POST(
    new Request("http://localhost/api/operations/season-automation", {
      method: "POST",
      headers: { authorization: "Bearer fixture-secret" },
      body: "{}",
    }),
  );
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.process).toHaveBeenCalledWith();
});
