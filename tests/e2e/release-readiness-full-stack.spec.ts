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
test.use({ actionTimeout: 15_000 });

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
  baseURL,
  page,
}, info) => {
  if (
    !baseURL ||
    !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)
  ) {
    throw new Error("Release acceptance refuses a hosted application.");
  }
  test.setTimeout(240_000);
  const run = Date.now().toString(36);
  const admin = client(secret!);
  const members: SupabaseClient[] = [];
  const identities: Array<{ email: string; password: string }> = [];
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
    p_import: { ...imported, fetchedAt: new Date().toISOString() },
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
  await expect(page.getByRole("group", { name: /card status$/ })).toContainText(
    "Not sealed",
  );
  const initialMemberState = await rpc(members[1]!, "get_stage1_state", {
    p_league_slug: slug,
  });
  const opponentEmail = sql(
    `select u.email from private.season_entries e join auth.users u on u.id=e.user_id where e.id='${initialMemberState.matchup.opponentEntryId}'::uuid`,
  );
  const opponentIdentity = identities.find(
    (identity) => identity.email === opponentEmail,
  )!;
  const opponent = client(key!);
  expect(
    (await opponent.auth.signInWithPassword(opponentIdentity)).error,
  ).toBeNull();
  const initialOpponentState = await rpc(opponent, "get_stage1_state", {
    p_league_slug: slug,
  });
  expect(initialOpponentState.matchup.opponentSealed).toBe(false);
  expect(initialOpponentState.matchup.opponentReadiness).toBeNull();
  expect(initialOpponentState.matchup.opponentRevealedPositions).toEqual([]);
  const makePicks = page
    .getByRole("link", { name: "Make picks", exact: true })
    .last();
  await expect(makePicks).toBeVisible();
  await measure(info, "mobile-navigation-to-usable-slate", async () => {
    await makePicks.click();
    await expect(
      page
        .locator(".outcome-selector-group")
        .first()
        .getByRole("button")
        .first(),
    ).toBeEnabled();
    await page.evaluate(() => window.scrollTo(0, 0));
    const firstMarket = await page
      .locator("main .outcome-selector-group")
      .first()
      .boundingBox();
    const navigation = await page
      .getByRole("navigation", { name: "Mobile league navigation" })
      .boundingBox();
    expect(
      firstMarket!.y + firstMarket!.height,
      "One complete market fits above navigation on the first 390px view",
    ).toBeLessThanOrEqual(navigation!.y);
    await page
      .locator(".outcome-selector-group")
      .first()
      .getByRole("button")
      .first()
      .click();
    await expect(page.getByLabel("Stake in credits")).toBeEditable();
  });
  await page.keyboard.press("Escape");
  const filterTargets = await page
    .getByRole("navigation", { name: "Filter games by kickoff" })
    .getByRole("button")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          name: element.textContent,
          width: rect.width,
          height: rect.height,
        };
      }),
    );
  await info.attach("slate-filter-targets-390", {
    body: JSON.stringify(filterTargets),
    contentType: "application/json",
  });
  for (const target of filterTargets)
    expect(target.height).toBeGreaterThanOrEqual(44);
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
      await expect(page.getByLabel("Stake in credits")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await expect(dialog.getByRole("alert")).toBeVisible();
      await expect(
        dialog.getByRole("group", { name: "Return if this pick wins" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Add to card" }).click();
      await expect(page.getByLabel("Stake in credits")).toBeFocused();
      await inspectMemberSurface(page, info, "pick-editor-320-200-percent");
      const close = await page
        .getByRole("button", { name: "Close pick editor" })
        .boundingBox();
      expect(close?.width).toBeGreaterThanOrEqual(44);
      expect(close?.height).toBeGreaterThanOrEqual(44);
      expect(close!.x).toBeGreaterThanOrEqual(0);
      expect(close!.y).toBeGreaterThanOrEqual(0);
      expect(close!.x + close!.width).toBeLessThanOrEqual(320);
      expect(close!.y + close!.height).toBeLessThanOrEqual(800);
      await page
        .getByRole("button", { name: "Close pick editor" })
        .click({ timeout: 10_000 });
      await expect(outcome).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(dialog).toBeVisible();
    }
    await page.getByLabel("Stake in credits").fill("50");
    await expect(page.getByLabel("Stake in credits")).toHaveValue("50");
    await page.getByRole("button", { name: "Add to card" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("region", { name: "Working card" }),
    ).toContainText(`${((index + 1) * 50).toLocaleString("en-US")} allocated`);
    if (index === 0) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator("html").evaluate((element) => {
        element.style.fontSize = "100%";
      });
      await page.evaluate(() => window.scrollTo(0, 0));
      const market = await groups.first().boundingBox();
      const tray = await page
        .getByRole("region", { name: "Working card" })
        .boundingBox();
      expect(
        market!.y + market!.height,
        "A complete first market stays above the tray with a partial draft",
      ).toBeLessThanOrEqual(tray!.y);
      await page.screenshot({
        path: info.outputPath("partial-draft-first-view-390.png"),
      });
      await page.setViewportSize({ width: 320, height: 800 });
      await page.locator("html").evaluate((element) => {
        element.style.fontSize = "200%";
      });
    }
  }
  expect(readFileSync(`${fixture}.calls`, "utf8")).toBe("");
  expect(
    (await rpc(opponent, "get_stage1_state", { p_league_slug: slug })).matchup,
  ).toEqual(initialOpponentState.matchup);
  const reviewButton = page
    .getByRole("button", { name: "Review 20 picks" })
    .first();
  await reviewButton.scrollIntoViewIfNeeded();
  await inspectMemberSurface(page, info, "twenty-pick-builder-320-200-percent");
  await reviewButton.click({ timeout: 10_000 });
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
  const sealedOpponentState = await rpc(opponent, "get_stage1_state", {
    p_league_slug: slug,
  });
  expect(sealedOpponentState.matchup.opponentSealed).toBe(true);
  expect({ ...sealedOpponentState.matchup, opponentSealed: false }).toEqual(
    initialOpponentState.matchup,
  );
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
  await page.locator("html").evaluate((element) => {
    element.style.fontSize = "200%";
  });
  await expect(
    page.getByRole("link", { name: "View receipt", exact: true }),
  ).toHaveCount(20);
  await inspectMemberSurface(page, info, "twenty-receipts-320-200-percent");
  for (const destination of ["standings", "playoffs"]) {
    await page.goto(`/l/${slug}/${destination}`);
    await expect(
      page.getByRole("heading", {
        name: destination === "standings" ? "Standings" : "The playoff race",
        exact: true,
      }),
    ).toBeVisible();
    await page.locator("html").evaluate((element) => {
      element.style.fontSize = "200%";
    });
    await inspectMemberSurface(page, info, `${destination}-320-200-percent`);
  }
  // Query count is actual server PostgREST requests, not inferred from HTTP 200.
  await page.setViewportSize({ width: 390, height: 844 });
  await measure(info, "ten-member-matchup-read", async () => {
    await page.goto(`/l/${slug}/matchup`);
    await expect(
      page.getByRole("heading", { name: "Card sealed" }),
    ).toBeVisible();
  });
  // An independently authenticated opponent sees only the submission fact in
  // the real RSC route, and pregame refresh does not contact the provider.
  const opponentContext = await page
    .context()
    .browser()!
    .newContext({ viewport: { width: 390, height: 844 } });
  try {
    const opponentPage = await opponentContext.newPage();
    await opponentPage.goto(
      `${baseURL}/auth/sign-in?next=${encodeURIComponent(`/l/${slug}/matchup`)}`,
    );
    await opponentPage.getByLabel("Email address").fill(opponentIdentity.email);
    await opponentPage
      .getByLabel("Password", { exact: true })
      .fill(opponentIdentity.password);
    await opponentPage
      .getByRole("button", { name: "Sign in with password" })
      .click();
    await opponentPage.waitForURL(`**/l/${slug}/matchup`);
    const opponentBadge = opponentPage.getByLabel(
      `${state.viewer.displayName} card status`,
    );
    await expect(opponentBadge).toContainText("Sealed");
    await expect(
      opponentPage.getByRole("heading", { name: "Picks by game" }),
    ).toHaveCount(0);
    const beforeRefreshCalls = readFileSync(`${fixture}.calls`, "utf8");
    // Capture before fulfillment, as in the rehearsal privacy lane. Chromium
    // can discard a streamed navigation body before Response.text() reads it.
    let rsc: string | null = null;
    const refreshRoute = `**/l/${slug}/matchup*`;
    await opponentPage.route(refreshRoute, async (route) => {
      if (route.request().headers()["rsc"] !== "1") {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      rsc = await response.text();
      await route.fulfill({ response });
    });
    const refreshed = opponentPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/l/${slug}/matchup` &&
        response.request().headers()["rsc"] === "1",
    );
    await opponentPage.getByRole("button", { name: "Refresh matchup" }).click();
    await refreshed;
    await opponentPage.unroute(refreshRoute);
    expect(readFileSync(`${fixture}.calls`, "utf8")).toBe(beforeRefreshCalls);
    expect(rsc).not.toBeNull();
    expect(rsc).toContain("Sealed");
    for (const position of state.ownerCard.positions) {
      expect(rsc).not.toContain(position.id);
      expect(rsc).not.toContain(position.receiptHash);
    }
    await expect(opponentBadge).toContainText("Sealed");
  } finally {
    await opponentContext.close();
  }
  // Advance only this loopback fixture's event times, then use the real lock RPC.
  expect(leagueId).toMatch(/^[0-9a-f-]{36}$/);
  sql(`update private.season_weeks set opens_at=clock_timestamp()-interval '6 hours',common_lock_at=clock_timestamp()-interval '65 minutes' where league_id='${leagueId}';
    update private.sports_events set scheduled_start_at=clock_timestamp()-interval '1 hour' where league_id='${leagueId}';`);
  await rpc(members[0]!, "lock_stage1_week", {
    p_league_id: leagueId,
    p_idempotency_key: `release-lock-${run}`,
  });
  await page.reload();
  const callsBefore = readFileSync(`${fixture}.calls`, "utf8");
  const refresh = page.getByRole("button", { name: "Refresh matchup" });
  await expect(refresh).toBeVisible();
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
  // A third member browses the sealed owner's pairing through the actual route.
  // Only disposable stored event evidence changes; no production/provider call.
  const observerIdentity = identities.find(
    (identity) => identity !== identities[1] && identity !== opponentIdentity,
  )!;
  const observer = client(key!);
  expect(
    (await observer.auth.signInWithPassword(observerIdentity)).error,
  ).toBeNull();
  const observerState = await rpc(observer, "get_stage1_state", {
    p_league_slug: slug,
  });
  const target = observerState.schedule.find(
    (game: { sideAEntryId: string; sideBEntryId: string }) =>
      [game.sideAEntryId, game.sideBEntryId].includes(state.viewer.entryId),
  );
  expect(target.id).not.toBe(observerState.matchup.id);
  const observerContext = await page
    .context()
    .browser()!
    .newContext({ viewport: { width: 390, height: 844 } });
  try {
    const observerPage = await observerContext.newPage();
    await observerPage.goto(
      `${baseURL}/auth/sign-in?next=${encodeURIComponent(`/l/${slug}/matchup`)}`,
    );
    await observerPage.getByLabel("Email address").fill(observerIdentity.email);
    await observerPage
      .getByLabel("Password", { exact: true })
      .fill(observerIdentity.password);
    await observerPage
      .getByRole("button", { name: "Sign in with password" })
      .click();
    await observerPage.waitForURL(`**/l/${slug}/matchup`);
    await observerPage
      .getByRole("link", {
        name: `View ${target.sideAName} versus ${target.sideBName}`,
      })
      .click();
    await expect(observerPage).toHaveURL(
      new RegExp(`matchup\\?matchup=${target.id}$`),
    );
    const targetHeader = observerPage.getByRole("region", {
      name: `${target.sideAName} versus ${target.sideBName}`,
    });
    await expect(targetHeader).toBeVisible();
    await expect(observerPage.locator("[data-position-id]")).toHaveCount(0);
    let response = await observerPage.request.get(observerPage.url());
    let body = await response.text();
    for (const position of state.ownerCard.positions)
      expect(body).not.toContain(position.id);
    const revealedEvent = state.ownerCard.positions[0].eventId;
    expect(revealedEvent).toMatch(/^[0-9a-f-]{36}$/);
    sql(
      `update private.sports_events set state='LIVE',actual_started_at=clock_timestamp()-interval '1 minute' where id='${revealedEvent}' and league_id='${leagueId}';`,
    );
    await observerPage.reload();
    const visible = state.ownerCard.positions.filter(
      (position: { eventId: string }) => position.eventId === revealedEvent,
    );
    const hidden = state.ownerCard.positions.filter(
      (position: { eventId: string }) => position.eventId !== revealedEvent,
    );
    expect(visible.length).toBeGreaterThan(0);
    expect(hidden.length).toBeGreaterThan(0);
    await expect(observerPage.locator("[data-position-id]")).toHaveCount(
      visible.length,
    );
    response = await observerPage.request.get(observerPage.url());
    body = await response.text();
    for (const position of hidden) {
      expect(body).not.toContain(position.id);
      expect(body).not.toContain(position.receiptHash);
    }
    const revealedCards = await rpc(observer, "get_league_matchup_cards", {
      p_league_slug: slug,
      p_week_id: state.week.id,
    });
    const publicCard = revealedCards.cards.find(
      (card: { entryId: string }) => card.entryId === state.viewer.entryId,
    );
    expect(publicCard.positions).toHaveLength(visible.length);
    expect(publicCard.scoreCenticredits).toBe(0);
    await observerPage.setViewportSize({ width: 320, height: 800 });
    await observerPage.locator("html").evaluate((element) => {
      element.style.fontSize = "200%";
    });
    await inspectMemberSurface(
      observerPage,
      info,
      "other-matchup-partial-reveal-320-200-percent",
    );
    await observerPage.screenshot({
      path: info.outputPath("other-matchup-partial-reveal.png"),
      fullPage: true,
    });
    await observerPage
      .getByRole("link", { name: "Back to your matchup" })
      .click();
    await expect(observerPage).toHaveURL(`${baseURL}/l/${slug}/matchup`);
    await expect(
      observerPage.getByRole("link", { name: "Back to your matchup" }),
    ).toHaveCount(0);
    expect(readFileSync(`${fixture}.calls`, "utf8")).toBe(callsBefore);
  } finally {
    await observerContext.close();
  }
});
