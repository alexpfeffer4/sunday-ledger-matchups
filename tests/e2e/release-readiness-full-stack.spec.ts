import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  inspectMemberSurface,
  measure,
} from "../fixtures/release-measurements";

const enabled = process.env.FULL_STACK_ACCEPTANCE === "1";
const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const database = process.env.TEST_SUPABASE_DB_URL;
const fixture = process.env.ODDS_TEST_FIXTURE;
if (enabled) {
  for (const value of [
    url,
    key,
    secret,
    database,
    fixture,
    process.env.RELEASE_QUERY_LOG,
  ])
    if (!value)
      throw new Error(
        "Release acceptance requires the complete disposable configuration.",
      );
  for (const value of [url!, database!])
    if (!["localhost", "127.0.0.1"].includes(new URL(value).hostname))
      throw new Error(
        "Release acceptance refuses a hosted database or Auth server.",
      );
}
test.skip(!enabled, "requires disposable full-stack acceptance");

function client(apiKey: string) {
  return createClient(url!, apiKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
async function rpc(
  api: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
) {
  const result = await api.schema("api").rpc(name, args);
  expect(result.error, `${name}: ${result.error?.message}`).toBeNull();
  return result.data;
}
function sql(statement: string) {
  return execFileSync(
    "psql",
    [database!, "-X", "-v", "ON_ERROR_STOP=1", "-At"],
    { input: statement, encoding: "utf8" },
  ).trim();
}

test("ten-member league: narrow keyboard journey, 20 picks, recovery, and measured reads", async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  const run = Date.now().toString(36);
  const admin = client(secret!);
  const members: SupabaseClient[] = [];
  const identities = [];
  for (let index = 0; index < 10; index++) {
    const identity = {
      email: `release-${run}-${index}@acceptance.test`,
      password: `Release-${run}-${index}-48!`,
    };
    expect(
      (await admin.auth.admin.createUser({ ...identity, email_confirm: true }))
        .error,
    ).toBeNull();
    const member = client(key!);
    expect((await member.auth.signInWithPassword(identity)).error).toBeNull();
    await rpc(member, "ensure_profile", {
      p_display_name: `Alexandria Montgomery ${index}`,
    });
    members.push(member);
    identities.push(identity);
  }
  const slug = `release-${run}`;
  const leagueName = "Long Named Sunday League Acceptance";
  const created = await rpc(members[0]!, "create_league", {
    p_name: leagueName,
    p_slug: slug,
    p_mode: "LIVE",
    p_nfl_year: 2026,
  });
  const leagueId = created[0].league_id as string;
  const revoked = await rpc(members[0]!, "create_league_invite_retry_safe", {
    p_league_id: leagueId,
    p_expires_in_days: 1,
    p_max_uses: 10,
    p_idempotency_key: `revoked-${run}`,
  });
  const listed = await rpc(members[0]!, "list_league_invites", {
    p_league_slug: slug,
  });
  const inviteId = listed[0].id as string;
  expect(
    (
      await members[1]!.schema("api").rpc("revoke_league_invite", {
        p_league_id: leagueId,
        p_invite_id: inviteId,
      })
    ).error,
  ).not.toBeNull();
  expect(
    await rpc(members[0]!, "revoke_league_invite", {
      p_league_id: leagueId,
      p_invite_id: inviteId,
    }),
  ).toBe(true);
  expect(
    await rpc(client(key!), "get_league_invite_preview", {
      p_token: revoked.token,
    }),
  ).toEqual([]);
  expect(
    (
      await members[1]!
        .schema("api")
        .rpc("join_league", { p_token: revoked.token })
    ).error,
  ).not.toBeNull();
  const invite = await rpc(members[0]!, "create_league_invite_retry_safe", {
    p_league_id: leagueId,
    p_expires_in_days: 1,
    p_max_uses: 10,
    p_idempotency_key: `invite-${run}`,
  });
  for (const member of members.slice(1))
    await rpc(member, "join_league", { p_token: invite.token });
  const sourceAt = new Date().toISOString();
  const kickoff = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
  const events = Array.from({ length: 7 }, (_, index) => {
    const awayTeam = `Metropolitan Visiting Football Club ${index + 1}`;
    const homeTeam = `Northwestern Home Football Club ${index + 1}`;
    return {
      source: "THE_ODDS_API",
      externalEventId: `release-game-${run}-${index}`,
      sportKey: "americanfootball_nfl",
      awayTeam,
      homeTeam,
      scheduledStartAt: kickoff,
      markets: [
        {
          marketType: "MONEYLINE",
          outcomeKey: "AWAY",
          proposition: `${awayTeam} to win`,
          lineMilli: null,
          americanOdds: -160,
        },
        {
          marketType: "MONEYLINE",
          outcomeKey: "HOME",
          proposition: `${homeTeam} to win`,
          lineMilli: null,
          americanOdds: 140,
        },
        {
          marketType: "SPREAD",
          outcomeKey: "AWAY",
          proposition: `${awayTeam} -3.5`,
          lineMilli: -3500,
          americanOdds: -110,
        },
        {
          marketType: "SPREAD",
          outcomeKey: "HOME",
          proposition: `${homeTeam} +3.5`,
          lineMilli: 3500,
          americanOdds: -110,
        },
        {
          marketType: "TOTAL",
          outcomeKey: "OVER",
          proposition: "Over 44.5",
          lineMilli: 44500,
          americanOdds: -110,
        },
        {
          marketType: "TOTAL",
          outcomeKey: "UNDER",
          proposition: "Under 44.5",
          lineMilli: 44500,
          americanOdds: -110,
        },
      ].map((market) => ({
        ...market,
        observedAt: sourceAt,
        sourceBook: "draftkings",
      })),
    };
  });
  const imported = { source: "THE_ODDS_API", fetchedAt: sourceAt, events };
  const stored = await rpc(members[0]!, "store_live_odds_import", {
    p_league_id: leagueId,
    p_import: imported,
    p_idempotency_key: `import-${run}`,
  });
  await rpc(members[0]!, "publish_live_week_slate", {
    p_league_id: leagueId,
    p_import_id: stored.importId,
    p_external_event_ids: events.map((event) => event.externalEventId),
    p_idempotency_key: `publish-${run}`,
  });
  sql(
    "update private.odds_refresh_policy set enabled=true,daily_credit_limit=300,monthly_credit_limit=1500,requests_remaining=1500,next_request_at='-infinity';",
  );
  const claim = await rpc(members[0]!, "claim_live_quote_refresh", {
    p_league_id: leagueId,
  });
  await rpc(admin, "complete_live_quote_refresh", {
    p_lease_id: claim.leaseId,
    p_import: imported,
    p_requests_remaining: 1497,
  });
  await rpc(members[0]!, "lock_live_roster_and_open_week", {
    p_league_id: leagueId,
    p_idempotency_key: `lock-${run}`,
  });
  writeFileSync(
    fixture!,
    JSON.stringify({
      payload: events.map((event) => ({
        id: event.externalEventId,
        sport_key: event.sportKey,
        commence_time: kickoff,
        away_team: event.awayTeam,
        home_team: event.homeTeam,
        bookmakers: [
          {
            key: "draftkings",
            last_update: sourceAt,
            markets: [
              {
                key: "h2h",
                last_update: sourceAt,
                outcomes: [
                  { name: event.awayTeam, price: -160 },
                  { name: event.homeTeam, price: 140 },
                ],
              },
              {
                key: "spreads",
                last_update: sourceAt,
                outcomes: [
                  { name: event.awayTeam, price: -110, point: -3.5 },
                  { name: event.homeTeam, price: -110, point: 3.5 },
                ],
              },
              {
                key: "totals",
                last_update: sourceAt,
                outcomes: [
                  { name: "Over", price: -110, point: 44.5 },
                  { name: "Under", price: -110, point: 44.5 },
                ],
              },
            ],
          },
        ],
      })),
    }),
  );
  writeFileSync(`${fixture}.calls`, "");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `/auth/sign-in?next=${encodeURIComponent(`/l/${slug}/matchup`)}`,
  );
  await page.getByLabel("Email address").fill(identities[1]!.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(identities[1]!.password);
  await page.getByRole("button", { name: "Sign in with password" }).click();
  await page.waitForURL(`**/l/${slug}/matchup`);
  await measure(info, "mobile-navigation-to-usable-slate", async () => {
    await page
      .getByRole("link", { name: "Make picks", exact: true })
      .last()
      .click();
    await expect(
      page
        .locator(".outcome-selector-group")
        .first()
        .getByRole("button")
        .first(),
    ).toBeEnabled();
    await page
      .locator(".outcome-selector-group")
      .first()
      .getByRole("button")
      .first()
      .click();
    await expect(page.getByLabel("Stake in credits")).toBeEditable();
  });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 320, height: 800 });
  await page.locator("html").evaluate((element) => {
    element.style.fontSize = "200%";
  });
  const groups = page
    .locator("main .outcome-selector-group")
    .filter({ hasNot: page.locator("dialog") });
  // A real 20-pick card, one side of each distinct event/market. No draft injection.
  for (let index = 0; index < 20; index++) {
    const outcome = groups.nth(index).getByRole("button").first();
    await outcome.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading")).toBeFocused();
    if (index === 0) {
      await page.getByLabel("Stake in credits").fill("49");
      await page.getByRole("button", { name: "Add to card" }).click();
      await expect(page.getByLabel("Stake in credits")).toBeFocused();
      await expect(page.getByLabel("Stake in credits")).toHaveValue("49");
      await inspectMemberSurface(page, info, "pick-editor-320-200-percent");
      const close = await page
        .getByRole("button", { name: "Close pick editor" })
        .boundingBox();
      expect(close?.width).toBeGreaterThanOrEqual(44);
      expect(close?.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByLabel("Stake in credits").fill("50");
    await page.getByRole("button", { name: "Add to card" }).click();
    await expect(dialog).not.toBeVisible();
  }
  expect(readFileSync(`${fixture}.calls`, "utf8")).toBe("");
  await page.getByRole("button", { name: "Review 20 picks" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Review your complete card" }),
  ).toBeFocused();
  await expect(page.getByRole("article", { name: /^Pick \d+:/ })).toHaveCount(
    20,
  );
  await inspectMemberSurface(page, info, "twenty-pick-review-320-200-percent");
  // Accessibility inspection may consume the 30-second review window. Refresh
  // legitimately before acceptance rather than disabling its enforcement.
  const check = page.getByRole("button", { name: /Check current odds/ });
  if (await check.count()) await check.click();
  await measure(info, "twenty-pick-seal-to-receipt", async () => {
    await page.getByRole("button", { name: "Confirm and seal card" }).click();
    await expect(
      page.getByRole("heading", { name: "All 1,000 credits are sealed" }),
    ).toBeVisible();
  });
  const state = await rpc(members[1]!, "get_stage1_state", {
    p_league_slug: slug,
  });
  expect(state.ownerCard.positions).toHaveLength(20);
  expect(state.matchup.opponentRevealedPositions).toEqual([]);
  expect(
    (
      await members[0]!.schema("api").rpc("delete_empty_draft_league", {
        p_league_slug: slug,
        p_confirmation_name: leagueName,
      })
    ).error?.code,
  ).toBe("55000");
  const afterDeniedDelete = await rpc(members[1]!, "get_stage1_state", {
    p_league_slug: slug,
  });
  expect(afterDeniedDelete.ownerCard.positions).toEqual(
    state.ownerCard.positions,
  );
  await page.goto(`/l/${slug}/card`);
  await expect(
    page.getByRole("link", { name: "View receipt", exact: true }),
  ).toHaveCount(20);
  await inspectMemberSurface(page, info, "twenty-receipts-320-200-percent");
  for (const destination of ["standings", "playoffs"]) {
    await page.goto(`/l/${slug}/${destination}`);
    await inspectMemberSurface(page, info, `${destination}-320-200-percent`);
  }
  // Query count is actual server PostgREST requests, not inferred from HTTP 200.
  await measure(info, "ten-member-matchup-read", async () => {
    await page.goto(`/l/${slug}/matchup`);
    await expect(
      page.getByRole("heading", { name: "Card sealed" }),
    ).toBeVisible();
  });
  const callsBefore = readFileSync(`${fixture}.calls`, "utf8");
  const refresh = page.getByRole("button", { name: "Refresh matchup" });
  await measure(info, "ten-member-matchup-refresh", async () => {
    const response = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/l/${slug}/matchup` &&
        response.request().headers()["rsc"] === "1",
    );
    await refresh.click();
    await response;
    await expect(refresh).toHaveAttribute("aria-disabled", "false");
    await expect(refresh).toBeFocused();
  });
  expect(readFileSync(`${fixture}.calls`, "utf8")).toBe(callsBefore);
});
