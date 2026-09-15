import { afterEach, expect, it, vi } from "vitest";
import { checkPlayerSourceSmoke } from "@/adapters/providers/api-sports/source-smoke";
const mocks = vi.hoisted(() => ({ create: vi.fn(), fetch: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.create }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
it.each(["provider", "server"])(
  "does not access database or provider without the %s secret",
  async (missing) => {
    vi.stubEnv(
      "API_SPORTS_NFL_KEY",
      missing === "provider" ? "" : "fixture-key",
    );
    vi.stubEnv(
      "SUPABASE_SECRET_KEY",
      missing === "server" ? "" : "fixture-server-key",
    );
    vi.stubEnv("SUPABASE_Secret_KEY", "");
    vi.stubGlobal("fetch", mocks.fetch);
    expect(await checkPlayerSourceSmoke("source-smoke-2026-1")).toEqual({
      status: "UNCONFIGURED",
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  },
);
