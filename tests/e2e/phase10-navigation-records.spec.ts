import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const markup = JSON.parse(
  readFileSync(resolve("tests/e2e/generated/phase10-markup.json"), "utf8"),
) as Record<"matchup" | "schedule" | "standings", string>;

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

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`stable navigation and dense records reflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    await loadMarkup(page, markup.matchup);

    if (width < 1024) {
      const mobile = page.getByRole("navigation", {
        name: "Mobile league navigation",
      });
      await expect(mobile).toBeVisible();
      await expect(mobile.getByRole("link")).toHaveCount(4);
      await expect(mobile.getByRole("button", { name: "More" })).toBeVisible();
      const labels = await mobile
        .locator(":scope > ul > li")
        .evaluateAll((items) =>
          items.map((item) =>
            item
              .querySelector(":scope > a, :scope > div > button")
              ?.textContent?.trim(),
          ),
        );
      expect(labels).toEqual([
        "Matchup",
        "Make picks",
        "My Card",
        "League",
        "More",
      ]);
      const destinations = mobile.locator(
        ":scope > ul > li > a, :scope > ul > li > div > button",
      );
      for (const destination of await destinations.all()) {
        const box = await destination.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeGreaterThanOrEqual(48);
      }
      const tray = page.getByRole("region", { name: "Working card" });
      const trayBox = await tray.boundingBox();
      const navBox = await mobile.boundingBox();
      expect(trayBox!.y + trayBox!.height).toBeLessThanOrEqual(navBox!.y);
    } else {
      const desktop = page.getByRole("navigation", {
        name: "League navigation",
      });
      await expect(desktop).toBeVisible();
      await expect(
        page.getByRole("navigation", { name: "Mobile league navigation" }),
      ).toBeHidden();
      const railWidth = (await desktop
        .locator("xpath=ancestor::aside")
        .boundingBox())!.width;
      expect(railWidth).toBeGreaterThanOrEqual(width >= 1280 ? 224 : 70);
      expect(railWidth).toBeLessThanOrEqual(width >= 1280 ? 236 : 74);
    }

    await expect(page.locator("main.broadcast-dark")).toBeVisible();
    await expect(page.locator("header.broadcast-dark")).toHaveCount(0);
    await expectNoPageOverflow(page);
  });
}

test("secondary navigation, mobile rows, text scaling, and reduced motion remain accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 960 });
  await loadMarkup(page, markup.standings);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });

  const sections = page.getByRole("navigation", { name: "League sections" });
  await expect(
    sections.getByRole("link", { name: "Standings" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("You").first()).toBeVisible();
  await expect(page.getByText("Points For").first()).toBeVisible();
  await expect(page.getByText("Vs. league").first()).toBeVisible();
  await expect(page.getByText("Incomplete weeks").first()).toBeVisible();
  await expect(page.getByText("Playoff line").first()).toBeVisible();
  await expectNoPageOverflow(page);

  const focusTarget = sections.getByRole("link", { name: "Standings" });
  await focusTarget.focus();
  await expect(focusTarget).toBeFocused();
  expect(
    await focusTarget.evaluate(
      (element) => getComputedStyle(element).outlineStyle,
    ),
  ).not.toBe("none");

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test("selected-week schedule reflows at the 320px equivalent of 400% zoom", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 960 });
  await loadMarkup(page, markup.schedule);
  await page.emulateMedia({ reducedMotion: "reduce" });

  await expect(page.getByLabel("Selected week")).toBeVisible();
  const selectedSchedule = page.getByRole("region", {
    name: "Week 18 · Exhibition",
  });
  await expect(
    selectedSchedule.getByText("Week 18 exhibition", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Exhibition miss · Archive final · Archived"),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /Week 18/ })).toHaveCount(1);
  await expectNoPageOverflow(page);

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});
