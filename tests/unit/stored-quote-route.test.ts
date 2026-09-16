import { afterEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/l/[leagueSlug]/quotes/route";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/adapters/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    schema: () => ({ rpc: mocks.rpc }),
  }),
}));
afterEach(() => vi.resetAllMocks());

const read = () =>
  GET(
    new Request(
      "http://localhost/api/l/test-league/quotes?weekId=10000000-0000-4000-8000-000000000001",
    ),
    { params: Promise.resolve({ leagueSlug: "test-league" }) },
  );

it("stops optional polling before the database capability is installed", async () => {
  mocks.rpc.mockResolvedValue({ error: { code: "PGRST202" }, data: null });
  const response = await read();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "STOP" });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
});

it.each([
  ["42501", 403],
  ["PGRST000", 503],
])("preserves authorization and transient errors: %s", async (code, status) => {
  mocks.rpc.mockResolvedValue({ error: { code }, data: null });
  const response = await read();
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: "Quotes unavailable." });
});
