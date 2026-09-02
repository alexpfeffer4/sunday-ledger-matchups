import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const markup = JSON.parse(
  readFileSync(resolve("tests/e2e/generated/phase11-markup.json"), "utf8"),
) as Record<
  "identity" | "invitation" | "receipt" | "routeStates" | "shell",
  string
>;

async function loadMarkup(page: Page, html: string) {
  await page.route(/\/_next\/static\/chunks\/.*\.js(?:\?.*)?$/, (route) =>
    route.abort(),
  );
  await page.goto("/");
  await page.evaluate((content) => {
    document.body.innerHTML = content;
  }, html);
}

async function expectNoPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

test("approved lockups and all six optical sizes render in a real browser", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await loadMarkup(page, markup.identity);

  const horizontal = page.locator('[data-brand-lockup="horizontal"]').first();
  const compact = page.locator('[data-brand-lockup="compact"]');
  await expect(horizontal).toBeVisible();
  await expect(compact).toBeVisible();
  expect(
    (await horizontal.locator("svg").boundingBox())!.width,
  ).toBeGreaterThanOrEqual(132);
  expect(
    (await compact.locator("svg").boundingBox())!.width,
  ).toBeGreaterThanOrEqual(96);

  for (const size of [16, 20, 24, 32, 48, 64]) {
    const box = await page
      .locator(`[data-test-size="${size}"] svg`)
      .boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeCloseTo(size, 0);
    expect(box!.height).toBeCloseTo(size, 0);
  }

  const favicon = page.getByAltText("Sunday Ledger browser icon at 16 pixels");
  await expect(favicon).toBeVisible();
  expect((await favicon.boundingBox())!.width).toBe(16);
  await expectNoPageOverflow(page);

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test("public and authentication identity remains responsive", async ({
  page,
}) => {
  for (const [path, heading] of [
    ["/", "Build your card. Beat your matchup."],
    ["/auth/sign-in", "Sign in"],
    ["/auth/create-account", "Create account"],
    ["/auth/recover", "Choose a new password"],
  ] as const) {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(path);
    await expect(
      page.locator('[data-brand-lockup="horizontal"]').first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: heading }).first(),
    ).toBeVisible();
    await expectNoPageOverflow(page);
  }
});

test("client-side route changes move focus to the new page heading", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(
    () => document.documentElement.dataset.routeFocusReady === "true",
  );
  await page.getByRole("link", { name: "Rules", exact: true }).last().click();

  const heading = page.getByRole("heading", { name: "Season 1 rules" });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
});

test("shell, invitation, receipt cue, and route states preserve identity hierarchy", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loadMarkup(page, markup.shell);
  await expect(
    page.locator("aside").getByText("Sunday Ledger").first(),
  ).toBeAttached();
  await expect(
    page
      .getByText("The Extraordinarily Long Sunday Ledger Clubhouse Association")
      .first(),
  ).toBeVisible();
  await expect(page.locator("main.broadcast-dark")).toBeVisible();
  await expect(
    page.locator("main.broadcast-dark [data-brand-lockup]"),
  ).toBeVisible();
  await expectNoPageOverflow(page);

  await page.setViewportSize({ width: 390, height: 1000 });
  await loadMarkup(page, markup.invitation);
  await expect(
    page.getByRole("heading", {
      name: "The Extraordinarily Long Sunday Ledger Clubhouse Association",
    }),
  ).toBeVisible();
  await expect(page.locator('[data-optical-master="compact"]')).toBeVisible();
  await expectNoPageOverflow(page);

  await loadMarkup(page, markup.receipt);
  const cue = page.getByText("Sunday Ledger receipt");
  const receiptHeading = page.getByRole("heading", { name: "Accepted pick" });
  await expect(cue).toBeVisible();
  await expect(receiptHeading).toBeVisible();
  expect((await cue.boundingBox())!.y).toBeLessThan(
    (await receiptHeading.boundingBox())!.y,
  );
  expect(
    await cue.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize),
    ),
  ).toBeLessThan(
    await receiptHeading.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize),
    ),
  );

  await loadMarkup(page, markup.routeStates);
  await expect(page.locator('[data-brand-lockup="horizontal"]')).toHaveCount(3);
  await expect(
    page.getByRole("heading", { name: "Opening the Ledger…" }),
  ).toBeVisible();
});

test("currentColor survives forced colors, 200% text, and narrow reflow", async ({
  browserName,
  page,
}) => {
  test.skip(
    browserName !== "chromium",
    "Forced-colors emulation is Chromium evidence",
  );
  await page.setViewportSize({ width: 320, height: 900 });
  await loadMarkup(page, markup.identity);
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });

  const mark = page.locator('[data-optical-master="micro"] path').first();
  await expect(mark).toBeVisible();
  expect(
    await mark.evaluate((element) => getComputedStyle(element).fill),
  ).not.toBe("none");
  await expectNoPageOverflow(page);
});

test("framework metadata exposes the approved platform and social assets", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.locator('link[rel="icon"][href*="favicon.ico"]'),
  ).toHaveCount(1);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);

  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const webManifest = await manifestResponse.json();
  expect(webManifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192", purpose: "any" }),
      expect.objectContaining({ sizes: "512x512", purpose: "any" }),
      expect.objectContaining({ sizes: "192x192", purpose: "maskable" }),
      expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
      expect.objectContaining({ sizes: "512x512", purpose: "monochrome" }),
    ]),
  );

  for (const path of [
    "/favicon.ico",
    "/icon.svg",
    "/apple-icon.png",
    "/identity/launcher-192.png",
    "/identity/launcher-512.png",
    "/identity/maskable-192.png",
    "/identity/maskable-512.png",
    "/identity/monochrome-512.png",
    "/opengraph-image.png",
  ]) {
    expect((await request.get(path)).ok(), `${path} should load`).toBe(true);
  }

  const icon = await (await request.get("/icon.svg")).text();
  expect(icon).toContain("Sunday Ledger Register icon");
  expect(icon).not.toMatch(/proposed|not owner approved|not for production/i);

  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
    "content",
    /virtual credits.*no cash wagering/i,
  );
});
