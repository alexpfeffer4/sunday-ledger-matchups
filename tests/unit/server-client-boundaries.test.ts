import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("server and client component boundaries", () => {
  it("keeps the league initials formatter server-safe", async () => {
    const [shell, menu, formatter] = await Promise.all([
      readFile("src/components/league/league-shell.tsx", "utf8"),
      readFile("src/components/league/league-mobile-more.tsx", "utf8"),
      readFile("src/components/league/initials.ts", "utf8"),
    ]);

    expect(shell).toContain(
      'import { initials } from "@/components/league/initials";',
    );
    expect(menu).toContain('"use client";');
    expect(formatter).not.toContain("use client");
  });
});
