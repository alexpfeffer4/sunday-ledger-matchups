import { afterEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getSupabaseServerSecret } from "@/adapters/supabase/server-secret";

afterEach(() => vi.unstubAllEnvs());

it("prefers the documented server key when both names exist", () => {
  vi.stubEnv("SUPABASE_SECRET_KEY", "canonical-test-secret");
  vi.stubEnv("SUPABASE_Secret_KEY", "legacy-test-secret");
  expect(getSupabaseServerSecret()).toBe("canonical-test-secret");
});

it("supports the existing write-only Production key name", () => {
  vi.stubEnv("SUPABASE_SECRET_KEY", undefined);
  vi.stubEnv("SUPABASE_Secret_KEY", "legacy-test-secret");
  expect(getSupabaseServerSecret()).toBe("legacy-test-secret");
});

it("leaves missing server credentials unconfigured", () => {
  vi.stubEnv("SUPABASE_SECRET_KEY", undefined);
  vi.stubEnv("SUPABASE_Secret_KEY", undefined);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-test-key");
  expect(getSupabaseServerSecret()).toBeUndefined();
});
