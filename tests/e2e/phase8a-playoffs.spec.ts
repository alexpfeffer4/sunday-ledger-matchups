import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fixture = JSON.parse(
  readFileSync(
    resolve("tests/e2e/generated/phase8a-playoff-markup.json"),
    "utf8",
  ),
) as { PLAYOFFS: string };

test.beforeEach(async ({ page }) => {
  await page.route(/\/_next\/static\/chunks\/.*\.js(?:\?.*)?$/, (route) =>
    route.abort(),
  );
  await page.goto("/");
  await page.evaluate((markup) => {
    document.body.innerHTML = markup;
  }, fixture.PLAYOFFS);
});

for (const width of [390, 320]) {
  test(`Phase 8A playoff facts reflow accessibly at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByText(
        "Reinstated to complete the four-member championship field",
      ),
    ).toBeVisible();
    await expect(page.getByText("Vacant").first()).toBeVisible();
    await expect(page.getByText("Exhibition miss · 0")).toBeVisible();
    const bracketVersion = page.getByText("Effective bracket version");
    const publicationAudit = page
      .locator("details")
      .filter({ has: bracketVersion });
    const audit = publicationAudit.locator("summary");
    await audit.focus();
    await expect(audit).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(bracketVersion).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await expect(
      page.getByText(/sealed count|stake|proposition|returned|geometry/i),
    ).toHaveCount(0);
  });
}
