import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Phase 1 anonymous invitation permission", () => {
  it("grants anon only schema usage needed by the invitation preview RPC", async () => {
    const migration = await readFile(
      new URL(
        "../../supabase/migrations/20260828210751_phase1_anon_invite_preview_schema_usage.sql",
        import.meta.url,
      ),
      "utf8",
    );

    expect(migration.trim()).toBe("GRANT USAGE ON SCHEMA api TO anon;");
  });
});
