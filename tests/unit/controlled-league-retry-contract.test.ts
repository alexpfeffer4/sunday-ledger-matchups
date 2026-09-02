import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const actions = readFileSync(
  resolve("src/app/l/[leagueSlug]/actions.ts"),
  "utf8",
);
const migration = readFileSync(
  resolve(
    "supabase/migrations/20260902180000_controlled_league_reliability.sql",
  ),
  "utf8",
);
const liveControls = readFileSync(
  resolve("src/components/commissioner/live-week-controls.tsx"),
  "utf8",
);
const stage1Controls = readFileSync(
  resolve("src/components/commissioner/stage1-controls.tsx"),
  "utf8",
);

describe("controlled-league retry contract", () => {
  it("uses durable logical intent rather than invocation randomness", () => {
    expect(actions).not.toMatch(/randomUUID|command:\$\{/);
    expect(actions).toContain("stableOperationKey");
    expect(actions).toContain("get_my_command_receipt");
    expect(actions).toContain("Already completed.");
  });

  it("reconciles every consequential lifecycle command by its stored name", () => {
    for (const command of [
      "ACCEPT_STAGE1_CARD",
      "STORE_LIVE_ODDS_IMPORT",
      "PUBLISH_LIVE_WEEK_SLATE",
      "PUBLISH_NEXT_LIVE_WEEK_SLATE",
      "PUBLISH_PLAYOFF_QUALIFICATION",
      "PUBLISH_POSTSEASON_WEEK",
      "FINALIZE_CHAMPION_BRACKET",
      "FINALIZE_SEASON_ARCHIVE",
      "REFRESH_LIVE_WEEK_QUOTES",
      "LOCK_LIVE_ROSTER_AND_OPEN_WEEK",
      "IMPORT_LIVE_SCORES",
      "RECORD_STAGE1_RESULT",
      "CORRECT_FINALIZED_WEEK17_RESULT",
      "ADVANCE_STAGE1_CLOCK",
      "PUBLISH_SIMULATION_FIXTURE_WEEK",
      "APPLY_SIMULATION_FIXTURE_RESULTS",
      "SET_STAGE1_EVENT_LIVE",
      "LOCK_STAGE1_WEEK",
      "FINALIZE_STAGE1_WEEK",
    ]) {
      expect(actions, command).toContain(`"${command}"`);
    }
  });

  it("keeps invitation recovery atomic and caller-scoped", () => {
    expect(actions).toContain("create_league_invite_retry_safe");
    expect(actions).toContain("z.iso.datetime({ offset: true })");
    expect(stage1Controls).toContain("inviteState.value");
    expect(migration).toContain("command.actor_user_id = v_user_id");
    expect(migration).toContain("'CREATE_LEAGUE_INVITE'");
    expect(migration).toContain(
      "Idempotency key was reused with a different request.",
    );
    expect(migration).toMatch(
      /revoke all on function private\.recompute_stage1_week\(uuid, uuid\)[\s\S]*from public, anon, authenticated/,
    );
  });

  it("rotates correction intent only after a successful authoritative result", () => {
    expect(actions).toContain("intentId: correction.data.operationId");
    expect(liveControls).toContain("correction-operation:v1");
    expect(liveControls).toContain("correctionState.value");
    expect(liveControls).toContain('name="operationId"');
  });
});
