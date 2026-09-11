import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashRuleset } from "@/rulesets/canonicalize";
import { simulationSeason11Ruleset } from "@/rulesets/simulation-season-1-1";
import { frozenCardRulesFixture } from "../fixtures/card-rules";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("@/adapters/supabase/config", () => ({
  isSupabaseConfigured: () => true,
}));
vi.mock("@/adapters/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: "member" } } }) },
    schema: () => ({ rpc: mocks.rpc }),
  }),
}));

import { getSeasonRuleset } from "@/application/queries/get-season-ruleset";

async function fixture() {
  const current = frozenCardRulesFixture("SIMULATION");
  const previous = frozenCardRulesFixture(
    "SIMULATION",
    simulationSeason11Ruleset,
  );
  current.sha256Hash = await hashRuleset(current.canonicalJson);
  previous.sha256Hash = await hashRuleset(previous.canonicalJson);
  return { ...current, priorRules: [previous] };
}

describe("official current and historical rules reads", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns verified current and historical rules unchanged", async () => {
    const data = await fixture();
    mocks.rpc.mockResolvedValueOnce({ data, error: null });
    const result = await getSeasonRuleset("member-league");
    expect(result?.canonicalJson).toEqual(data.canonicalJson);
    expect(result?.priorRules?.[0].canonicalJson).toEqual(
      data.priorRules[0].canonicalJson,
    );
  });

  it.each(["current", "historical"] as const)(
    "rejects altered %s content with an unchanged digest",
    async (target) => {
      const data = await fixture();
      const snapshot = target === "current" ? data : data.priorRules[0];
      snapshot.canonicalJson.seasonLabel = "Altered after publication";
      // A supplied computed hash cannot authorize the altered package.
      snapshot.canonicalSha256Hash = snapshot.sha256Hash;
      mocks.rpc.mockResolvedValueOnce({ data, error: null });
      await expect(getSeasonRuleset("member-league")).rejects.toThrow(
        "integrity check",
      );
    },
  );

  it("checks the raw JSON before a schema could strip extra fields", async () => {
    const data = await fixture();
    Object.assign(data.priorRules[0].canonicalJson, { unexpectedRule: true });
    mocks.rpc.mockResolvedValueOnce({ data, error: null });
    await expect(getSeasonRuleset("member-league")).rejects.toThrow(
      "integrity check",
    );
  });
});
