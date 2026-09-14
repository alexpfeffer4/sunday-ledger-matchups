import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { unrevealableReceiptText } from "../fixtures/phase6-paired-matchup";

type FixtureName =
  | "FINAL"
  | "LIVE"
  | "LIVE_UPDATE"
  | "PARTIAL_REVEAL"
  | "PROVISIONAL"
  | "PREGAME"
  | "UNSEALED"
  | "OUTSTANDING"
  | "MOBILE_CARD";

const fixtureMarkup = JSON.parse(
  readFileSync(
    resolve("tests/e2e/generated/phase6-matchup-markup.json"),
    "utf8",
  ),
) as Record<FixtureName, string>;

async function mountMatchup(page: Page, fixture: FixtureName) {
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

test("remaining-return values align when metric labels wrap", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await mountMatchup(page, "LIVE");
  const tops = await page
    .locator(".score-path-facts dd")
    .evaluateAll((values) =>
      values.map((value) => value.getBoundingClientRect().top),
    );
  expect(tops).toHaveLength(4);
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: info.outputPath("aligned-score-path.png"),
    fullPage: true,
  });
});

test("outstanding totals stay paired and readable at 320px and 200% text", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mountMatchup(page, "OUTSTANDING");
  await expect(
    page.getByLabel("Alex Ledger outstanding picks and credits"),
  ).toContainText("2 picks outstanding");
  await expect(
    page.getByLabel("Jordan Rival outstanding picks and credits"),
  ).toContainText("600 credits outstanding");
  expect(await page.locator("body").innerHTML()).not.toContain(
    unrevealableReceiptText,
  );
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAccessibilityViolations(page);
  await page.screenshot({
    path: info.outputPath("outstanding-totals-mobile.png"),
    fullPage: true,
  });
  await page.locator("html").evaluate((element) => {
    element.style.fontSize = "200%";
  });
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAccessibilityViolations(page);
});

test("pregame shows only opponent submission status at a narrow width", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mountMatchup(page, "UNSEALED");
  await expect(page.getByLabel("Jordan Rival card status")).toContainText(
    "Not sealed",
  );
  await expect(
    page.getByRole("button", { name: "Refresh matchup" }),
  ).toBeVisible();
  await mountMatchup(page, "PREGAME");
  await expect(page.getByLabel("Jordan Rival card status")).toContainText(
    "Sealed",
  );
  await expect(
    page.getByRole("heading", { name: "Picks by game" }),
  ).toHaveCount(0);
  expect(await page.locator("body").innerHTML()).not.toContain(
    unrevealableReceiptText,
  );
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAccessibilityViolations(page);
  await page.screenshot({
    path: info.outputPath("opponent-sealed-320.png"),
    fullPage: true,
  });
});

test("My Card keeps signed odds on one line beside long titles", async ({
  page,
}, info) => {
  await mountMatchup(page, "MOBILE_CARD");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const scale of [100, 200]) {
      await page.locator("html").evaluate((element, value) => {
        element.style.fontSize = `${value}%`;
      }, scale);
      for (const value of ["−265", "+1234"]) {
        const odds = page.getByText(value, { exact: true }).first();
        await expect(odds).toBeVisible();
        const geometry = await odds.evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const box = element.getBoundingClientRect();
          const title = element.previousElementSibling!.getBoundingClientRect();
          return {
            lines: range.getClientRects().length,
            left: box.left,
            right: box.right,
            titleRight: title.right,
          };
        });
        expect(geometry.lines).toBe(1);
        expect(geometry.left).toBeGreaterThanOrEqual(geometry.titleRight);
        expect(geometry.right).toBeLessThanOrEqual(width);
      }
      await expectNoHorizontalOverflow(page);
      const screenshot = info.outputPath(`my-card-${width}-${scale}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      await info.attach(`my-card-${width}-${scale}`, {
        path: screenshot,
        contentType: "image/png",
      });
    }
  }
});

test("partial reveal keeps sealed receipt data out of DOM and accessible names", async ({
  page,
}) => {
  await mountMatchup(page, "PARTIAL_REVEAL");

  await expect(
    page.locator(".status-badge").filter({ hasText: "Partial reveal" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(
    "Partial reveal. Your score 200.00. Opponent score 0.00.",
  );
  const placeholder = page.getByTestId("future-sealed-placeholder");
  await expect(placeholder).toHaveCount(1);
  expect((await placeholder.boundingBox())?.height).toBeGreaterThanOrEqual(96);
  await expect(
    page.getByLabel(/Jordan Rival, Harbor Club at Lake Club/),
  ).toBeVisible();
  await expect(page.getByText(unrevealableReceiptText)).toHaveCount(0);
  await expect(
    page.locator(`[aria-label*="${unrevealableReceiptText}"]`),
  ).toHaveCount(0);
  expect(await page.locator("body").innerHTML()).not.toContain(
    unrevealableReceiptText,
  );
});

test("Live remains paired, mobile-safe, keyboard-visible, and reduced-motion safe", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mountMatchup(page, "LIVE");

  await expect(page.locator("main.broadcast-dark")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Alex Ledger versus Jordan Rival",
    }),
  ).toHaveCount(1);
  await expect(page.getByText("Live", { exact: true }).first()).toBeVisible();

  await page.keyboard.press("Tab");
  const refresh = page.getByRole("button", { name: "Refresh matchup" });
  await expect(refresh).toBeFocused();
  expect(
    await refresh.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).not.toBe("none");
  const transitionSeconds = await refresh.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).transitionDuration),
  );
  expect(transitionSeconds).toBeLessThanOrEqual(0.001);

  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAccessibilityViolations(page);
});

test("stored Live updates preserve identity and progress to provisional and final", async ({
  page,
}) => {
  await mountMatchup(page, "LIVE");
  const identityHeadings = page.locator(
    '[aria-labelledby="paired-matchup-heading"] h2:not(.sr-only)',
  );
  await expect(identityHeadings).toHaveCount(2);
  const initialNames = await identityHeadings.allTextContents();

  await mountMatchup(page, "LIVE_UPDATE");
  await expect(
    page.getByLabel("Alex Ledger score 200.00 credits"),
  ).toBeVisible();
  expect(
    await page
      .locator('[aria-labelledby="paired-matchup-heading"] h2:not(.sr-only)')
      .allTextContents(),
  ).toEqual(initialNames);
  await expect(page.locator('[data-position-id$="13"]')).toBeVisible();

  await mountMatchup(page, "PROVISIONAL");
  await expect(
    page.getByText("Picks settled", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByLabel("Alex Ledger score 400.00 credits"),
  ).toBeVisible();

  await mountMatchup(page, "FINAL");
  await expect(page.getByText("Final", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByLabel("Jordan Rival score 200.00 credits"),
  ).toBeVisible();
});
