import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  nflversePrimaryContext as context,
  nflversePrimaryFiles as files,
} from "../fixtures/nflverse-primary-results";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  fetchFiles: vi.fn(),
  fetchQuota: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ schema: () => ({ rpc: mocks.rpc }) }),
}));
vi.mock("@/adapters/supabase/config", () => ({
  getSupabasePublicConfig: () => ({ url: "https://example.test" }),
}));
vi.mock("@/adapters/supabase/server-secret", () => ({
  getSupabaseServerSecret: () => "fixture-server-secret",
}));
vi.mock("@/adapters/providers/nflverse/client", () => ({
  fetchNflverseSeasonEvidence: mocks.fetchFiles,
}));
vi.mock("@/adapters/providers/api-sports/client", () => ({
  fetchApiSportsQuotaStatus: mocks.fetchQuota,
  fetchApiSportsBoxScore: vi.fn(),
}));
import { processPlayerResults } from "@/adapters/providers/player-result-worker";

const leaseId = "b0000000-0000-4000-8000-000000000001";
let jobs: unknown[];
let failCompletion = false;
let expireLease = false;
beforeEach(() => {
  vi.stubEnv("API_SPORTS_NFL_KEY", "existing-unused-key");
  jobs = [{ leaseId, context }];
  failCompletion = false;
  expireLease = false;
  mocks.fetchFiles.mockResolvedValue({
    ...files,
    fetchedAt: context.fetchedAt,
    statsSourceUpdatedAt: context.sourceUpdatedAt,
    snapsSourceUpdatedAt: context.participationSourceUpdatedAt,
  });
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === "claim_player_statistics_status")
      return { data: { status: "DISABLED" }, error: null };
    if (name === "claim_nflverse_reconciliation")
      return { data: { status: "CLAIMED", jobs }, error: null };
    if (name === "complete_nflverse_reconciliation")
      return {
        data: { status: expireLease ? "EXPIRED" : "RECORDED" },
        error: failCompletion ? { message: "fixture error" } : null,
      };
    throw new Error(`Unexpected RPC ${name}`);
  });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
const completion = () =>
  mocks.rpc.mock.calls.find(
    ([name]) => name === "complete_nflverse_reconciliation",
  )?.[1];

describe("nflverse primary scheduler isolation", () => {
  it("uses the database policy before any API-Sports quota request even with the old key present", async () => {
    expect(await processPlayerResults()).toEqual({
      status: "PROCESSED",
      attempted: 0,
      reconciled: 1,
    });
    expect(mocks.fetchQuota).not.toHaveBeenCalled();
    expect(mocks.fetchFiles).toHaveBeenCalledOnce();
    expect(mocks.fetchFiles).toHaveBeenCalledWith(2026);
    expect(completion()).toMatchObject({
      p_lease_id: leaseId,
      p_observations: [{ value: 51, participation: "OFFENSE" }],
    });
  });
  it.each(["invalid-context", "invalid-game"])(
    "isolates one %s while importing the other game's evidence",
    async (kind) => {
      jobs.push({
        leaseId,
        context:
          kind === "invalid-context"
            ? { ...context, mappings: [{ subjectId: "invalid" }] }
            : {
                ...context,
                externalEventId: "bad-game",
                sourceEventId: "2026_01_BAL_CIN",
                awayTeam: "BAL",
                homeTeam: "CIN",
              },
      });
      expect(await processPlayerResults()).toEqual({
        status: "PARTIAL",
        attempted: 0,
        reconciled: 1,
      });
      expect(completion().p_observations).toHaveLength(1);
      expect(completion().p_observations[0].externalEventId).toBe(
        context.externalEventId,
      );
    },
  );
  it("does not spend a download for a claim with no usable identities", async () => {
    jobs = [{ leaseId, context: { ...context, mappings: [] } }];
    expect(await processPlayerResults()).toEqual({
      status: "PARTIAL",
      attempted: 0,
      reconciled: 0,
    });
    expect(mocks.fetchFiles).not.toHaveBeenCalled();
    expect(completion().p_observations).toBeNull();
  });
  it("records no observations when either artifact predates reliable final", async () => {
    mocks.fetchFiles.mockResolvedValueOnce({
      ...files,
      fetchedAt: context.fetchedAt,
      statsSourceUpdatedAt: context.sourceUpdatedAt,
      snapsSourceUpdatedAt: context.scheduledStartAt,
    });
    expect(await processPlayerResults()).toEqual({
      status: "PARTIAL",
      attempted: 0,
      reconciled: 0,
    });
    expect(completion().p_observations).toEqual([]);
  });
  it("releases the shared lease without evidence on download failure", async () => {
    mocks.fetchFiles.mockRejectedValueOnce(
      new Error("fixture network failure"),
    );
    expect(await processPlayerResults()).toEqual({
      status: "PARTIAL",
      attempted: 0,
      reconciled: 0,
    });
    expect(completion().p_observations).toBeNull();
  });
  it("does not report successful reconciliation after a database import failure", async () => {
    failCompletion = true;
    expect(await processPlayerResults()).toEqual({
      status: "PARTIAL",
      attempted: 0,
      reconciled: 0,
    });
  });
  it("does not report successful reconciliation for an expired lease", async () => {
    expireLease = true;
    expect(await processPlayerResults()).toEqual({
      status: "PARTIAL",
      attempted: 0,
      reconciled: 0,
    });
  });
});
