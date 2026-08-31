import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    "supabase/migrations/20260831212703_phase8c_authoritative_same_lifecycle_simulation.sql",
  ),
  "utf8",
);
const actions = readFileSync(
  resolve("src/app/l/[leagueSlug]/actions.ts"),
  "utf8",
);
const exampleAdapter = readFileSync(
  resolve("src/adapters/example/example-season.ts"),
  "utf8",
);

describe("Phase 8C migration and application contract", () => {
  it("stores one private immutable reviewed fixture manifest", () => {
    expect(migration).toContain(
      "create table private.simulation_fixture_manifests",
    );
    expect(migration).toContain(
      "week_count integer not null check (week_count = 18)",
    );
    expect(migration).toContain("simulation_fixture_manifests_append_only");
    expect(migration).toMatch(
      /revoke all on table private\.simulation_fixture_manifests\s+from public, anon, authenticated/,
    );
    expect(migration).not.toMatch(
      /grant (?:select|insert|update|delete|all).*simulation_fixture_manifests/i,
    );
  });

  it("exposes only pack, week, step, clock, and idempotency selectors", () => {
    expect(migration).toContain(
      "function api.publish_simulation_fixture_week(\n  p_league_id uuid,\n  p_week integer,\n  p_pack_id text,\n  p_idempotency_key text",
    );
    expect(migration).toContain(
      "function api.apply_simulation_fixture_results(\n  p_league_id uuid,\n  p_week integer,\n  p_step text,\n  p_pack_id text,\n  p_idempotency_key text",
    );
    expect(migration).not.toMatch(
      /p_(?:fixture|result|payload|archive)\w*\s+jsonb/i,
    );
    expect(migration).not.toMatch(
      /p_(?:teams|odds|scores|cards|winners|standings|brackets|archives)/i,
    );
  });

  it("reuses the existing week, result, postseason, champion, and archive authorities", () => {
    for (const authority of [
      "api.publish_live_week_slate",
      "api.publish_next_live_week_slate",
      "api.lock_live_roster_and_open_week",
      "api.record_stage1_result",
      "api.publish_playoff_qualification",
      "api.publish_postseason_week",
      "api.finalize_champion_bracket",
      "api.publish_week18_exhibition",
      "api.finalize_season_archive",
      "private.build_season_archive_v2",
    ]) {
      expect(migration).toContain(authority);
    }
    expect(migration).not.toMatch(
      /create table private\.(?:simulation_(?:cards|standings|brackets|archives)|simulation_season_archive_versions)/,
    );
  });

  it("enforces provider and result source isolation in both directions", () => {
    expect(migration).toContain(
      "check (source in ('THE_ODDS_API', 'SIMULATION_FIXTURE'))",
    );
    expect(migration).toContain("assert_provider_source_matches_mode");
    expect(migration).toContain("assert_result_source_matches_mode");
    expect(migration).toContain(
      "Provider source does not match the frozen season mode.",
    );
    expect(migration).toContain(
      "Result source does not match the frozen season mode.",
    );
    expect(migration).toContain(
      "Simulation results must match the reviewed fixture manifest.",
    );
  });

  it("keeps time monotonic and operationally inert", () => {
    expect(migration).toContain("api.advance_stage1_clock");
    expect(migration).toContain("api.advance_simulated_time");
    const wrapper = migration.slice(
      migration.indexOf(
        "create or replace function api.advance_simulated_time",
      ),
      migration.indexOf(
        "create or replace function api.publish_simulation_fixture_week",
      ),
    );
    expect(wrapper).not.toMatch(
      /insert into private\.(?:event_result_versions|weekly_score_versions|standings_snapshots|playoff_publications|season_archive_versions)/,
    );
  });

  it("retains the frozen legacy archive storage while denying its RPCs", () => {
    expect(migration).toMatch(
      /revoke all on function api\.publish_simulation_season_archive\(uuid, jsonb, text\)\s+from public, anon, authenticated/,
    );
    expect(migration).toMatch(
      /revoke all on function api\.get_simulation_season_archive\(text\)\s+from public, anon, authenticated/,
    );
    expect(migration).toMatch(
      /revoke all on table private\.simulation_season_archives\s+from public, anon, authenticated/,
    );
    expect(migration).not.toMatch(
      /(?:update|delete from) private\.simulation_season_archives/i,
    );
  });

  it("removes the coarse simulator from application and test execution", () => {
    expect(exampleAdapter).toContain("example-season.fixture.json");
    expect(exampleAdapter).not.toContain("simulateSeason");
    expect(actions).not.toContain("publishSimulationSeasonArchiveAction");
    expect(actions).toContain("publishSimulationFixtureWeekAction");
    expect(actions).toContain("applySimulationFixtureResultsAction");
  });
});
