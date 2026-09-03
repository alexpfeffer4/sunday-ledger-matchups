import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";

const baseURL = "http://127.0.0.1:3000";
const supabaseUrl = process.env.TEST_SUPABASE_URL;
const publishableKey = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const ownerEmail = process.env.OWNER_REHEARSAL_TEST_EMAIL;
const ownerPassword = process.env.OWNER_REHEARSAL_TEST_PASSWORD;
const enabled =
  process.env.FULL_STACK_ACCEPTANCE === "1" &&
  Boolean(
    supabaseUrl &&
    publishableKey &&
    serviceRoleKey &&
    ownerEmail &&
    ownerPassword,
  );

type Identity = { email: string; password: string };

function apiClient(key: string): SupabaseClient {
  return createClient(supabaseUrl!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function createOutsider(admin: SupabaseClient): Promise<Identity> {
  const run = Date.now().toString(36);
  const identity = {
    email: `rehearsal-outsider-${run}@acceptance.test`,
    password: `Rehearsal-Outsider-${run}-48!`,
  };
  const created = await admin.auth.admin.createUser({
    email: identity.email,
    email_confirm: true,
    password: identity.password,
  });
  expect(created.error).toBeNull();
  const client = apiClient(publishableKey!);
  expect((await client.auth.signInWithPassword(identity)).error).toBeNull();
  expect(
    (
      await client
        .schema("api")
        .rpc("ensure_profile", { p_display_name: "Outside Observer" })
    ).error,
  ).toBeNull();
  return identity;
}

async function browserSignIn(page: Page, identity: Identity, next: string) {
  await page.goto(`/auth/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email address").fill(identity.email);
  await page.getByLabel("Password", { exact: true }).fill(identity.password);
  await page.getByRole("button", { name: "Sign in with password" }).click();
  await page.waitForURL(`**${next}`);
}

async function newPage(browser: Browser) {
  const context = await browser.newContext({ baseURL });
  return { context, page: await context.newPage() };
}

async function advance(page: Page, name: string) {
  const guide = page.locator("[data-owner-rehearsal-guide]");
  const confirmation = guide.getByRole("checkbox");
  if (await confirmation.count()) await confirmation.check();
  await guide.getByRole("button", { name }).click();
  await expect(guide.getByRole("status").last()).toContainText(
    /Checkpoint completed|Already completed/,
  );
}

async function sample(page: Page) {
  const guide = page.locator("[data-owner-rehearsal-guide]");
  await guide.getByRole("button", { name: "Use a sample card" }).click();
  await expect(guide.getByRole("status").last()).toContainText(
    /sample card is sealed|original sample card remains sealed/,
  );
}

test.skip(!enabled, "requires the disposable local Supabase acceptance job");

test("owner-only guided rehearsal runs real formation through archive and reset", async ({
  browser,
  page,
}) => {
  test.setTimeout(300_000);
  const admin = apiClient(serviceRoleKey!);
  const outsider = await createOutsider(admin);
  const owner = { email: ownerEmail!, password: ownerPassword! };

  const anonymous = await newPage(browser);
  const anonymousResponse = await anonymous.page.goto("/owner/rehearsal");
  expect([200, 404]).toContain(anonymousResponse?.status());
  await expect(anonymous.page).toHaveTitle(/Not found · Sunday Ledger/);
  await expect(
    anonymous.page.locator('meta[name="robots"]').first(),
  ).toHaveAttribute("content", /noindex/);
  expect(await anonymous.page.locator("body").innerText()).not.toContain(
    "Owner Guided Rehearsal",
  );
  await anonymous.context.close();

  const outside = await newPage(browser);
  await browserSignIn(outside.page, outsider, "/account");
  await expect(
    outside.page.getByRole("link", { name: "Open Owner Guided Rehearsal" }),
  ).toHaveCount(0);
  const outsiderResponse = await outside.page.goto("/owner/rehearsal");
  expect([200, 404]).toContain(outsiderResponse?.status());
  await expect(outside.page).toHaveTitle(/Not found · Sunday Ledger/);
  expect(await outside.page.locator("body").innerText()).not.toContain(
    "Owner Guided Rehearsal",
  );
  const outsiderClient = apiClient(publishableKey!);
  expect(
    (await outsiderClient.auth.signInWithPassword(outsider)).error,
  ).toBeNull();
  const outsiderAdvance = await outsiderClient
    .schema("api")
    .rpc("advance_owner_rehearsal", {
      p_expected_checkpoint: "FORMATION_READY",
      p_idempotency_key: "outsider-rehearsal-advance",
    });
  expect(outsiderAdvance.error?.message).toBe("Not found.");
  await outside.context.close();

  await browserSignIn(page, owner, "/account");
  await page.getByRole("link", { name: "Open Owner Guided Rehearsal" }).click();
  await expect(
    page.getByRole("heading", { name: "Owner Guided Rehearsal" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start guided rehearsal" }).click();
  await expect(
    page.getByRole("heading", { name: "See formation before roster lock" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fill with rehearsal teams" }).click();
  await expect(page.getByText("1 of 22")).toBeVisible();

  await page.getByRole("link", { name: "Enter rehearsal" }).click();
  const leagueSlug = new URL(page.url()).pathname.split("/")[2];
  expect(leagueSlug).toBeTruthy();
  await expect(
    page.getByText(
      "Owner rehearsal · Simulated data · Does not affect Live leagues",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Freeze the season foundation" }),
  ).toBeVisible();

  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const dimensions = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
  }
  await page.setViewportSize({ width: 320, height: 900 });
  for (const textSize of ["200%", "400%"] as const) {
    await page.locator("html").evaluate((element, size) => {
      element.style.fontSize = size;
    }, textSize);
    const dimensions = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
  }
  await page.locator("html").evaluate((element) => {
    element.style.fontSize = "";
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({
    colorScheme: "light",
    forcedColors: "active",
    reducedMotion: "reduce",
  });
  await expect(
    page.getByRole("button", { name: "Lock roster and open Week 1" }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus-visible")).toBeVisible();
  await page.emulateMedia({ forcedColors: "none", reducedMotion: "reduce" });

  await advance(page, "Lock roster and open Week 1");
  await page.getByRole("link", { name: "Make my Week 1 card" }).click();
  const positiveOutcome = page
    .locator(".outcome-selector-group button:not([disabled])")
    .filter({ hasText: /\+\d/ })
    .first();
  await expect(positiveOutcome).toBeVisible();
  await positiveOutcome.click();
  await page.getByLabel("Stake in credits").fill("1000");
  await page.getByRole("button", { name: "Add to card" }).click();

  let droppedSealResponse = false;
  await page.route("**/l/*/card", async (route) => {
    if (
      !droppedSealResponse &&
      route.request().method() === "POST" &&
      route.request().headers()["next-action"]
    ) {
      await route.fetch();
      droppedSealResponse = true;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Confirm and seal card" }).click();
  await expect.poll(() => droppedSealResponse).toBe(true);
  await page.unroute("**/l/*/card");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "All 1,000 credits are sealed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /receipt/i }).first(),
  ).toBeVisible();

  await page.goto("/owner/rehearsal");
  let droppedAdvanceResponse = false;
  await page.route("**/owner/rehearsal", async (route) => {
    if (
      !droppedAdvanceResponse &&
      route.request().method() === "POST" &&
      route.request().headers()["next-action"]
    ) {
      await route.fetch();
      droppedAdvanceResponse = true;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  const guide = page.locator("[data-owner-rehearsal-guide]");
  await guide.getByRole("checkbox").check();
  await guide
    .getByRole("button", { name: "Lock cards and begin partial reveal" })
    .click();
  await expect.poll(() => droppedAdvanceResponse).toBe(true);
  await page.unroute("**/owner/rehearsal");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Watch event-timed reveal" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "See partial reveal" }).click();
  await expect(page.getByText("Future picks sealed")).toBeVisible();
  const partialHtml = await page.content();
  expect(partialHtml).not.toMatch(
    /position_receipts|market_snapshot_id|owner_rehearsal_bots/i,
  );
  await page.goto(`/l/${leagueSlug}/live`);
  await expect(page.locator(".broadcast-dark")).toBeVisible();
  await expect(
    page.getByText(
      "Owner rehearsal · Simulated data · Does not affect Live leagues",
    ),
  ).toBeVisible();
  await page.goto(`/l/${leagueSlug}/matchup`);
  await page.reload();
  await expect(page.getByText("Future picks sealed")).toBeVisible();

  await page.goto("/owner/rehearsal");
  await advance(page, "Finish games and show provisional result");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Understand result finality" }),
  ).toBeVisible();
  await advance(page, "Finalize Week 1");
  await advance(page, "Open Week 2");

  await page.getByRole("button", { name: "Use a sample card" }).click();
  await expect(page.getByRole("status").last()).toContainText(
    "The Week 2 quote changed",
  );
  await page.reload();
  await sample(page);
  await advance(page, "Finalize Week 2");
  await advance(page, "Run Weeks 3–4 and open Week 5");
  await sample(page);
  await advance(page, "Finalize Week 5");
  await advance(page, "Run Weeks 6–7 and open Week 8");
  await sample(page);
  await advance(page, "Show provisional Week 8 result");
  await advance(page, "Apply Week 8 correction");
  await page.getByRole("link", { name: "See corrected result" }).click();
  await expect(page.getByText(/Corrected/).first()).toBeVisible();
  await page.goto("/owner/rehearsal");
  await advance(page, "Finalize through Week 14");
  await sample(page);
  await advance(page, "Finalize Week 14 and playoff field");
  await advance(page, "Open Week 15 playoffs");
  await sample(page);
  await advance(page, "Finalize Week 15");
  await advance(page, "Open Week 16 semifinals");
  await sample(page);
  await advance(page, "Finalize Week 16");
  await advance(page, "Open Week 17 championship");
  await sample(page);
  await advance(page, "Finalize Week 17 champion");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Separate champion from exhibition" }),
  ).toBeVisible();
  await advance(page, "Open Week 18 exhibition");
  await sample(page);
  await advance(page, "Finish Week 18 and archive");
  await expect(
    page.getByRole("heading", { name: "Rehearsal complete" }),
  ).toBeVisible();

  const leagueLink = page.getByRole("link", { name: "Enter rehearsal" });
  await leagueLink.click();
  await expect(page.getByText("Season final").first()).toBeVisible();
  await expect(
    page.getByText(
      "Owner rehearsal · Simulated data · Does not affect Live leagues",
    ),
  ).toBeVisible();

  await page.goto("/owner/rehearsal");
  await page.getByText("Reset rehearsal", { exact: true }).click();
  await page
    .getByLabel("Type Sunday Ledger Owner Rehearsal to confirm")
    .fill("Sunday Ledger Owner Rehearsal");
  await page.getByRole("button", { name: "Reset simulated rehearsal" }).click();
  await expect(
    page.getByRole("heading", { name: "Practice one complete season" }),
  ).toBeVisible();
});
