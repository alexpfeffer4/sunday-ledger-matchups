import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("server actions", () => {
  it("exports only async functions from the magic-link action module", async () => {
    const source = await readFile("src/app/(auth)/auth/actions.ts", "utf8");
    const exportedValues = [...source.matchAll(/^export\s+(.+)$/gm)].map(
      ([, declaration]) => declaration?.trim(),
    );

    expect(exportedValues).toEqual([
      expect.stringMatching(/^async function sendCreateAccountLink\(/),
      expect.stringMatching(/^async function sendSignInLink\(/),
      expect.stringMatching(/^async function requestPasswordReset\(/),
      expect.stringMatching(/^async function signInWithPassword\(/),
      expect.stringMatching(/^async function updatePassword\(/),
      expect.stringMatching(/^async function finishPasswordRecovery\(/),
      expect.stringMatching(/^async function signOutAction\(/),
    ]);
  });
});
