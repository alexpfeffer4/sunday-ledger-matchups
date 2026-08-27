import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/adapters/supabase/redirect";

describe("Supabase auth redirects", () => {
  it("preserves an internal path with query and hash", () => {
    expect(safeInternalPath("/leagues?joined=true#current")).toBe(
      "/leagues?joined=true#current",
    );
  });

  it.each([
    undefined,
    null,
    "https://attacker.example/path",
    "//attacker.example/path",
    "/\\attacker.example/path",
    "/leagues\\attacker.example",
    "/leagues\nmalformed",
  ])("rejects an unsafe redirect value", (value) => {
    expect(safeInternalPath(value)).toBe("/leagues");
  });
});
