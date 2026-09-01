import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const phase8a = JSON.parse(
  readFileSync(
    resolve("tests/e2e/generated/phase8a-playoff-markup.json"),
    "utf8",
  ),
) as { PLAYOFFS: string };
const phase8b = JSON.parse(
  readFileSync(
    resolve("tests/e2e/generated/phase8b-finality-markup.json"),
    "utf8",
  ),
) as Record<string, string>;
const phase8c = JSON.parse(
  readFileSync(
    resolve("tests/e2e/generated/phase8c-simulation-markup.json"),
    "utf8",
  ),
) as { matchup: string; sealedMatchup: string };

const surfaces = [
  ["qualification", phase8a.PLAYOFFS],
  ["champion final", phase8b.championFinal!],
  ["Week 18", phase8b.week18Open!],
  ["corrected champion", phase8b.correctedChampion!],
  ["final archive, history, and rivalry", phase8b.finalArchive!],
  ["authoritative Simulation", phase8c.matchup],
] as const;

async function loadMarkup(page: Page, markup: string) {
  await page.route(/\/_next\/static\/chunks\/.*\.js(?:\?.*)?$/, (route) =>
    route.abort(),
  );
  await page.goto("/");
  await page.evaluate((content) => {
    document.body.innerHTML = content;
  }, markup);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

for (const [name, markup] of surfaces) {
  test(`${name} supports 200% text without hidden horizontal content`, async ({
    page,
  }) => {
    await loadMarkup(page, markup);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });

    await expectNoHorizontalOverflow(page);
    const focusTarget = page.locator("a, button, summary").first();
    await focusTarget.focus();
    await expect(focusTarget).toBeFocused();
  });

  test(`${name} reflows at the 320 CSS-pixel equivalent of 400% zoom`, async ({
    browserName,
    page,
  }) => {
    await loadMarkup(page, markup);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.emulateMedia({
      forcedColors: browserName === "chromium" ? "active" : undefined,
      reducedMotion: "reduce",
    });

    await expectNoHorizontalOverflow(page);
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  });
}

test("sealed Simulation opponent content exposes no hidden fields", async ({
  page,
}) => {
  await loadMarkup(page, phase8c.sealedMatchup);
  await page.setViewportSize({ width: 320, height: 900 });

  const sealed = page.getByTestId("future-sealed-placeholder");
  await expect(sealed).toBeVisible();
  await expect(sealed).not.toContainText(
    /sealed count|stake|proposition|returned|geometry/i,
  );
  await expect(page.getByText(/SECRET FUTURE OPPONENT PICK/)).toHaveCount(0);
});
