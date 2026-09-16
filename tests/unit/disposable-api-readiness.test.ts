import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForDisposableApi } from "../../scripts/wait-for-disposable-api.mjs";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("disposable API reset readiness", () => {
  it("waits for exposed schema and the migrated RPC without invoking it", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ code: "PGRST106" }, { status: 406 }),
      )
      .mockResolvedValueOnce(Response.json({ paths: {} }))
      .mockResolvedValueOnce(
        Response.json({ paths: { "/rpc/claim_season_automation_odds": {} } }),
      );
    vi.stubGlobal("fetch", fetch);
    const waiting = waitForDisposableApi(
      "http://127.0.0.1:54321",
      "fixture-key",
    );
    await vi.runAllTimersAsync();
    await waiting;
    expect(fetch).toHaveBeenCalledTimes(3);
    for (const [url, options] of fetch.mock.calls) {
      expect(String(url)).toBe("http://127.0.0.1:54321/rest/v1/");
      expect(options.method).toBeUndefined();
      expect(options.headers["Accept-Profile"]).toBe("api");
    }
  });

  it("fails promptly on an authorization error instead of hiding it as startup", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ code: "42501" }, { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    await expect(
      waitForDisposableApi("http://localhost:54321", "fixture-key"),
    ).rejects.toThrow("HTTP 401");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("fails within a bounded interval if the schema never becomes ready", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ paths: {} })),
    );
    const waiting = expect(
      waitForDisposableApi("http://127.0.0.1:54321", "fixture-key"),
    ).rejects.toThrow("within 30 seconds");
    await vi.runAllTimersAsync();
    await waiting;
  });

  it("rejects hosted targets before making a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      waitForDisposableApi("https://example.supabase.co", "fixture-key"),
    ).rejects.toThrow("loopback");
    expect(fetch).not.toHaveBeenCalled();
  });
});
