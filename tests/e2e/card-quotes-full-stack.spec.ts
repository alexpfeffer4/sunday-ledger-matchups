import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const database = process.env.TEST_SUPABASE_DB_URL;
const fixturePath = process.env.ODDS_TEST_FIXTURE;
const enabled = process.env.FULL_STACK_ACCEPTANCE === "1";
if (enabled && (!url || !key || !secret || !database || !fixturePath)) {
  throw new Error(
    "Quote acceptance requires the complete disposable database/provider configuration.",
  );
}
test.skip(!enabled, "requires the disposable full-stack acceptance lane");

async function rpc(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
) {
  const result = await client.schema("api").rpc(name, args);
  expect(result.error, `${name}: ${result.error?.message}`).toBeNull();
  return result.data;
}
function client(apiKey: string) {
  return createClient(url!, apiKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
function sql(statement: string) {
  return execFileSync(
    "psql",
    [database!, "-X", "-v", "ON_ERROR_STOP=1", "-At"],
    { input: statement, encoding: "utf8" },
  ).trim();
}
function expireRefresh(leagueId: string) {
  expect(leagueId).toMatch(/^[0-9a-f-]{36}$/);
  sql(
    `update private.live_quote_refreshes set attempted_at=clock_timestamp()-interval '2 minutes', fetched_at=clock_timestamp()-interval '2 minutes' where week_id in (select id from private.season_weeks where league_id='${leagueId}'); update private.odds_refresh_policy set next_request_at='-infinity';`,
  );
}
async function buildCard(
  page: Page,
  slug: string,
  identity: { email: string; password: string },
) {
  await page.goto(
    `/auth/sign-in?next=${encodeURIComponent(`/l/${slug}/slate`)}`,
  );
  await page.getByLabel("Email address").fill(identity.email);
  await page.getByLabel("Password", { exact: true }).fill(identity.password);
  await page.getByRole("button", { name: "Sign in with password" }).click();
  await page.waitForURL(`**/l/${slug}/slate`);
  await page
    .locator(".outcome-selector-group")
    .first()
    .getByRole("button", { name: /New York Jets/ })
    .click();
  await page.getByLabel("Stake in credits").fill("1000");
  await page.getByRole("button", { name: "Add to card" }).click();
}

test("members refresh, review, seal, and recover through real Auth and database", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const run = Date.now().toString(36);
  const admin = client(secret!);
  const identities = [];
  const members: SupabaseClient[] = [];
  for (let i = 0; i < 4; i++) {
    const identity = {
      email: `quote-${run}-${i}@acceptance.test`,
      password: `Quote-${run}-${i}-48!`,
    };
    const created = await admin.auth.admin.createUser({
      ...identity,
      email_confirm: true,
    });
    expect(created.error).toBeNull();
    const member = client(key!);
    expect((await member.auth.signInWithPassword(identity)).error).toBeNull();
    await rpc(member, "ensure_profile", {
      p_display_name: `Quote Member ${i}`,
    });
    identities.push(identity);
    members.push(member);
  }
  const slug = `quote-${run}`;
  const created = await rpc(members[0]!, "create_league", {
    p_name: "Quote Acceptance",
    p_slug: slug,
    p_mode: "LIVE",
    p_nfl_year: 2026,
  });
  const leagueId: string = created[0].league_id;
  const invite = await rpc(members[0]!, "create_league_invite_retry_safe", {
    p_league_id: leagueId,
    p_expires_in_days: 1,
    p_max_uses: 4,
    p_idempotency_key: `quote-invite-${run}`,
  });
  for (const member of members.slice(1))
    await rpc(member, "join_league", { p_token: invite.token });
  const sourceAt = new Date(Date.now() - 5 * 60_000).toISOString();
  const kickoff = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
  const markets = [
    {
      marketType: "MONEYLINE",
      outcomeKey: "AWAY",
      proposition: "Buffalo Bills to win",
      lineMilli: null,
      americanOdds: -160,
    },
    {
      marketType: "MONEYLINE",
      outcomeKey: "HOME",
      proposition: "New York Jets to win",
      lineMilli: null,
      americanOdds: 140,
    },
    {
      marketType: "SPREAD",
      outcomeKey: "AWAY",
      proposition: "Buffalo Bills -3.5",
      lineMilli: -3500,
      americanOdds: -110,
    },
    {
      marketType: "SPREAD",
      outcomeKey: "HOME",
      proposition: "New York Jets +3.5",
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
  }));
  const imported = {
    source: "THE_ODDS_API",
    fetchedAt: new Date().toISOString(),
    events: [
      {
        source: "THE_ODDS_API",
        externalEventId: `quote-game-${run}`,
        sportKey: "americanfootball_nfl",
        awayTeam: "Buffalo Bills",
        homeTeam: "New York Jets",
        scheduledStartAt: kickoff,
        markets,
      },
    ],
  };
  const stored = await rpc(members[0]!, "store_live_odds_import", {
    p_league_id: leagueId,
    p_import: imported,
    p_idempotency_key: `quote-import-${run}`,
  });
  await rpc(members[0]!, "publish_live_week_slate", {
    p_league_id: leagueId,
    p_import_id: stored.importId,
    p_external_event_ids: [`quote-game-${run}`],
    p_idempotency_key: `quote-publish-${run}`,
  });
  sql(
    "update private.odds_refresh_policy set enabled=true, daily_credit_limit=300,monthly_credit_limit=1500,requests_remaining=1500,next_request_at='-infinity';",
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
    p_idempotency_key: `quote-lock-${run}`,
  });
  expireRefresh(leagueId);

  // Independent authenticated HTTP requests contend on the actual database lease.
  const claims = await Promise.all(
    members
      .slice(1, 3)
      .map((member) =>
        member
          .schema("api")
          .rpc("claim_live_quote_refresh", { p_league_id: leagueId }),
      ),
  );
  expect(
    claims.filter((result) => result.data?.status === "CLAIMED"),
  ).toHaveLength(1);
  expect(
    claims.filter((result) => result.error?.message === "QUOTE_REFRESH_BUSY"),
  ).toHaveLength(1);
  const winningLease = claims.find(
    (result) => result.data?.status === "CLAIMED",
  )!.data.leaseId;
  await rpc(admin, "complete_live_quote_refresh", {
    p_lease_id: winningLease,
    p_import: null,
  });
  expireRefresh(leagueId);

  const providerPayload = (homeOdds: number) => [
    {
      id: `quote-game-${run}`,
      sport_key: "americanfootball_nfl",
      commence_time: kickoff,
      away_team: "Buffalo Bills",
      home_team: "New York Jets",
      bookmakers: [
        {
          key: "draftkings",
          last_update: sourceAt,
          markets: [
            {
              key: "h2h",
              last_update: sourceAt,
              outcomes: [
                { name: "Buffalo Bills", price: -160 },
                { name: "New York Jets", price: homeOdds },
              ],
            },
            {
              key: "spreads",
              last_update: sourceAt,
              outcomes: [
                { name: "Buffalo Bills", price: -110, point: -3.5 },
                { name: "New York Jets", price: -110, point: 3.5 },
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
    },
  ];
  writeFileSync(
    fixturePath!,
    JSON.stringify({ payload: providerPayload(140) }),
  );
  writeFileSync(`${fixturePath}.calls`, "");
  await page.setViewportSize({ width: 390, height: 844 });
  await buildCard(page, slug, identities[1]!);
  await page.getByRole("button", { name: "Review 1 picks" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Review your complete card" }),
  ).toBeVisible();
  await expect(page.getByText("Odds checked", { exact: false })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Use updated odds" }),
  ).toHaveCount(0);
  expect(
    readFileSync(`${fixturePath}.calls`, "utf8").trim().split("\n"),
  ).toHaveLength(1);
  await page.getByRole("button", { name: "Confirm and seal card" }).click();
  await expect(
    page.getByRole("heading", { name: "All 1,000 credits are sealed" }),
  ).toBeVisible();
  const original = await rpc(members[1]!, "get_stage1_state", {
    p_league_slug: slug,
  });
  expect(
    new Date(original.ownerCard.positions[0].quoteObservedAt).getTime(),
  ).toBeLessThan(Date.now() - 120_000);
  const originalReceipt = original.ownerCard.positions;

  const second = await browser.newContext({
    baseURL: "http://127.0.0.1:3000",
    viewport: { width: 320, height: 800 },
  });
  const secondPage = await second.newPage();
  await buildCard(secondPage, slug, identities[2]!);
  expireRefresh(leagueId);
  writeFileSync(
    fixturePath!,
    JSON.stringify({ payload: providerPayload(130) }),
  );
  await secondPage
    .getByRole("button", { name: "Review 1 picks" })
    .first()
    .click();
  await expect(
    secondPage.getByText(/Updated quote · Buffalo Bills at New York Jets/),
  ).toBeVisible();
  await expect(
    secondPage.getByRole("button", { name: "Review changed quotes first" }),
  ).toBeDisabled();
  await secondPage.screenshot({
    path: "test-results/card-quotes-changed-mobile.png",
    fullPage: true,
  });
  await secondPage.getByRole("button", { name: "Use updated odds" }).click();
  await secondPage
    .getByRole("button", { name: "Confirm and seal card" })
    .click();
  await expect(
    secondPage.getByRole("heading", { name: "All 1,000 credits are sealed" }),
  ).toBeVisible();
  expect(
    (await rpc(members[1]!, "get_stage1_state", { p_league_slug: slug }))
      .ownerCard.positions,
  ).toEqual(originalReceipt);
  const secondState = await rpc(members[2]!, "get_stage1_state", {
    p_league_slug: slug,
  });
  expect(secondState.ownerCard.positions[0].americanOdds).toBe(130);
  expect(secondState.matchup.opponentRevealedPositions).toEqual([]);
  await second.close();

  const third = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const thirdPage = await third.newPage();
  await buildCard(thirdPage, slug, identities[3]!);
  expireRefresh(leagueId);
  writeFileSync(fixturePath!, JSON.stringify({ payload: {}, status: 503 }));
  await thirdPage
    .getByRole("button", { name: "Review 1 picks" })
    .first()
    .click();
  await expect(
    thirdPage.getByText(/Nothing was sealed.*draft has been kept/),
  ).toBeVisible();
  expect(
    await thirdPage.evaluate(() =>
      Object.values(localStorage).some((value) =>
        value.includes('"stakeCredits":1000'),
      ),
    ),
  ).toBe(true);
  expect(
    (await rpc(members[3]!, "get_stage1_state", { p_league_slug: slug }))
      .ownerCard.positions,
  ).toEqual([]);
  expireRefresh(leagueId);
  writeFileSync(
    fixturePath!,
    JSON.stringify({ payload: providerPayload(130) }),
  );
  await thirdPage
    .getByRole("button", { name: "Review 1 picks" })
    .first()
    .click();
  await expect(
    thirdPage.getByRole("button", { name: "Confirm and seal card" }),
  ).toBeEnabled();
  // Two actual HTTP confirmations contend on the same card and operation key.
  // The first two members above already exercise confirmation via server action.
  const reviewedPositions = JSON.parse(
    await thirdPage.locator('input[name="positions"]').inputValue(),
  ) as Record<string, unknown>[];
  reviewedPositions[0].reviewId = await thirdPage
    .locator('input[name="reviewId"]')
    .inputValue();
  const confirmations = await Promise.all(
    [1, 2].map(() =>
      rpc(members[3]!, "accept_stage1_card", {
        p_league_slug: slug,
        p_positions: reviewedPositions,
        p_idempotency_key: `concurrent-confirm-${run}`,
      }),
    ),
  );
  expect(confirmations.filter((result) => result.replayed)).toHaveLength(1);
  expect(confirmations[0].receipts).toEqual(confirmations[1].receipts);
  await thirdPage.reload();
  await expect(
    thirdPage.getByRole("heading", { name: "All 1,000 credits are sealed" }),
  ).toBeVisible();
  await third.close();
});
