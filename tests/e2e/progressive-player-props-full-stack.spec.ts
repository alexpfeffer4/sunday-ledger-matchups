import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { completePlayerPropsAction } from "../fixtures/complete-player-props-action";
import {
  stage1StateSchema,
  type Stage1StateDto,
} from "../../src/application/queries/stage1-dtos";
import { playerPropMenuSchema } from "../../src/application/queries/player-prop-dtos";
import { normalizeTheOddsApiProps } from "../../src/adapters/providers/the-odds-api/normalize-props";
import { propMarketFamilies } from "../../src/application/providers/player-prop-quotes";
import { quoteSql } from "../fixtures/player-props-acceptance.mjs";

// This lane starts with its own reset: the historical 1.4 full-stack journey
// intentionally has immutable menus under the earlier source policy.
const enabled = process.env.FULL_STACK_ACCEPTANCE === "1";
const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const database = process.env.TEST_SUPABASE_DB_URL;
const providerFixture = process.env.ODDS_TEST_FIXTURE;
if (enabled) {
  if (!url || !key || !secret || !database || !providerFixture)
    throw new Error(
      "Progressive acceptance requires disposable Auth, DB and provider fixtures.",
    );
  for (const endpoint of [url, database])
    if (!["localhost", "127.0.0.1"].includes(new URL(endpoint).hostname))
      throw new Error(
        "Progressive acceptance refuses hosted Auth or databases.",
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
    { input: statement, encoding: "utf8" },
  ).trim();
}
function helpers(file: string, marker: string) {
  const content = readFileSync(file, "utf8")
    .split(`-- BEGIN ${marker}`)[1]
    ?.split(`-- END ${marker}`)[0];
  if (!content) throw new Error(`Missing ${marker} disposable helpers.`);
  return content;
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
async function menu(connection: SupabaseClient, slug: string) {
  return playerPropMenuSchema.parse(
    await rpc(connection, "get_player_prop_menu", { p_league_slug: slug }),
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
async function gamePanel(page: Page, event: Stage1StateDto["slate"][number]) {
  const panel = page.locator("details").filter({
    has: page
      .locator("summary")
      .filter({ hasText: `${event.awayTeam} at ${event.homeTeam}` }),
  });
  if (
    !(await panel.evaluate((element) => (element as HTMLDetailsElement).open))
  )
    await panel.locator("summary").click();
  return panel;
}
type Fixture = {
  owner: string;
  slug: string;
  week: string;
  card: string;
  event: string;
  leaseId: string;
  proposals: unknown[];
  pendingEvent: string;
  pendingTeam: string;
  pendingSlot: string;
  pendingSubject: string;
  frozenSubject: string;
};

function writeProviderFixture(slate: Stage1StateDto["slate"]) {
  const observedAt = new Date().toISOString();
  const events = Object.fromEntries(
    slate.map((event) => {
      const payload = {
        id: event.key,
        sport_key: "americanfootball_nfl",
        // Keep PostgreSQL microseconds; changing the instant would invalidate
        // the same identity checks used by an actual provider response.
        commence_time: event.scheduledStartAt.replace(/\+00:00$/, "Z"),
        away_team: event.awayTeam,
        home_team: event.homeTeam,
        bookmakers: [
          {
            key: "draftkings",
            markets: propMarketFamilies.map((family, index) => ({
              key: family,
              last_update: observedAt,
              outcomes: [event.awayTeam, event.homeTeam].flatMap((team) =>
                ["Over", "Under"].map((name) => ({
                  name,
                  description: `${event.key}:${team}:${["QB", "RB", "WR"][index]}`,
                  price: -110,
                  point: [250.5, 80.5, 65.5][index],
                })),
              ),
            })),
          },
        ],
      };
      normalizeTheOddsApiProps(
        payload,
        observedAt,
        event.key,
        propMarketFamilies,
      );
      return [event.key, payload];
    }),
  );
  writeFileSync(
    `${providerFixture}.props`,
    JSON.stringify({ events, remaining: 19900, used: 100 }),
  );
  writeFileSync(`${providerFixture}.calls`, "");
}

test("partial initial review approves pending slots; a later automatic player appears after another game starts without changing an accepted prop", async ({
  page,
  baseURL,
}, info) => {
  test.setTimeout(240_000);
  if (
    !baseURL ||
    !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)
  )
    throw new Error("Progressive acceptance refuses a hosted application.");
  const run = `${Date.now().toString(36)}-${info.project.name}`;
  const slug = `progressive-${run}`;
  const identity = {
    email: `${slug}@acceptance.test`,
    password: `Progressive-${run}-48!`,
  };
  const admin = client(secret!);
  const created = await admin.auth.admin.createUser({
    ...identity,
    email_confirm: true,
  });
  expect(created.error).toBeNull();
  const owner = client(key!);
  expect((await owner.auth.signInWithPassword(identity)).error).toBeNull();
  const fixture: Fixture = JSON.parse(
    sql(`begin;
${helpers("supabase/tests/open_week2_props_after_reset.test.sql", "AFTER RESET CUTOVER HELPERS")}
${helpers("supabase/tests/progressive_player_props.test.sql", "PROGRESSIVE PLAYER PROPS HELPERS")}
select pg_temp.progressive_fixture(${quoteSql(slug)},p_owner_id=>${quoteSql(created.data.user!.id)}::uuid,p_activate=>false);
commit;`),
  );
  // End the synthetic preparation lease before the actual browser review;
  // the post-activation worker will claim its own real progressive context.
  await rpc(admin, "complete_player_catalog_job", {
    p_lease_id: fixture.leaseId,
    p_status: "PENDING",
    p_missing_sources: 24,
    p_error: "CATALOG_IDENTITIES_OR_ROLES_UNRESOLVED",
  });
  const initial = await menu(owner, slug);
  expect(initial.progressiveAvailability).toBe(true);
  expect(initial.progressiveActivated).toBe(false);
  expect(initial.slots.filter((slot) => slot.subjectId)).toHaveLength(6);
  expect(initial.slots.filter((slot) => !slot.subjectId)).toHaveLength(24);
  expect(initial.slots.every((slot) => !slot.confirmed)).toBe(true);

  await signIn(page, identity, `/l/${slug}/commissioner`);
  await expect(
    page.getByRole("heading", {
      name: "Review available players and pending slots",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "5 games · 6 of 30 player slots selected · 24 unavailable now",
      { exact: true },
    ),
  ).toBeVisible();
  const acknowledgement = page.getByLabel(
    "I reviewed the available players and approve automatic publication of eligible empty slots before each game’s betting cutoff.",
  );
  await expect(acknowledgement).not.toBeChecked();
  await expect(page.locator('select[id^="player-menu-"]')).toHaveCount(0);
  await acknowledgement.check();
  await completePlayerPropsAction(
    page,
    page.getByRole("button", {
      name: "Confirm players and pending-slot policy",
      exact: true,
    }),
    "Available players and the automatic pending-slot policy confirmed.",
  );
  await expect
    .poll(async () =>
      (await menu(owner, slug)).slots.every((slot) => slot.confirmed),
    )
    .toBe(true);
  const initialReview = sql(
    `select to_jsonb(r)::text from private.player_prop_progressive_reviews r where week_id=${quoteSql(fixture.week)}::uuid;`,
  );
  expect(JSON.parse(initialReview).reviewed_by).toBe(created.data.user!.id);
  const cutover = JSON.parse(
    sql(
      `select private.cutover_open_week2_progressive_props(${quoteSql(fixture.week)}::uuid,private.week2_props_menu_hash(${quoteSql(fixture.week)}::uuid),repeat('d',64),repeat('c',40),${quoteSql(`${slug}-cutover`)},'Disposable real-Auth reviewed policy acceptance');`,
    ),
  );
  expect(cutover.rulesetVersion).toBe("1.5");
  let current = await state(owner, slug);
  expect(current.ownerCard!.remainingCredits).toBe(1000);
  expect(current.ownerCard!.positions).toHaveLength(0);
  writeProviderFixture(current.slate);

  // Only the provider transport is scripted. Refresh, quote proof, confirmation
  // and immutable receipt creation all follow the real application path.
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Published players and pending slots",
      exact: true,
    }),
  ).toBeVisible();
  await expect(acknowledgement).toHaveCount(0);
  await completePlayerPropsAction(
    page,
    page.getByRole("button", {
      name: "Refresh full-slate player lines",
      exact: true,
    }),
    "Available player lines updated.",
  );
  await expect
    .poll(
      async () =>
        (await state(owner, slug)).slate
          .find((event) => event.id === fixture.event)!
          .markets.filter((market) => market.subjectId).length,
    )
    .toBe(12);
  current = await state(owner, slug);
  const knownGame = current.slate.find((event) => event.id === fixture.event)!;
  const pendingGame = current.slate.find(
    (event) => event.id === fixture.pendingEvent,
  )!;
  // The raw state RPC contains markets; the application query adds player
  // slots from the separate menu RPC before rendering the slate.
  const knownMenuBefore = (await menu(owner, slug)).slots.find(
    (slot) =>
      slot.eventId === knownGame.id && slot.subjectId === fixture.frozenSubject,
  )!;
  expect(knownMenuBefore).toMatchObject({ confirmed: true, frozen: true });
  expect(knownMenuBefore.subjectLabel).toBeTruthy();
  await page.goto(`/l/${slug}/slate`);
  await page.getByRole("button", { name: "Player props", exact: true }).click();
  const pendingPanel = await gamePanel(page, pendingGame);
  await expect(
    pendingPanel.getByText("Unavailable now · Check back before kickoff.", {
      exact: true,
    }),
  ).toHaveCount(6);
  const knownPanel = await gamePanel(page, knownGame);
  const player = knownPanel.locator("article").filter({
    has: page.getByRole("heading", {
      name: knownMenuBefore.subjectLabel!,
      exact: true,
    }),
  });
  await player
    .locator(".outcome-selector-group button:not([disabled])")
    .first()
    .click();
  await page.getByLabel("Stake in credits").fill("100");
  await page.getByRole("button", { name: "Add to card", exact: true }).click();
  await completePlayerPropsAction(
    page,
    page.getByRole("button", { name: /^Review 1 bets?$/ }).first(),
  );
  await expect(
    page.getByRole("heading", { name: "Review your bets", exact: true }),
  ).toBeVisible();
  await completePlayerPropsAction(
    page,
    page.getByRole("button", { name: "Submit bets", exact: true }),
    /submitted|saved/,
  );
  await expect
    .poll(async () => (await state(owner, slug)).ownerCard!.positions.length)
    .toBe(1);
  const accepted = await state(owner, slug);
  const position = accepted.ownerCard!.positions[0]!;
  expect(position.subjectId).toBe(fixture.frozenSubject);
  expect(accepted.ownerCard!.remainingCredits).toBe(900);
  const receiptBefore = sql(
    `select to_jsonb(r)::text from private.position_receipts r where id=${quoteSql(position.id)}::uuid;`,
  );
  expect(receiptBefore).not.toBe("");

  // A local fixture start observation closes the early game. Future-game
  // publication must still proceed through the actual leased service RPC.
  sql(`update private.sports_events set state='LIVE',actual_started_at=clock_timestamp() where id=${quoteSql(knownGame.id)}::uuid;
update private.player_catalog_jobs set next_attempt_at=clock_timestamp() where week_id=${quoteSql(fixture.week)}::uuid;`);
  const claim = await rpc(admin, "claim_player_catalog_job", {
    p_week_id: fixture.week,
  });
  expect(claim.progressiveSlots).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        externalEventId: pendingGame.key,
        team: fixture.pendingTeam,
        slot: fixture.pendingSlot,
      }),
    ]),
  );
  expect(
    claim.events.some(
      (event: { externalEventId: string }) =>
        event.externalEventId === knownGame.key,
    ),
  ).toBe(false);
  const publication = await rpc(admin, "record_player_catalog_nominations", {
    p_lease_id: claim.leaseId,
    p_proposals: fixture.proposals,
  });
  expect(publication).toMatchObject({
    progressive: true,
    publishedSlots: 1,
    remainingSlots: 23,
    replayed: false,
  });
  await rpc(admin, "complete_player_catalog_job", {
    p_lease_id: claim.leaseId,
    p_status: "PENDING",
    p_missing_sources: publication.remainingSlots,
    p_error: "CATALOG_IDENTITIES_OR_ROLES_UNRESOLVED",
  });
  let published = await menu(owner, slug);
  const lateSlot = published.slots.find(
    (slot) => slot.subjectId === fixture.pendingSubject,
  )!;
  expect(lateSlot).toMatchObject({
    publicationMode: "AUTOMATIC",
    confirmed: true,
    frozen: true,
  });
  expect(lateSlot.publishedAt).toBeTruthy();
  expect(
    published.slots.find((slot) => slot.subjectId === fixture.frozenSubject),
  ).toEqual(knownMenuBefore);
  expect(
    sql(
      `select to_jsonb(r)::text from private.player_prop_progressive_reviews r where week_id=${quoteSql(fixture.week)}::uuid;`,
    ),
  ).toBe(initialReview);
  expect(
    sql(
      `select to_jsonb(r)::text from private.position_receipts r where id=${quoteSql(position.id)}::uuid;`,
    ),
  ).toBe(receiptBefore);
  const afterPublication = await state(owner, slug);
  expect(afterPublication.ownerCard!.remainingCredits).toBe(900);
  expect(afterPublication.ownerCard!.positions).toEqual(
    accepted.ownerCard!.positions,
  );

  await page.reload();
  await page.getByRole("button", { name: "Player props", exact: true }).click();
  const latePanel = await gamePanel(page, pendingGame);
  await expect(
    latePanel.getByRole("heading", {
      name: lateSlot.subjectLabel!,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    latePanel.getByText("Added automatically before kickoff.", { exact: true }),
  ).toBeVisible();
  await expect(
    latePanel.getByText("Unavailable now · Check back before kickoff.", {
      exact: true,
    }),
  ).toHaveCount(5);
  await completePlayerPropsAction(
    page,
    latePanel.getByRole("button", {
      name: "Refresh player lines",
      exact: true,
    }),
    "Available player lines updated.",
  );
  await expect
    .poll(
      async () =>
        (await state(owner, slug)).slate
          .find((event) => event.id === pendingGame.id)!
          .markets.filter(
            (market) => market.subjectId === fixture.pendingSubject,
          ).length,
    )
    .toBe(2);
  const newPlayer = latePanel.locator("article").filter({
    has: page.getByRole("heading", {
      name: lateSlot.subjectLabel!,
      exact: true,
    }),
  });
  await expect(
    newPlayer.locator(".outcome-selector-group button:not([disabled])"),
  ).toHaveCount(2);
  await expect(
    page.getByRole("region", { name: "Your weekly card", exact: true }),
  ).toContainText("1 submitted bet · 100 credits committed");
  expect(readFileSync(`${providerFixture}.calls`, "utf8")).toContain(
    `props:${pendingGame.key}:`,
  );
  await page.screenshot({
    path: info.outputPath("progressive-late-slot.png"),
    fullPage: true,
  });
  await page.goto(`/l/${slug}/rules`);
  await expect(
    page.getByRole("heading", {
      name: "Featured players and availability",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/Each player stays fixed from first publication/),
  ).toBeVisible();
  published = await menu(owner, slug);
  expect(published.progressiveActivated).toBe(true);
  await owner.auth.signOut();
});

test("one season approval opens two future weeks automatically and pause retains pending props", async ({
  page,
  request,
  baseURL,
}, info) => {
  test.setTimeout(180_000);
  if (
    !baseURL ||
    !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)
  )
    throw new Error("Automation acceptance requires a disposable app.");
  const run = `${Date.now().toString(36)}-${info.project.name}`;
  const slug = `season-auto-${run}`;
  const identity = {
    email: `${slug}@acceptance.test`,
    password: `Season-Auto-${run}-48!`,
  };
  const admin = client(secret!);
  const created = await admin.auth.admin.createUser({
    ...identity,
    email_confirm: true,
  });
  expect(created.error).toBeNull();
  const owner = client(key!);
  expect((await owner.auth.signInWithPassword(identity)).error).toBeNull();
  const fixtureSource = [
    helpers(
      "supabase/tests/open_week2_props_after_reset.test.sql",
      "AFTER RESET CUTOVER HELPERS",
    ),
    helpers(
      "supabase/tests/progressive_player_props.test.sql",
      "PROGRESSIVE PLAYER PROPS HELPERS",
    ),
    readFileSync("supabase/tests/fixtures/season_automation.sql.inc", "utf8"),
  ].join("\n");
  const fixture = JSON.parse(
    sql(`begin; ${fixtureSource}
    select pg_temp.automation_context(${quoteSql(slug)},${quoteSql(created.data.user!.id)}::uuid,false); commit;`),
  );
  await signIn(page, identity, `/l/${slug}/commissioner`);
  const panel = page.getByRole("region", { name: "Season automation" });
  await expect(panel.getByText("Not enabled", { exact: true })).toBeVisible();
  const consent = panel.getByRole("checkbox");
  await expect(consent).not.toBeChecked();
  await consent.check();
  await completePlayerPropsAction(
    page,
    panel.getByRole("button", { name: "Approve and enable for this season" }),
    "Season automation approved",
  );
  await expect(
    panel.getByRole("button", { name: "Pause automation" }),
  ).toBeVisible();
  const data = `${quoteSql(JSON.stringify(fixture))}::jsonb`;
  for (const week of [3, 4]) {
    const stage = sql(`begin; ${fixtureSource}
      ${week === 4 ? `update private.season_weeks set state='FINAL' where season_id=${quoteSql(fixture.season)}::uuid and nfl_week=3;` : ""}
      select pg_temp.automation_stage(${data},${week},${week === 3}); commit;`);
    expect(stage).toMatch(/[0-9a-f-]{36}/);
    for (const operation of ["VALIDATE", "OPEN"]) {
      const runId = sql(
        `begin; ${fixtureSource} select pg_temp.automation_run(${data},'${operation}',${week}); commit;`,
      );
      const completed = await rpc(admin, "complete_season_automation", {
        p_run: runId,
      });
      expect(completed.status).toBe(
        operation === "OPEN" ? "OPENED" : "VALIDATED",
      );
    }
    await page.reload();
    await expect(
      panel.getByText(
        new RegExp(`Week ${week} players validated automatically`),
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: /Confirm reviewed|Confirm available|Open reviewed week/,
      }),
    ).toHaveCount(0);
    const currentMenu = await menu(owner, slug);
    expect(currentMenu.automaticValidation).toBe(true);
    expect(currentMenu.canOpen).toBe(false);
    expect(currentMenu.slots.filter((slot) => slot.subjectId)).toHaveLength(
      week === 3 ? 1 : 0,
    );
  }
  await completePlayerPropsAction(
    page,
    panel.getByRole("button", { name: "Pause automation" }),
    "Future preparation and publication paused",
  );
  await expect(
    panel.getByRole("button", { name: "Resume automation" }),
  ).toBeVisible();
  const audit = JSON.parse(
    sql(`select jsonb_build_object(
    'consents',(select count(*) from private.season_automation_consents where season_id=${quoteSql(fixture.season)}::uuid),
    'system',(select count(*) from private.player_prop_system_validations v join private.season_weeks w on w.id=v.week_id where w.season_id=${quoteSql(fixture.season)}::uuid),
    'human',(select count(*) from private.player_prop_progressive_reviews r join private.season_weeks w on w.id=r.week_id where w.season_id=${quoteSql(fixture.season)}::uuid and w.nfl_week>=3),
    'cards',(select count(*) from private.weekly_cards c join private.season_weeks w on w.id=c.week_id where w.season_id=${quoteSql(fixture.season)}::uuid and w.nfl_week>=3),
    'pending',(select count(*) from private.player_catalog_pending_slots((select id from private.season_weeks where season_id=${quoteSql(fixture.season)}::uuid and nfl_week=4))));`),
  );
  expect(audit).toEqual({
    consents: 1,
    system: 2,
    human: 0,
    cards: 8,
    pending: 6,
  });
  expect(
    (await owner.schema("api").rpc("claim_season_automation")).error,
  ).not.toBeNull();
  expect(
    (
      await request.post("/api/operations/season-automation", { data: {} })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/operations/season-automation?league=other", {
        headers: { Authorization: `Bearer ${process.env.SCORE_JOB_SECRET}` },
        data: {},
      })
    ).status(),
  ).toBe(400);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/season-automation-${info.project.name}.png`,
    fullPage: true,
  });
});

test("isolated season automation Preview shows one approval and pause controls", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/preview/season-automation");
  const panel = page.getByRole("region", { name: "Season automation" });
  await expect(
    page.getByRole("heading", { name: "Your season, ready each week." }),
  ).toBeVisible();
  await expect(panel.getByRole("checkbox")).not.toBeChecked();
  await page.screenshot({
    path: `test-results/season-automation-preview-approval-${info.project.name}.png`,
    fullPage: true,
  });
  await panel.getByRole("checkbox").check();
  await panel
    .getByRole("button", { name: "Approve and enable for this season" })
    .click();
  await expect(
    panel.getByRole("button", { name: "Pause automation" }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Pause automation" }).click();
  await expect(
    panel.getByRole("button", { name: "Resume automation" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Show automatically opened week" })
    .click();
  await expect(
    panel.getByText(/Week 3 players validated automatically/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `test-results/season-automation-preview-open-${info.project.name}.png`,
    fullPage: true,
  });
});
