import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type FixtureName =
  "CORRECTED" | "EMPTY" | "ERROR" | "HISTORY" | "PROVISIONAL" | "RIVALRY";

const fixtureMarkup = JSON.parse(
  readFileSync(
    resolve("tests/e2e/generated/phase7-memory-markup.json"),
    "utf8",
  ),
) as Record<FixtureName, string>;

async function mount(page: Page, fixture: FixtureName) {
  await page.evaluate((markup) => {
    document.body.innerHTML = markup;
  }, fixtureMarkup[fixture]);
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

test.beforeEach(async ({ page }) => {
  await page.route(/\/_next\/static\/chunks\/.*\.js(?:\?.*)?$/, (route) =>
    route.abort(),
  );
  await page.goto("/");
});

test("corrected close is mobile, keyboard, zoom, and reduced-motion safe", async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mount(page, "CORRECTED");
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });

  await expect(page.getByText("Corrected final")).toBeVisible();
  await expect(page.getByText("RecordBridge")).toBeVisible();
  const correction = page.getByText("Correction · Harbor Club at Lake Club");
  await correction.focus();
  await expect(correction).toBeFocused();
  expect(
    await correction.evaluate(
      (element) => getComputedStyle(element).outlineStyle,
    ),
  ).not.toBe("none");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Commissioner Morgan recorded/)).toBeVisible();
  await expect(page.getByText(/300.00/)).toBeVisible();
  expect(
    await correction.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).transitionDuration),
    ),
  ).toBeLessThanOrEqual(0.001);

  await expect(
    page.getByText(/Share result|Copy result|Public link/),
  ).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAccessibilityViolations(page);
});

test("provisional close states only supported cutline and preserves next access", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mount(page, "PROVISIONAL");

  await expect(
    page.getByTestId("weekly-close-module").getByText(/Provisional/),
  ).toBeVisible();
  await expect(page.getByText("Current stored playoff field")).toBeVisible();
  await expect(
    page.getByText(/not a clinch or elimination claim/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open final receipt in history" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Week 3: Devon Next" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("history and rivalry label every stored competition scope", async ({
  page,
}) => {
  await mount(page, "HISTORY");
  await expect(
    page.getByRole("heading", { name: "History ledger" }),
  ).toBeVisible();
  await expect(page.getByText("Official result receipt")).toBeVisible();

  await mount(page, "RIVALRY");
  await expect(
    page.getByText("Competitive H2H", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Regular season/).first()).toBeVisible();
  await expect(page.getByText(/Playoff/).last()).toBeVisible();
  await expect(page.getByText(/Placement/).last()).toBeVisible();
  await expect(page.getByText(/Exhibition/).last()).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});

test("empty and error states remain factual and recoverable", async ({
  page,
}) => {
  await mount(page, "EMPTY");
  await expect(
    page.getByRole("heading", { name: "No finalized matchups yet" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Return to current matchup" }),
  ).toBeVisible();

  await mount(page, "ERROR");
  await expect(
    page.getByRole("heading", {
      name: "We could not open this league page",
    }),
  ).toBeVisible();
  await expect(page.getByText(/league records are unchanged/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Return to Your leagues" }),
  ).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});
