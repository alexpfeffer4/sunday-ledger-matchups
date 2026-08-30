import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    "supabase/migrations/20260830171706_phase8a_sparse_qualification_every_member_postseason.sql",
  ),
  "utf8",
);

describe("Phase 8A migration contract", () => {
  it("versions the existing authorities in place with same-entity no-fork lineage", () => {
    expect(migration).toContain("alter table private.playoff_publications");
    expect(migration).toContain("playoff_publications_one_successor_idx");
    expect(migration).toContain(
      "playoff_publications_supersedes_same_season_fk",
    );
    expect(migration).toContain(
      "playoff_round_publications_supersedes_same_week_fk",
    );
    expect(migration).not.toMatch(/create table private\.playoff_publications/);
    expect(migration).not.toMatch(/delete from private\.playoff/);
  });

  it("exposes one canonical qualification, round, and participant read path", () => {
    expect(migration).toContain(
      "create or replace function api.publish_playoff_qualification",
    );
    expect(migration).toContain(
      "create or replace function api.publish_postseason_week",
    );
    expect(migration).toContain(
      "create or replace function api.get_playoff_state",
    );
    expect(migration).toMatch(
      /select api\.publish_playoff_qualification\(p_league_id, p_idempotency_key\)/,
    );
    expect(migration).toMatch(
      /select api\.publish_postseason_week\(p_league_id, p_import_id, p_external_event_ids, p_idempotency_key\)/,
    );
  });

  it("rejects incomplete frozen policy and prevents sealed downstream rewrites", () => {
    expect(migration).toContain("private.phase8_ruleset_is_complete");
    expect(migration).toContain(
      "The frozen Ruleset lacks the required V1.1 postseason policy.",
    );
    expect(migration).toContain(
      "Qualification cannot change after a downstream card seals.",
    );
    expect(migration).toContain("postseason_role = 'CHAMPIONSHIP'");
    expect(migration).toContain("EXHIBITION_MISS");
  });
});
