import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260903004908_owner_guided_rehearsal.sql",
  ),
  "utf8",
);

function functionBody(name: string): string {
  const start = migration.indexOf(`create or replace function ${name}`);
  if (start < 0) throw new Error(`Missing ${name}`);
  const bodyStart = migration.indexOf("as $$", start);
  const bodyEnd = migration.indexOf("$$;", bodyStart + 5);
  return migration.slice(bodyStart, bodyEnd);
}

describe("Owner Guided Rehearsal migration contract", () => {
  it("uses a private entitlement and strong rehearsal identity", () => {
    expect(migration).toMatch(
      /create table private\.owner_rehearsal_entitlements/,
    );
    expect(migration).toMatch(
      /create unique index owner_rehearsals_one_active_per_owner_idx[\s\S]*where status = 'ACTIVE'/,
    );
    expect(migration).toMatch(
      /alter table private\.owner_rehearsals enable row level security/,
    );
    expect(migration).toMatch(
      /revoke all on table private\.owner_rehearsals from public, anon, authenticated/,
    );
    expect(migration).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
  });

  it("keeps rehearsal discovery out of the ordinary league view", () => {
    expect(migration).toMatch(
      /create or replace view api\.my_leagues[\s\S]*not exists \([\s\S]*private\.owner_rehearsals/,
    );
    expect(functionBody("api.get_owner_rehearsal")).toMatch(
      /owner_rehearsal_entitled\(v_user_id\)/,
    );

    const authoritativeQuery = readFileSync(
      resolve(
        process.cwd(),
        "src/application/queries/get-live-stage1-league.ts",
      ),
      "utf8",
    );
    expect(authoritativeQuery).toMatch(
      /state\.league\.mode === "SIMULATION"[\s\S]*getOwnerRehearsalForLeague\(leagueSlug\)[\s\S]*return state/,
    );
  });

  it("does not accept caller-selected league, clock, score, or winner inputs", () => {
    for (const name of [
      "api.start_owner_rehearsal",
      "api.fill_owner_rehearsal_bots",
      "api.use_owner_rehearsal_sample_card",
      "api.advance_owner_rehearsal",
      "api.reset_owner_rehearsal",
    ]) {
      const declaration = migration.slice(
        migration.indexOf(`create or replace function ${name}`),
        migration.indexOf("returns", migration.indexOf(name)),
      );
      expect(declaration).not.toMatch(/p_league_id|p_score|p_winner|p_target/);
    }
  });

  it("orchestrates the authoritative lifecycle instead of writing outcomes", () => {
    const advance = functionBody("api.advance_owner_rehearsal");
    expect(advance).toMatch(/owner_rehearsal_open_week/);
    expect(advance).toMatch(/owner_rehearsal_settle_current_week/);
    expect(advance).toMatch(/api\.publish_playoff_qualification/);
    expect(advance).toMatch(/api\.finalize_champion_bracket/);
    expect(advance).toMatch(/api\.finalize_season_archive/);
    expect(advance).not.toMatch(
      /insert into private\.(position_receipts|event_result_versions|matchup_result_versions|standings_snapshots|playoff_publications|season_archive_versions)/,
    );
  });

  it("creates credentialless bots and prevents public impersonation", () => {
    const fill = functionBody("api.fill_owner_rehearsal_bots");
    expect(fill).toMatch(/insert into auth\.users \(id\)/);
    expect(fill).not.toMatch(/email|password|identity_data|provider/);
    expect(migration).toMatch(
      /owner_rehearsal_bot_identity_guard[\s\S]*auth\.identities/,
    );
    expect(migration).toMatch(
      /revoke all on function private\.accept_authoritative_card_for_actor[\s\S]*public, anon, authenticated/,
    );
  });

  it("guards reset, invitations, provider mode, time, and immutable evidence", () => {
    expect(functionBody("api.reset_owner_rehearsal")).toMatch(
      /owner_user_id = v_user_id and rehearsal\.status = 'ACTIVE'/,
    );
    expect(migration).toMatch(/Owner rehearsals do not send invitations/);
    expect(migration).toMatch(/season\.mode = 'SIMULATION'/);
    expect(migration).toMatch(/private\.owner_rehearsal_manifest_time/);
    expect(migration).toMatch(/owner_rehearsal_events_append_only/);
    expect(migration).toMatch(/owner_rehearsal_card_choices_append_only/);
  });

  it("never grants owner commands to anonymous callers", () => {
    for (const name of [
      "advance_owner_rehearsal",
      "fill_owner_rehearsal_bots",
      "get_owner_rehearsal",
      "prepare_owner_rehearsal_quote_review",
      "reset_owner_rehearsal",
      "start_owner_rehearsal",
      "use_owner_rehearsal_sample_card",
    ]) {
      expect(migration).not.toMatch(
        new RegExp(`grant execute on function api\\.${name}[^;]+to anon`, "s"),
      );
    }
  });

  it("keeps provider, email, and privileged configuration out of owner code", () => {
    const actionSource = readFileSync(
      resolve(process.cwd(), "src/app/owner/rehearsal/actions.ts"),
      "utf8",
    );
    const guideSource = readFileSync(
      resolve(
        process.cwd(),
        "src/components/rehearsal/owner-rehearsal-guide.tsx",
      ),
      "utf8",
    );
    const clientSurface = `${actionSource}\n${guideSource}`;
    expect(clientSurface).not.toMatch(
      /fetchNflOdds|fetchNflScores|OddsProvider|sendEmail|serviceRole|SERVICE_ROLE/,
    );
    expect(clientSurface).not.toMatch(/NEXT_PUBLIC_[A-Z_]*OWNER/);
  });
});
