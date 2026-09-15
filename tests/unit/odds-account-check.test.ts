import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { checkOddsAccount } from "@/adapters/providers/the-odds-api/account-check";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  create: vi.fn(),
  secret: vi.fn(() => "fixture-server-secret"),
  fetch: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.create }));
vi.mock("@/adapters/supabase/config", () => ({
  getSupabasePublicConfig: () => ({ url: "https://fixture.supabase.co" }),
}));
vi.mock("@/adapters/supabase/server-secret", () => ({
  getSupabaseServerSecret: mocks.secret,
}));
const probeId = "93c44290-971e-40cf-8cfc-0c7186208141";
const proof = {
  status: "READY",
  remaining: 19980,
  used: 20,
  last: 0,
  observedAt: "2026-09-15T12:00:00+00:00",
};
beforeEach(() => {
  vi.stubEnv("ODDS_API_KEY", "fixture-odds-key");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.create.mockReturnValue({ schema: () => ({ rpc: mocks.rpc }) });
  mocks.rpc
    .mockResolvedValueOnce({
      data: { status: "CLAIMED", probeId },
      error: null,
    })
    .mockResolvedValue({
      data: { ...proof, privateAccountData: "must not escape" },
      error: null,
    });
  mocks.fetch.mockResolvedValue(
    new Response('[{"private":"must not escape"}]', {
      headers: {
        "x-requests-remaining": "19980",
        "x-requests-used": "20",
        "x-requests-last": "0",
      },
    }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it.each(["provider", "server"])(
  "does not acquire a lease without the %s key",
  async (missing) => {
    if (missing === "provider") vi.stubEnv("ODDS_API_KEY", "");
    else mocks.secret.mockReturnValueOnce("");
    expect(await checkOddsAccount()).toEqual({ status: "UNCONFIGURED" });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  },
);
it("waits for the global lease before accessing the provider", async () => {
  mocks.rpc.mockReset().mockResolvedValue({ data: { status: "IDLE" } });
  expect(await checkOddsAccount()).toEqual({ status: "DEFERRED" });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("claim_odds_account_probe");
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("uses only the uncharged fixed endpoint and returns persisted sanitized proof", async () => {
  expect(await checkOddsAccount()).toEqual(proof);
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  const [requestUrl, init] = mocks.fetch.mock.calls[0];
  const url = new URL(String(requestUrl));
  expect(url.origin).toBe("https://api.the-odds-api.com");
  expect(url.pathname).toBe("/v4/sports/");
  expect([...url.searchParams.keys()]).toEqual(["apiKey"]);
  expect(init).toMatchObject({ cache: "no-store" });
  expect(init.signal).toBeInstanceOf(AbortSignal);
  expect(mocks.rpc.mock.calls).toEqual([
    ["claim_odds_account_probe"],
    [
      "complete_odds_account_probe",
      { p_probe_id: probeId, p_usage: { remaining: 19980, used: 20, last: 0 } },
    ],
  ]);
});
it.each<Record<string, string>>([
  {},
  {
    "x-requests-remaining": "19980",
    "x-requests-used": "",
    "x-requests-last": "0",
  },
  {
    "x-requests-remaining": "2e4",
    "x-requests-used": "0",
    "x-requests-last": "0",
  },
  {
    "x-requests-remaining": "-1",
    "x-requests-used": "20",
    "x-requests-last": "0",
  },
  {
    "x-requests-remaining": "19980",
    "x-requests-used": "20.5",
    "x-requests-last": "0",
  },
  {
    "x-requests-remaining": "19980",
    "x-requests-used": "20",
    "x-requests-last": "1",
  },
  {
    "x-requests-remaining": "2147483648",
    "x-requests-used": "0",
    "x-requests-last": "0",
  },
])(
  "rejects incomplete, charged, or invalid quota proof %#",
  async (headers) => {
    mocks.fetch.mockResolvedValueOnce(new Response("[]", { headers }));
    expect(await checkOddsAccount()).toEqual({ status: "UNAVAILABLE" });
    expect(mocks.rpc).toHaveBeenLastCalledWith("complete_odds_account_probe", {
      p_probe_id: probeId,
      p_usage: null,
    });
  },
);
it.each(["network", "http", "payload"])(
  "closes a failed %s request without returning raw provider data",
  async (failure) => {
    if (failure === "network")
      mocks.fetch.mockRejectedValueOnce(new Error("private-key-in-url"));
    else if (failure === "http")
      mocks.fetch.mockResolvedValueOnce(
        new Response("private-key", { status: 401 }),
      );
    else mocks.fetch.mockResolvedValueOnce(new Response('{"private":"key"}'));
    expect(await checkOddsAccount()).toEqual({ status: "UNAVAILABLE" });
    expect(mocks.rpc).toHaveBeenLastCalledWith("complete_odds_account_probe", {
      p_probe_id: probeId,
      p_usage: null,
    });
  },
);
it("does not return proof unless database completion accepts its lease", async () => {
  mocks.rpc
    .mockReset()
    .mockResolvedValueOnce({ data: { status: "CLAIMED", probeId } })
    .mockResolvedValueOnce({ data: { status: "UNAVAILABLE" } });
  expect(await checkOddsAccount()).toEqual({ status: "UNAVAILABLE" });
});
