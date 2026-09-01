import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { liveCompatibilityHref } from "@/application/navigation/live-compatibility";

function source(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

describe("Phase 10 route consolidation boundaries", () => {
  it("preserves every /live query value on the corresponding Matchup route", () => {
    const href = liveCompatibilityHref("sunday friends", {
      week: "6",
      panel: ["score", "ledger"],
      empty: "",
      omitted: undefined,
    });
    expect(href).toBe(
      "/l/sunday%20friends/matchup?week=6&panel=score&panel=ledger&empty=",
    );
  });

  it("keeps /live as a compatibility redirect without a second data authority", () => {
    const livePage = source("src/app/l/[leagueSlug]/live/page.tsx");
    expect(livePage).toContain("redirect(liveCompatibilityHref");
    expect(livePage).not.toContain("getAuthoritativeLeagueState");
    expect(livePage).not.toContain("getLiveWeekOperations");

    const matchupPage = source("src/app/l/[leagueSlug]/matchup/page.tsx");
    expect(matchupPage).toContain("getAuthoritativeLeagueState");
    expect(matchupPage).toContain("getLiveWeekOperations");
    expect(matchupPage).toContain("getWeeklyCloseState");
    expect(matchupPage).toContain("getSeasonArchive");
  });

  it("keeps Make picks and My Card distinct and valid in active or archive context", () => {
    const navigation = source("src/components/league/league-nav.tsx");
    expect(navigation).toContain(
      '{ label: "Make picks", segment: "slate", icon: "slate" }',
    );
    expect(navigation).toContain(
      '{ label: "My Card", segment: "card", icon: "card" }',
    );
    expect(navigation).not.toContain('segment: "live"');

    for (const page of ["slate", "card"]) {
      const pageSource = source(`src/app/l/[leagueSlug]/${page}/page.tsx`);
      expect(pageSource).toContain("getAuthoritativeLeagueState");
      expect(pageSource).toContain("getSeasonArchive");
    }
  });

  it("keeps commissioner presentation lifecycle-based without new authority", () => {
    const presentation = source("src/components/stage1/live-views.tsx");
    const controls = source("src/components/commissioner/stage1-controls.tsx");
    expect(presentation).toContain("Current league and season state");
    expect(presentation).toContain("Lifecycle and league settings");
    expect(controls).toContain("Next action");
    expect(controls).toContain("League formation");
    expect(controls).not.toMatch(/edit (scores|receipts|seeds|winners)/i);
  });

  it("introduces no Phase 9 collection or social surface", () => {
    const changedSurfaces = [
      "src/components/league/league-nav.tsx",
      "src/components/league/league-shell.tsx",
      "src/components/league/schedule-navigator.tsx",
      "src/components/league/standings-table.tsx",
      "src/components/matchup/league-scoreboard.tsx",
      "src/components/season/archive-views.tsx",
      "src/components/stage1/live-views.tsx",
    ]
      .map(source)
      .join("\n");
    expect(changedSurfaces).not.toMatch(
      /analytics|structured moments|activity feed|commissioner note|reaction|tracking event/i,
    );
  });
});
