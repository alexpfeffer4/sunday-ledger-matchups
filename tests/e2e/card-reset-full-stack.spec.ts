import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { stage1StateSchema } from "../../src/application/queries/stage1-dtos";
import { quoteSql } from "../fixtures/player-props-acceptance.mjs";

const enabled = process.env.FULL_STACK_ACCEPTANCE === "1";
const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const database = process.env.TEST_SUPABASE_DB_URL;
const providerFixture = process.env.ODDS_TEST_FIXTURE;
if (enabled) {
  if (!url || !key || !secret || !database || !providerFixture)
    throw new Error(
      "Card reset acceptance requires disposable Auth, DB and provider fixtures.",
    );
  for (const endpoint of [url, database])
    if (!["localhost", "127.0.0.1"].includes(new URL(endpoint).hostname))
      throw new Error(
        "Card reset acceptance refuses hosted Auth or databases.",
      );
}
test.skip(!enabled, "requires the disposable full-stack acceptance lane");

function client(apiKey: string) {
  return createClient(url!, apiKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
function sql(statement: string) {
  return execFileSync(
    "psql",
    [database!, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-q"],
    {
      input: statement,
      encoding: "utf8",
    },
  ).trim();
}
async function rpc(
  connection: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
) {
  const result = await connection.schema("api").rpc(name, args);
  expect(result.error, `${name}: ${result.error?.message ?? "ok"}`).toBeNull();
  return result.data;
}
async function state(connection: SupabaseClient, slug: string) {
  return stage1StateSchema.parse(
    await rpc(connection, "get_stage1_state", { p_league_slug: slug }),
  );
}
async function signIn(
  page: Page,
  identity: { email: string; password: string },
  path: string,
) {
  await page.goto(`/auth/sign-in?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email address").fill(identity.email);
  await page.getByLabel("Password", { exact: true }).fill(identity.password);
  await page.getByRole("button", { name: "Sign in with password" }).click();
  await page.waitForURL(`**${path}`);
}

type ResetFixture = {
  owner: string;
  league: string;
  season: string;
  week: string;
  card: string;
  event: string;
  positions: unknown[];
  receiptIds: string[];
  receiptHash: string;
};

// A completed, no-bet Week 1 in the same disposable league gives the browser
// real historical result rows to revisit. These are initial fixture records;
// no lifecycle guard, accepted receipt, or existing result is rewritten.
function seedCompletedWeekOne(fixture: ResetFixture) {
  return sql(`
do $history$
declare historical_week uuid:=gen_random_uuid();
begin
 insert into private.season_weeks(id,season_id,league_id,nfl_week,state,opens_at,common_lock_at,locked_at,correction_window_closes_at,ruleset_snapshot_id)
 select historical_week,season_id,league_id,1,'FINAL',clock_timestamp()-interval '8 days',clock_timestamp()-interval '7 days',clock_timestamp()-interval '7 days',clock_timestamp()-interval '5 days',ruleset_snapshot_id
 from private.season_weeks where id=${quoteSql(fixture.week)}::uuid;
 insert into private.weekly_cards(week_id,season_id,league_id,entry_id,owner_user_id,granted_at,compliance,locked_at)
 select historical_week,season_id,league_id,entry_id,owner_user_id,clock_timestamp()-interval '8 days','INCOMPLETE',clock_timestamp()-interval '7 days'
 from private.weekly_cards where week_id=${quoteSql(fixture.week)}::uuid;
 insert into private.matchups(week_id,season_id,league_id,schedule_publication_id,side_a_entry_id,side_b_entry_id,display_order)
 select historical_week,season_id,league_id,schedule_publication_id,side_a_entry_id,side_b_entry_id,display_order
 from private.matchups where week_id=${quoteSql(fixture.week)}::uuid;
 insert into private.weekly_score_versions(card_id,week_id,league_id,entry_id,input_hash,compliance,score_centicredits,is_complete,status)
 select id,week_id,league_id,entry_id,encode(extensions.digest(id::text||':fixture-final','sha256'),'hex'),'INCOMPLETE',0,true,'FINAL'
 from private.weekly_cards where week_id=historical_week;
 insert into private.matchup_result_versions(matchup_id,week_id,league_id,side_a_score_version_id,side_b_score_version_id,side_a_decision,side_b_decision,side_a_points_for_centicredits,side_b_points_for_centicredits,input_hash,status)
 select m.id,m.week_id,m.league_id,a.id,b.id,'TIE','TIE',0,0,encode(extensions.digest(m.id::text||':fixture-final','sha256'),'hex'),'FINAL'
 from private.matchups m join private.weekly_score_versions a on a.week_id=m.week_id and a.entry_id=m.side_a_entry_id
 join private.weekly_score_versions b on b.week_id=m.week_id and b.entry_id=m.side_b_entry_id where m.week_id=historical_week;
end;
$history$;
select id from private.season_weeks where season_id=${quoteSql(fixture.season)}::uuid and nfl_week=1;`);
}

function historyFingerprint(weekId: string) {
  return sql(`select encode(extensions.digest(jsonb_build_object(
    'week',(select to_jsonb(w) from private.season_weeks w where id=${quoteSql(weekId)}::uuid),
    'cards',(select jsonb_agg(to_jsonb(c) order by id) from private.weekly_cards c where week_id=${quoteSql(weekId)}::uuid),
    'receipts',(select jsonb_agg(to_jsonb(r) order by id) from private.position_receipts r where week_id=${quoteSql(weekId)}::uuid),
    'scores',(select jsonb_agg(to_jsonb(s) order by id) from private.weekly_score_versions s where week_id=${quoteSql(weekId)}::uuid),
    'matchups',(select jsonb_agg(to_jsonb(m) order by id) from private.matchups m where week_id=${quoteSql(weekId)}::uuid),
    'results',(select jsonb_agg(to_jsonb(r) order by id) from private.matchup_result_versions r where week_id=${quoteSql(weekId)}::uuid)
  )::text,'sha256'),'hex');`);
}

test("Week 2 reset retires accepted bets and stale device drafts, preserves history, and accepts a fresh same-market bet through real Auth/UI/RPC", async ({
  page,
  baseURL,
}, info) => {
  test.setTimeout(180_000);
  if (
    !baseURL ||
    !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)
  )
    throw new Error("Card reset acceptance refuses a hosted application.");
  const run = `${Date.now().toString(36)}-${info.project.name}`;
  const slug = `reset-${run}`;
  const identity = {
    email: `reset-${run}@acceptance.test`,
    password: `Reset-${run}-48!`,
  };
  const admin = client(secret!);
  const created = await admin.auth.admin.createUser({
    ...identity,
    email_confirm: true,
  });
  expect(created.error).toBeNull();
  const owner = client(key!);
  expect((await owner.auth.signInWithPassword(identity)).error).toBeNull();
  const fixture: ResetFixture = JSON.parse(
    sql(`begin;
${readFileSync("tests/fixtures/card-reset-acceptance.sql", "utf8")}
select pg_temp.card_reset_fixture(${quoteSql(slug)},1000,${quoteSql(created.data.user!.id)}::uuid);
commit;`),
  );
  const historicalWeek = seedCompletedWeekOne(fixture);
  const historyBefore = historyFingerprint(historicalWeek);
  const before = await state(owner, slug);
  expect(before.week!.nflWeek).toBe(2);
  expect(before.ownerCard!.positions).toHaveLength(4);
  expect(before.ownerCard!.remainingCredits).toBe(0);
  const originalHashes = before
    .ownerCard!.positions.map((position) => position.receiptHash)
    .sort();
  const originalTerms = sql(
    `select jsonb_agg(to_jsonb(r) order by id)::text from private.position_receipts r where card_id=${quoteSql(fixture.card)}::uuid;`,
  );

  await signIn(page, identity, `/l/${slug}/card`);
  const progress = page.getByRole("region", {
    name: "Your weekly card",
    exact: true,
  });
  await expect(progress).toContainText(
    "4 submitted bets · 1,000 credits committed",
  );
  await expect(
    page.getByRole("link", { name: "View receipt", exact: true }),
  ).toHaveCount(4);
  await page.goto(`/l/${slug}/matchup?week=1`);
  await expect(
    page.getByRole("heading", { name: "Week 1 matchup", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Completed week · Read-only")).toBeVisible();

  // A stale device can retain an unsubmitted draft and a prior retry identity
  // even after another device commits all its credits. Keep both in browser
  // storage across the reset; the new generation must ignore them completely.
  const spare = before.slate.find(
    (event) =>
      !before.ownerCard!.positions.some(
        (position) => position.eventId === event.id,
      ),
  )!;
  const market = spare.markets[0]!;
  const oldStorageKey = `sunday-ledger:card-draft:v1:${fixture.league}:${fixture.week}:${fixture.card}`;
  const oldAttempt = randomUUID();
  const staleDraft = {
    version: 1,
    drafts: [
      {
        eventId: spare.id,
        marketSnapshotId: market.id,
        marketType: market.marketType,
        outcomeKey: market.outcomeKey,
        reviewedAmericanOdds: market.americanOdds,
        reviewedPayloadHash: market.payloadHash,
        reviewedProposition: market.proposition,
        stakeCredits: 100,
      },
    ],
  };
  await page.evaluate(
    ({ storageKey, draft, attempt }) => {
      localStorage.setItem(storageKey, JSON.stringify(draft));
      localStorage.setItem(
        `${storageKey}:submission-attempt`,
        JSON.stringify({
          id: attempt,
          content: "stale generation zero submission",
        }),
      );
    },
    { storageKey: oldStorageKey, draft: staleDraft, attempt: oldAttempt },
  );
  await page.goto(`/l/${slug}/slate`);
  await expect(progress).toContainText("1 unsubmitted draft");

  const reset = JSON.parse(
    sql(`select private.reset_prestart_week2_card(
    ${quoteSql(fixture.league)}::uuid,${quoteSql(fixture.season)}::uuid,${quoteSql(fixture.week)}::uuid,${quoteSql(fixture.card)}::uuid,
    array[${fixture.receiptIds.map((id) => `${quoteSql(id)}::uuid`).join(",")}],${quoteSql(fixture.receiptHash)},${quoteSql(`reset-browser-${run}`)},
    repeat('0',40),'Disposable authenticated browser acceptance','Approved pre-kickoff Week 2 player-props launch reset');`),
  );
  expect(reset).toMatchObject({
    status: "RESET",
    cardGeneration: 1,
    remainingCredits: 1000,
    replayed: false,
  });
  expect(
    await rpc(owner, "accept_stage1_card", {
      p_league_slug: slug,
      p_positions: fixture.positions,
      p_idempotency_key: `${slug}-accepted`,
    }),
  ).toMatchObject({ status: "RESET" });
  await page.reload();
  await expect(progress).toContainText(
    "0 submitted bets · 0 credits committed",
  );
  await expect(
    progress
      .locator("div")
      .filter({ has: page.locator("dt", { hasText: /^Available to bet$/ }) })
      .last(),
  ).toContainText("1,000");
  await expect(progress).not.toContainText("unsubmitted draft");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /Your Week 2 picks were reset/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit pick", exact: true }),
  ).toHaveCount(0);
  let after = await state(owner, slug);
  expect(after.ownerCard!.positions).toEqual([]);
  expect(after.ownerCard!.remainingCredits).toBe(1000);
  expect(after.ownerCard!.cardGeneration).toBe(1);
  expect(historyFingerprint(historicalWeek)).toBe(historyBefore);
  expect(
    sql(
      `select jsonb_agg(to_jsonb(r) order by id)::text from private.position_receipts r where card_id=${quoteSql(fixture.card)}::uuid;`,
    ),
  ).toBe(originalTerms);

  await page.goto(`/l/${slug}/card`);
  await expect(
    page.getByRole("link", { name: "View receipt", exact: true }),
  ).toHaveCount(0);
  const resetHistory = page.locator("details").filter({
    has: page.locator("summary", { hasText: "Reset receipt history" }),
  });
  await resetHistory.locator("summary").click();
  for (const hash of originalHashes)
    await expect(resetHistory.getByText(hash, { exact: true })).toBeVisible();
  await page.screenshot({
    path: info.outputPath("reset-card-audit.png"),
    fullPage: true,
  });

  // The server's existing scripted Odds adapter supplies fresh terms. The
  // browser uses the normal server action, quote planner, proof and accept RPC;
  // no browser route mock, hosted request or replacement acceptance path.
  sql(
    "update private.odds_refresh_policy set enabled=true,daily_credit_limit=1000,monthly_credit_limit=5000,requests_remaining=20000,next_request_at='-infinity';",
  );
  const observedAt = new Date().toISOString();
  writeFileSync(
    providerFixture!,
    JSON.stringify({
      payload: before.slate.map((event) => ({
        id: event.key,
        sport_key: "americanfootball_nfl",
        commence_time: event.scheduledStartAt,
        away_team: event.awayTeam,
        home_team: event.homeTeam,
        bookmakers: [
          {
            key: "draftkings",
            last_update: observedAt,
            markets: [
              {
                key: "h2h",
                last_update: observedAt,
                outcomes: [
                  { name: event.awayTeam, price: -110 },
                  { name: event.homeTeam, price: 100 },
                ],
              },
              {
                key: "spreads",
                last_update: observedAt,
                outcomes: [
                  { name: event.awayTeam, price: -110, point: -3.5 },
                  { name: event.homeTeam, price: -110, point: 3.5 },
                ],
              },
              {
                key: "totals",
                last_update: observedAt,
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
  writeFileSync(`${providerFixture}.calls`, "");
  await page.goto(`/l/${slug}/slate`);
  const sameEvent = before.slate.find((event) => event.id === fixture.event)!;
  const game = page.getByRole("region", {
    name: `${sameEvent.awayTeam} at ${sameEvent.homeTeam}`,
    exact: true,
  });
  await game
    .locator(".outcome-selector-group")
    .first()
    .getByRole("button", { name: new RegExp(sameEvent.homeTeam) })
    .click();
  await page.getByLabel("Stake in credits").fill("300");
  await page.getByRole("button", { name: "Add to card", exact: true }).click();
  await page
    .getByRole("button", { name: /^Review 1 bets?$/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Review your bets", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit bets", exact: true }),
  ).toBeEnabled();
  expect(
    readFileSync(`${providerFixture}.calls`, "utf8").trim().split("\n"),
  ).toHaveLength(1);
  const callsAfterReview = readFileSync(`${providerFixture}.calls`, "utf8");
  await page.getByRole("button", { name: "Submit bets", exact: true }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /submitted|saved/ })
      .last(),
  ).toBeVisible();
  expect(readFileSync(`${providerFixture}.calls`, "utf8")).toBe(
    callsAfterReview,
  );
  after = await state(owner, slug);
  expect(after.ownerCard!.positions).toHaveLength(1);
  expect(after.ownerCard!.remainingCredits).toBe(700);
  expect(after.ownerCard!.positions[0]).toMatchObject({
    eventId: fixture.event,
    marketType: "MONEYLINE",
    outcomeKey: "HOME",
    stakeCredits: 300,
  });
  expect(fixture.receiptIds).not.toContain(after.ownerCard!.positions[0]!.id);
  const newStorageKey = `${oldStorageKey}:generation:1`;
  const newAttempt = await page.evaluate(
    (storageKey) =>
      JSON.parse(localStorage.getItem(`${storageKey}:submission-attempt`)!)
        .id as string,
    newStorageKey,
  );
  expect(newAttempt).toMatch(/^[0-9a-f-]{36}$/);
  expect(newAttempt).not.toBe(oldAttempt);
  expect(
    sql(
      `select card_generation from private.card_submission_intents where id=${quoteSql(newAttempt)}::uuid;`,
    ),
  ).toBe("1");
  expect(
    sql(
      `select jsonb_agg(to_jsonb(r) order by id)::text from private.position_receipts r where card_id=${quoteSql(fixture.card)}::uuid and card_generation=0;`,
    ),
  ).toBe(originalTerms);

  await page.goto(`/l/${slug}/card`);
  await expect(progress).toContainText(
    "1 submitted bet · 300 credits committed",
  );
  await expect(
    page.getByRole("link", { name: "View receipt", exact: true }),
  ).toHaveCount(1);
  await page.goto(`/l/${slug}/matchup?week=1`);
  await expect(
    page.getByRole("heading", { name: "Week 1 matchup", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Completed week · Read-only")).toBeVisible();
  expect(historyFingerprint(historicalWeek)).toBe(historyBefore);
  await info.attach("reset-generations-and-preserved-history", {
    body: JSON.stringify({
      resetId: reset.resetId,
      originalReceiptHashes: originalHashes,
      historicalWeekFingerprint: historyBefore,
      newReceiptId: after.ownerCard!.positions[0]!.id,
      availableCredits: 700,
    }),
    contentType: "application/json",
  });
});
