import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = resolve("supabase/migrations");
const acceptanceRepair =
  "20260901003000_phase8_acceptance_week18_pairing_repair.sql";

const phase8Migrations = [
  {
    file: "20260831040524_phase8a_sparse_qualification_every_member_postseason.sql",
    gitBlobSha: "2c38e87a21c4bff8ba0d7aef6b382c0e1367e245",
  },
  {
    file: "20260831131451_phase8a_postseason_slate_and_fk_hardening.sql",
    gitBlobSha: "aeb8abd11bc1b1b40ae05e15ff6344cac4435c2f",
  },
  {
    file: "20260831150000_phase8b_champion_finality_week18_archive.sql",
    gitBlobSha: "49f329b5b7e2b56c5469b7279b181601a997c718",
  },
  {
    file: "20260831212703_phase8c_authoritative_same_lifecycle_simulation.sql",
    gitBlobSha: "057b378a87c3e44353df017e055229d0c6ea7da9",
  },
] as const;

function migration(file: string) {
  return readFileSync(resolve(migrationsDirectory, file), "utf8");
}

function gitBlobSha(source: string) {
  const bytes = Buffer.from(source, "utf8");
  return createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
}

describe("Phase 8 acceptance migration manifest", () => {
  it("records all four immutable Phase 8 files in merge order", () => {
    const actual = readdirSync(migrationsDirectory)
      .filter((file) => /phase8[abc]_/.test(file))
      .toSorted();

    expect(actual).toEqual(phase8Migrations.map(({ file }) => file));
    for (const { file, gitBlobSha: expectedSha } of phase8Migrations) {
      expect(gitBlobSha(migration(file))).toBe(expectedSha);
    }
  });

  it("limits the Phase 8A legacy backfill to version-root metadata", () => {
    const phase8a = migration(phase8Migrations[0].file);
    const publicationBackfill = phase8a.match(
      /update private\.playoff_publications\s+set([\s\S]*?)where version is null;/,
    );
    const roundBackfill = phase8a.match(
      /update private\.playoff_round_publications set([\s\S]*?)where version is null;/,
    );

    expect(publicationBackfill?.[1].replace(/\s+/g, " ").trim()).toBe(
      "version = 1, source_result_version_ids = '{}'::uuid[]",
    );
    expect(roundBackfill?.[1].replace(/\s+/g, " ").trim()).toBe("version = 1");
    expect(publicationBackfill?.[1]).not.toMatch(
      /bracket_json|bracket_state|qualifiers|standings_json|input_hash/,
    );
    expect(roundBackfill?.[1]).not.toMatch(
      /matchups_json|participant_entry_ids|input_hash/,
    );
  });

  it("never rewrites frozen rulesets or deletes protected competitive facts", () => {
    const combined = phase8Migrations
      .map(({ file }) => migration(file))
      .concat(migration(acceptanceRepair))
      .join("\n");

    expect(combined).toContain("where snapshot.frozen_at is null");
    expect(combined).not.toMatch(
      /delete\s+from\s+private\.(?:season_ruleset_snapshots|position_receipts|event_result_versions|matchup_result_versions|playoff_publications|playoff_round_publications|season_archive_versions)/i,
    );
    expect(combined).not.toMatch(
      /update\s+private\.(?:position_receipts|event_result_versions|matchup_result_versions|season_archive_versions)\s+set/i,
    );
  });

  it("repairs Week 18 pairing comparison without rewriting stored facts", () => {
    const repair = migration(acceptanceRepair);

    expect(repair).toContain("(game.value #>> '{sideA,entryId}') || ':'");
    expect(repair).toContain("|| (game.value #>> '{sideB,entryId}')");
    expect(repair).not.toMatch(/\b(?:update|delete)\s+private\./i);
  });
});
