import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    "supabase/migrations/20260831150000_phase8b_champion_finality_week18_archive.sql",
  ),
  "utf8",
);

describe("Phase 8B migration contract", () => {
  it("stores three distinct post-Week 17 lifecycle states without rewriting a season value", () => {
    expect(migration).toContain(
      "'CHAMPION_FINAL', 'WEEK_18_EXHIBITION', 'FINAL'",
    );
    expect(migration).toContain("lifecycle = 'CHAMPION_FINAL'");
    expect(migration).toContain("lifecycle = 'WEEK_18_EXHIBITION'");
    expect(migration).toContain("lifecycle = 'FINAL'");
    expect(migration).not.toMatch(
      /update private\.seasons\s+set lifecycle = 'CHAMPION_FINAL'\s*;/,
    );
  });

  it("renames the archive authority in place and versions legacy rows as roots", () => {
    expect(migration).toContain(
      "alter table private.live_season_archives rename to season_archive_versions",
    );
    expect(migration).not.toMatch(
      /create table private\.(?:live_season_archives|season_archive_versions)/,
    );
    expect(migration).toContain(
      "season_archive_versions_supersedes_same_season_fk",
    );
    expect(migration).toContain("season_archive_versions_one_successor_idx");
    expect(migration).toContain("season_archive_versions_season_version_key");
    expect(migration).toContain(
      "add column archive_schema_version integer not null default 1",
    );
    expect(migration).toContain(
      "add column version integer not null default 1",
    );
    expect(migration).toContain("archive_json ? 'schemaVersion'");
    expect(migration).not.toMatch(
      /(?:update|delete from) private\.season_archive_versions/i,
    );
    expect(migration).toContain("'schemaVersion', 2");
  });

  it("requires a complete one-card and one-matchup-per-member Week 18", () => {
    expect(migration).toContain(
      "Week 18 must contain exactly one card and matchup appearance per member.",
    );
    expect(migration).toContain("<> v_bracket.roster_size / 2");
    expect(migration).toContain("count(distinct participant.entry_id)");
  });

  it("extends the existing round authority to Week 18 and derives pairings", () => {
    expect(migration).toContain("check (nfl_week between 15 and 18)");
    expect(migration).toContain(
      "create or replace function private.build_phase8b_postseason_round",
    );
    expect(migration).toContain("private.build_phase8b_postseason_round");
    expect(migration).not.toMatch(/create table private\..*week18/i);
    expect(migration).not.toMatch(/p_(?:placements|pairings|champion)/i);
  });

  it("enforces the complete D-005 pre-seal freeze predicate transactionally", () => {
    expect(migration).toContain(
      "create or replace function private.is_week18_pairing_replaceable",
    );
    expect(migration).toContain("week.state in ('PLANNED', 'OPEN')");
    expect(migration).toContain("not private.is_week_card_sealed(week.id)");
    expect(migration).toContain("from private.position_receipts as receipt");
    expect(migration).toContain("from private.weekly_score_versions as score");
    expect(migration).toContain(
      "from private.matchup_result_versions as result",
    );
    expect(migration).toContain(
      "private.rebuild_week18_round_after_correction",
    );
    expect(migration).toContain(
      "Week 18 may be replaced only by an authorized Week 17 correction.",
    );
    expect(migration).toMatch(
      /where week\.id = v_current\.week_id\s+for update;[\s\S]*where card\.week_id = v_week18\.id[\s\S]*for update;[\s\S]*is_week18_pairing_replaceable\(v_current\.id\)/,
    );
    expect(migration).not.toMatch(
      /update private\.(?:matchups|playoff_round_publications|matchup_result_versions|position_receipts)/i,
    );
    expect(migration).not.toMatch(
      /delete from private\.(?:matchups|playoff_round_publications|matchup_result_versions|position_receipts)/i,
    );
  });

  it("keeps Week 18 outside competitive standings and advancement", () => {
    expect(migration).toContain(
      "v_week.nfl_week <> 18 and v_matchup_count > 0",
    );
    expect(migration).toContain("from regexp_matches(v_definition, v_pattern, 'gi')");
    expect(migration).toContain("'stageScope', 'EXHIBITION'");
    expect(migration).toContain("'role', 'EXHIBITION'");
    expect(migration).toContain("'advancingEntryId', case");
    expect(migration).toContain("matchup.postseason_role = 'CHAMPIONSHIP'");
  });

  it("publishes only through narrow commissioner commands and retains revoked Simulation endpoints", () => {
    for (const command of [
      "api.finalize_champion_bracket",
      "api.publish_week18_exhibition",
      "api.correct_finalized_week17_result",
      "api.finalize_season_archive",
      "api.get_season_archive",
    ]) {
      expect(migration).toContain(`function ${command}`);
    }
    expect(migration).toContain("Commissioner membership required.");
    expect(migration).toContain("return v_command.response_json");
    expect(migration).toMatch(
      /revoke all on function api\.publish_simulation_season_archive[\s\S]*from public, anon, authenticated/,
    );
    expect(migration).toMatch(
      /revoke all on function api\.get_simulation_season_archive[\s\S]*from public, anon, authenticated/,
    );
  });

  it("stores terminal bracket, Week 17, Week 18, archive, and correction provenance", () => {
    for (const evidence of [
      "terminal_bracket_publication_id",
      "terminal_w17_result_version_ids",
      "effective_w18_round_publication_id",
      "terminal_w18_result_version_ids",
      "archive_hash",
      "correction_id",
    ]) {
      expect(migration).toContain(evidence);
    }
    expect(migration).toContain("championLineage");
    expect(migration).toContain("qualification");
    expect(migration).toContain(
      "''postseasonRole'', v_matchup.postseason_role",
    );
    expect(migration).toContain("positionReceiptCount");
  });
});
