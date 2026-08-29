// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exampleSeasonArchive,
  exampleSeasonSlug,
} from "@/adapters/example/example-season";
import { SeasonArchiveHome } from "@/components/season/archive-views";

const queryMocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/adapters/supabase/config", () => ({
  isSupabaseConfigured: () => true,
}));
vi.mock("@/adapters/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: queryMocks.getClaims },
    schema: () => ({ rpc: queryMocks.rpc }),
  }),
}));

import { getSeasonArchive } from "@/application/queries/get-season-archive";

afterEach(cleanup);

describe("Phase 4 Simulation containment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "authenticated-member" } },
    });
  });

  it("retains one neutral static Example Season with no personal identity", () => {
    expect(exampleSeasonSlug).toBe("example-season");
    expect(exampleSeasonArchive.seasonLabel).toBe("Example Season");
    expect(exampleSeasonArchive.members).toHaveLength(10);

    const serialized = JSON.stringify(exampleSeasonArchive);
    expect(serialized).not.toMatch(
      /pfeff|west-21st|stage 2 member|example\.test/i,
    );
    expect(
      exampleSeasonArchive.members.every((member) =>
        member.displayName.endsWith(" Club"),
      ),
    ).toBe(true);
  });

  it("labels the retained artifact as a read-only Example Season", () => {
    const { container } = render(
      <SeasonArchiveHome
        archive={exampleSeasonArchive}
        leagueSlug={exampleSeasonSlug}
      />,
    );

    expect(screen.getAllByText(/Example Season/).length).toBeGreaterThan(1);
    expect(screen.getByText(/Nothing here can be changed/)).toBeVisible();
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });

  it("rejects legacy coarse Simulation payloads from the trusted archive query", async () => {
    queryMocks.rpc.mockResolvedValueOnce({
      data: exampleSeasonArchive,
      error: null,
    });

    await expect(
      getSeasonArchive("legacy-simulation-league"),
    ).resolves.toBeNull();
    expect(queryMocks.rpc).toHaveBeenCalledWith("get_season_archive", {
      p_league_slug: "legacy-simulation-league",
    });
  });

  it("contains the shortcut at both the application and database boundaries", () => {
    const actionSource = readFileSync(
      resolve(process.cwd(), "src/app/l/[leagueSlug]/actions.ts"),
      "utf8",
    );
    const migrationSource = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260829090000_phase4_simulation_containment.sql",
      ),
      "utf8",
    );

    expect(actionSource).not.toContain("publishSimulationSeasonArchiveAction");
    expect(migrationSource).toMatch(
      /revoke all on function api\.publish_simulation_season_archive\(uuid, jsonb, text\)[\s\S]*authenticated/,
    );
    expect(migrationSource).not.toMatch(
      /\b(update|delete from|truncate)\s+private\.simulation_season_archives\b/i,
    );
  });
});
