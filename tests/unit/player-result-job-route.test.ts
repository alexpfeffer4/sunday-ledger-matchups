import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/operations/player-results/route";
const mocks = vi.hoisted(() => ({ process: vi.fn(), catalog: vi.fn() }));
vi.mock("@/adapters/providers/player-result-worker", () => ({
  processPlayerResults: mocks.process,
}));
vi.mock("@/application/players/catalog-preparation", () => ({
  processPendingPlayerCatalog: mocks.catalog,
}));
beforeEach(() => {
  mocks.catalog.mockResolvedValue({ status: "DISABLED", missingSources: 0 });
});
afterEach(() => {
  vi.unstubAllEnvs();
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
      body: '{"eventId":"untrusted"}',
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(mocks.process).toHaveBeenCalledWith();
  expect(mocks.catalog).toHaveBeenCalledWith();
});
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
