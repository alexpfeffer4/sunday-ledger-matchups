import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";

test("commissioner summary, exception links and keyboard disclosures reflow on desktop and narrow mobile", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const external: string[] = [];
  page.on("request", (r) => {
    if (!new URL(r.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))
      external.push(new URL(r.url()).hostname);
  });
  await page.goto("/preview/commissioner");
  await expect(
    page.getByRole("heading", { name: "Commissioner", exact: true }),
  ).toBeVisible();
  const observations = [];
  for (const [width, size] of [
    [1440, 100],
    [390, 100],
    [320, 200],
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      (size) => (document.documentElement.style.fontSize = `${size}%`),
      size,
    );
    const dimensions = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      headingY:
        document.querySelector("h1")!.getBoundingClientRect().top + scrollY,
      summaryY:
        document
          .querySelector("#commissioner-operating-summary")!
          .getBoundingClientRect().top + scrollY,
      openGroups: document.querySelectorAll(
        '[aria-labelledby="player-menu-heading"] details[open]',
      ).length,
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
    expect(dimensions.headingY).toBeLessThan(dimensions.summaryY);
    expect(dimensions.openGroups).toBe(0);
    observations.push({ textPercent: size, ...dimensions });
    await page.screenshot({
      path: `test-results/ui1-healthy-${info.project.name}-${width}-${size}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("link", { name: "View player details" }).click();
  await expect(page.locator("#commissioner-recovery")).toHaveAttribute(
    "open",
    "",
  );
  const menuSummary = page.locator("#player-menu > summary");
  await expect(menuSummary).toBeFocused();
  await menuSummary.press("Enter");
  await expect(page.locator("#player-menu")).not.toHaveAttribute("open", "");
  await menuSummary.press("Enter");
  await expect(page.locator("#player-menu")).toHaveAttribute("open", "");
  const game = page
    .locator('[aria-labelledby="player-menu-heading"] details > summary')
    .first();
  await game.focus();
  await game.press("Enter");
  await expect(
    page.locator('[aria-labelledby="player-menu-heading"] details[open]'),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Refresh full-slate player lines" })
    .click();
  await expect(page.getByRole("status")).toContainText("Fixture only");
  await page
    .getByRole("link", { name: "Season settings", exact: true })
    .click();
  await expect(
    page.getByText(/Current-week quotes, scores, player results/),
  ).toBeVisible();
  for (const state of [
    "Suspended",
    "Worker unavailable",
    "Readiness missing",
    "Status unavailable",
    "Provider data missing",
    "Retry scheduled",
    "Paused",
    "Revoked",
    "Scheduled opening",
    "Manual league",
    "Postseason",
  ]) {
    await page.getByLabel("Preview state").selectOption(state);
    if (
      [
        "Suspended",
        "Worker unavailable",
        "Readiness missing",
        "Status unavailable",
      ].includes(state)
    ) {
      await expect(
        page.getByRole("heading", { name: "No action needed now" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "Needs attention", exact: true }),
      ).toBeVisible();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByLabel("Preview state").selectOption("Healthy waiting");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  mkdirSync("acceptance-reports", { recursive: true });
  writeFileSync(
    `acceptance-reports/ui1-presentation-${info.project.name}.json`,
    JSON.stringify(
      { browser: info.project.name, observations, errors, external },
      null,
      2,
    ),
  );
});
