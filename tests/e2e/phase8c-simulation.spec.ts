import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fixture = JSON.parse(
  readFileSync(
    resolve("tests/e2e/generated/phase8c-simulation-markup.json"),
    "utf8",
  ),
) as { matchup: string; sealedMatchup: string };

for (const viewport of [
  { name: "desktop", width: 1280, height: 900 },
  { name: "390px", width: 390, height: 844 },
  { name: "320px", width: 320, height: 844 },
]) {
  test(`authoritative Simulation reuses the participant matchup at ${viewport.name}`, async ({
    browserName,
    page,
  }) => {
    await page.route(/\/_next\/static\/chunks\/.*\.js(?:\?.*)?$/, (route) =>
      route.abort(),
    );
    await page.emulateMedia({
      forcedColors: browserName === "chromium" ? "active" : undefined,
      reducedMotion: "reduce",
    });
    await page.goto("/");
    await page.evaluate((markup) => {
      document.body.innerHTML = markup;
    }, fixture.matchup);
    await page.setViewportSize(viewport);

    await expect(page.getByText(/Simulation/).first()).toBeVisible();
    await expect(page.getByText("Final").first()).toBeVisible();
    await expect(page.getByText(/Practice|Example Season/)).toHaveCount(0);
    await expect(page.getByText(/SECRET FUTURE OPPONENT PICK/)).toHaveCount(0);
    const focusTarget = page.locator("a, button, summary").first();
    await focusTarget.focus();
    await expect(focusTarget).toBeFocused();

    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

    await page.evaluate((markup) => {
      document.body.innerHTML = markup;
    }, fixture.sealedMatchup);
    const sealed = page.getByTestId("future-sealed-placeholder");
    await expect(sealed).toBeVisible();
    await expect(sealed).not.toContainText(
      /sealed count|stake|proposition|returned|geometry/i,
    );
    await expect(page.getByText(/SECRET FUTURE OPPONENT PICK/)).toHaveCount(0);
  });
}
