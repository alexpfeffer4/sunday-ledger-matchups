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
  if (!["127.0.0.1", "localhost"].includes(new URL(database!).hostname))
    throw new Error("Disposable loopback database required");
  return execFileSync(
    "psql",
    [database!, "-X", "-v", "ON_ERROR_STOP=1", "-qAt"],
    { input: statement, encoding: "utf8" },
  ).trim();
}
async function buildCard(
  page: Page,
  slug: string,
  identity: { email: string; password: string },
  verifyJourney = false,
) {
  await page.goto(
    `/auth/sign-in?next=${encodeURIComponent(`/l/${slug}/${verifyJourney ? "matchup" : "slate"}`)}`,
  );
  await page.getByLabel("Email address").fill(identity.email);
  await page.getByLabel("Password", { exact: true }).fill(identity.password);
  await page.getByRole("button", { name: "Sign in with password" }).click();
  await page.waitForURL(`**/l/${slug}/${verifyJourney ? "matchup" : "slate"}`);
  if (verifyJourney) {
    await expect(
      page
        .getByRole("region", { name: "Your weekly card", exact: true })
        .locator(".status-badge"),
    ).toContainText("Not started");
    await expect(page.getByText(/Seal by/)).toBeVisible();
    await page
      .getByRole("link", { name: "Make picks", exact: true })
      .last()
      .click();
  }
  await page
    .locator(".outcome-selector-group")
    .first()
    .getByRole("button", { name: /New York Jets/ })
    .click();
  await page
    .getByLabel("Stake in credits")
    .fill(verifyJourney ? "500" : "1000");
  await expect(page.getByRole("dialog")).toContainText("Total returned if won");
  await page.getByRole("button", { name: "Add to card" }).click();
  if (verifyJourney) {
    await page.goto(`/l/${slug}/matchup`);
    await expect(
      page.getByRole("link", { name: "Continue card" }),
    ).toBeVisible();
    await expect(page.getByText(/Draft saved on this device/)).toBeVisible();
    await page.goto(`/l/${slug}/card`);
    await expect(
      page
        .getByRole("region", { name: "Your weekly card", exact: true })
        .locator(".status-badge"),
    ).toContainText("Draft");
    await expect(page.getByText(/500/).first()).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("link", { name: "Continue card" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Continue card" }).click();
    await page.getByRole("button", { name: "Edit pick", exact: true }).click();
    await page.getByLabel("Stake in credits").fill("1000");
    await page.getByRole("button", { name: "Update pick" }).click();
    await page.goto(`/l/${slug}/matchup`);
    await expect(
      page
        .getByRole("region", { name: "Your weekly card", exact: true })
        .locator(".status-badge"),
    ).toContainText("Ready to review");
    await page.screenshot({
      path: "test-results/stage3-matchup-ready-mobile.png",
      fullPage: true,
    });
  }
}

test("scheduled saved prices preserve the authenticated member draft", async ({
  browser,
  page,
  request,
}) => {
  test.setTimeout(180_000);
  sql(
    "update private.season_weeks set state='FINAL' where league_id in (select id from private.leagues where slug like 'quote-%');",
  );
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
  // The commissioner's visible League entry now reaches the real lock action.
  const setupContext = await browser.newContext();
  const setupPage = await setupContext.newPage();
  await setupPage.goto(
    `/auth/sign-in?next=${encodeURIComponent(`/l/${slug}/league`)}`,
  );
  await setupPage.getByLabel("Email address").fill(identities[0]!.email);
  await setupPage
    .getByLabel("Password", { exact: true })
    .fill(identities[0]!.password);
  await setupPage
    .getByRole("button", { name: "Sign in with password" })
    .click();
  await setupPage
    .getByRole("link", { name: "Lock roster & start season" })
    .click();
  await expect(setupPage.locator("#season-start")).toBeVisible();
  await setupPage
    .getByRole("checkbox", { name: /I am ready to freeze/ })
    .check();
  await setupPage
    .getByRole("button", { name: "Lock 4-member roster & start season" })
    .click();
  await expect
    .poll(async () => {
      const current = await rpc(members[0]!, "get_stage1_state", {
        p_league_slug: slug,
      });
      return current.week.state;
    })
    .toBe("OPEN");
  const opened = await rpc(members[0]!, "get_stage1_state", {
    p_league_slug: slug,
  });
  expect(opened.week.state).toBe("OPEN");
  expect(opened.schedule).toHaveLength(2);
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

  await setupContext.close();
  writeFileSync(
    fixturePath!,
    JSON.stringify({
      payload: providerPayload(140),
      remaining: 19837,
      used: 163,
      last: 3,
    }),
  );
  writeFileSync(`${fixturePath}.calls`, "");
  sql(`update private.odds_refresh_policy set daily_credit_limit=2000,monthly_credit_limit=18000,requests_remaining=19840,provider_entitlement_credits=20000,next_quota_reset_at=clock_timestamp()+interval '16 days',next_request_at='-infinity',protected_core_daily_credits=350,protected_core_monthly_credits=2000;
 insert into private.odds_entitlement_probes(state,completed_at,remaining,used) values('SUCCEEDED',clock_timestamp(),19840,160);
 update private.background_quote_settings set enabled=true,polling_enabled=true,release_sha=repeat('a',40);`);
  const headers = { Authorization: `Bearer ${process.env.SCORE_JOB_SECRET}` };
  expect((await request.post("/api/operations/quotes")).status()).toBe(401);
  expect(
    (
      await request.post("/api/operations/quotes?leagueId=anything", {
        headers,
      })
    ).status(),
  ).toBe(400);
  // Exercise the installed dispatcher with real pg_net, then roll back before
  // it can send to the fixed Production URL. Deliver that exact queued request
  // to the disposable HTTP app; neither arbitrary scope nor a staged run is used.
  const dispatched = JSON.parse(
    sql(`begin;
    do $$begin
      delete from vault.secrets where name in ('score_job_secret','score_job_url');
      perform vault.create_secret('${process.env.SCORE_JOB_SECRET}', 'score_job_secret');
      perform vault.create_secret('https://www.ledgerleagues.com/api/operations/scores','score_job_url');
      perform private.dispatch_score_checkpoints();
    end$$;
    select jsonb_build_object('url',url,'headers',headers,'body',convert_from(body,'UTF8')::jsonb)
    from net.http_request_queue where url='https://www.ledgerleagues.com/api/operations/quotes' order by id desc limit 1;
    rollback;`)
      .split("\n")
      .at(-1)!,
  );
  expect(new URL(dispatched.url).pathname).toBe("/api/operations/quotes");
  expect(dispatched.body).toEqual({});
  const first = await request.post(new URL(dispatched.url).pathname, {
    headers: dispatched.headers,
    data: dispatched.body,
  });
  expect(first.status(), await first.text()).toBe(200);
  expect((await first.json()).fetched).toBe(1);
  expect(readFileSync(`${fixturePath}.calls`, "utf8").trim()).toBe("odds");
  await buildCard(page, slug, identities[1]!);
  const saved = await page.evaluate(() =>
    Object.entries(localStorage).filter(([key]) =>
      key.startsWith("sunday-ledger:card-draft:"),
    ),
  );
  expect(saved.length).toBe(1);
  const initialCount = readFileSync(`${fixturePath}.calls`, "utf8");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText(/Odds checked/).first()).toBeVisible();
  expect(readFileSync(`${fixturePath}.calls`, "utf8")).toBe(initialCount);
  // A new source timestamp with the same economics must preserve local consent.
  const newer = providerPayload(140);
  newer[0]!.bookmakers[0]!.last_update = new Date().toISOString();
  for (const market of newer[0]!.bookmakers[0]!.markets)
    market.last_update = new Date().toISOString();
  writeFileSync(
    fixturePath!,
    JSON.stringify({ payload: newer, remaining: 19834, used: 166, last: 3 }),
  );
  sql(
    "update private.shared_quote_requests set fetched_at=clock_timestamp()-interval '16 minutes' where kind='MAIN';update private.odds_refresh_policy set next_request_at='-infinity';",
  );
  const second = await request.post("/api/operations/quotes", { headers });
  expect(second.status(), await second.text()).toBe(200);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText(/Updated quote/)).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      Object.entries(localStorage).filter(([key]) =>
        key.startsWith("sunday-ledger:card-draft:"),
      ),
    ),
  ).toEqual(saved);
  const beforeRead = readFileSync(`${fixturePath}.calls`, "utf8");
  const response = await page.request.get(
    `/api/l/${slug}/quotes?weekId=${opened.week.id}`,
  );
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  const publicQuotes = await response.json();
  expect(publicQuotes.quotes.length).toBe(1);
  expect(JSON.stringify(publicQuotes)).not.toMatch(
    /"(?:request_ids|requestIds|actor_user_id|payload|stakeCredits)"\s*:/,
  );
  expect(readFileSync(`${fixturePath}.calls`, "utf8")).toBe(beforeRead);
  // The live page gets a changed economic price through a stored read, retaining draft amount.
  writeFileSync(
    fixturePath!,
    JSON.stringify({
      payload: providerPayload(155).map((event) => ({
        ...event,
        bookmakers: event.bookmakers.map((book) => ({
          ...book,
          last_update: new Date().toISOString(),
          markets: book.markets.map((market) => ({
            ...market,
            last_update: new Date().toISOString(),
          })),
        })),
      })),
      remaining: 19831,
      used: 169,
      last: 3,
    }),
  );
  sql(
    "update private.shared_quote_requests set fetched_at=clock_timestamp()-interval '16 minutes' where kind='MAIN';update private.odds_refresh_policy set next_request_at='-infinity';",
  );
  const third = await request.post("/api/operations/quotes", { headers });
  expect(third.status(), await third.text()).toBe(200);
  await expect
    .poll(async () => {
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      return page.getByText(/Updated quote/).count();
    })
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(() =>
      Object.entries(localStorage).filter(([key]) =>
        key.startsWith("sunday-ledger:card-draft:"),
      ),
    ),
  ).toEqual(saved);
  // Review retains the normal economic acknowledgement and submission authority.
  await page
    .getByRole("button", { name: "Review 1 updated quote", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Use updated odds" }).first().click();
  expect(
    sql(
      `select count(*) from private.position_receipts where league_id='${leagueId}'`,
    ),
  ).toBe("0");
  await expect(
    page.getByRole("button", { name: "Confirm and seal card" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Confirm and seal card" }).click();
  await expect(
    page.getByRole("heading", { name: "All 1,000 credits are sealed" }),
  ).toBeVisible();
  expect(
    sql(
      `select count(*) from private.position_receipts where league_id='${leagueId}'`,
    ),
  ).toBe("1");
  const outsider = await request.get(
    `/api/l/${slug}/quotes?weekId=${opened.week.id}`,
  );
  expect(outsider.status()).toBe(403);
  await page.screenshot({
    path: "test-results/shared-odds-draft.png",
    fullPage: true,
  });
  sql(
    "update private.background_quote_settings set enabled=false,polling_enabled=false,revision=revision+1;",
  );
});
