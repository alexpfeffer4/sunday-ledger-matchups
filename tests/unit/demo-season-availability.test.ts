import { describe, expect, it } from "vitest";
import { isDemoSeasonEnabled } from "@/application/demo/demo-season-availability";

// The environment guard applies only to the full-season redirect shortcut.
// The isolated /leagues/demo practice flow is intentionally available in
// Production because it is client-only and never writes competitive data.

describe("demo season availability", () => {
  it("is enabled on Vercel Preview despite the production Node build mode", () => {
    expect(
      isDemoSeasonEnabled({
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
      }),
    ).toBe(true);
  });

  it("is disabled on Vercel Production", () => {
    expect(
      isDemoSeasonEnabled({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
      }),
    ).toBe(false);
  });

  it("is enabled for local development and disabled for an unscoped production build", () => {
    expect(isDemoSeasonEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(isDemoSeasonEnabled({ NODE_ENV: "production" })).toBe(false);
  });
});
