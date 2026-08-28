import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("server actions", () => {
  it("exports only async functions from the magic-link action module", async () => {
    const source = await readFile("src/app/(auth)/auth/actions.ts", "utf8");
    const exportedValues = [...source.matchAll(/^export\s+(.+)$/gm)].map(
      ([, declaration]) => declaration?.trim(),
    );

    expect(exportedValues).toEqual([
      expect.stringMatching(/^async function sendMagicLink\(/),
      expect.stringMatching(/^async function signOutAction\(/),
    ]);
  });
});
