import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fixture = JSON.parse(
  readFileSync(
    resolve("tests/e2e/generated/phase8b-finality-markup.json"),
    "utf8",
  ),
) as Record<string, string>;

const states = [
  "championFinal",
  "week18Open",
  "frozenPairing",
  "correctedChampion",
  "finalArchive",
] as const;

for (const state of states) {
  for (const width of [390, 320]) {
    test(`${state} is accessible and reflows at ${width}px`, async ({
      page,
    }) => {
      await page.route(/\/_next\/static\/chunks\/.*\.js(?:\?.*)?$/, (route) =>
        route.abort(),
      );
      await page.goto("/");
      await page.evaluate((markup) => {
        document.body.innerHTML = markup;
      }, fixture[state]);
      await page.setViewportSize({ width, height: 900 });

      await expect(page.getByText(/is champion/).first()).toBeVisible();
      const audit = page.locator("details").last().locator("summary");
      await audit.focus();
      await expect(audit).toBeFocused();
      await page.keyboard.press("Enter");

      const accessibility = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(accessibility.violations).toEqual([]);

      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(
        dimensions.clientWidth,
      );
      await expect(
        page.getByText(/CHAMPION_FINAL|WEEK_18_EXHIBITION|schemaVersion/i),
      ).toHaveCount(0);
      await expect(
        page.getByText(/sealed count|stake|proposition|returned|geometry/i),
      ).toHaveCount(0);
    });
  }
}

test("Week 18 and correction states retain their required meaning", async ({
  page,
}) => {
  await page.route(/\/_next\/static\/chunks\/.*\.js(?:\?.*)?$/, (route) =>
    route.abort(),
  );
  await page.goto("/");
  await page.evaluate((markup) => {
    document.body.innerHTML = markup;
  }, fixture.week18Open);
  await expect(
    page.getByText("Pairing remains replaceable until the first card seals"),
  ).toBeVisible();
  await expect(
    page.getByText(/no effect on champion, standings, or eligibility/i),
  ).toBeVisible();

  await page.evaluate((markup) => {
    document.body.innerHTML = markup;
  }, fixture.correctedChampion);
  await expect(page.getByText(/Ledger Member 2 is champion/i)).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Champion correction" })
      .getByText(/superseded and retained/i),
  ).toBeVisible();
  await expect(
    page.getByText("Pairing frozen · protected from later corrections"),
  ).toBeVisible();

  await page.evaluate((markup) => {
    document.body.innerHTML = markup;
  }, fixture.finalArchive);
  await expect(
    page.getByText(/complete Weeks 1–18 archive are final/i),
  ).toBeVisible();
  const finalWeek18 = page
    .locator("article")
    .filter({ has: page.getByText("Week 18", { exact: true }) });
  await expect(finalWeek18.getByText("Exhibition miss · 0")).toBeVisible();
});

test("the final archive remains usable at 200% text zoom", async ({ page }) => {
  await page.route(/\/_next\/static\/chunks\/.*\.js(?:\?.*)?$/, (route) =>
    route.abort(),
  );
  await page.goto("/");
  await page.evaluate((markup) => {
    document.body.innerHTML = markup;
    document.documentElement.style.fontSize = "200%";
  }, fixture.finalArchive);
  await page.setViewportSize({ width: 320, height: 900 });

  await expect(
    page.getByText(/complete Weeks 1–18 archive are final/i),
  ).toBeVisible();
  const dimensions = await page.evaluate(() => {
    const clientWidth = document.documentElement.clientWidth;
    const offenders = Array.from(
      document.body.querySelectorAll<HTMLElement>("*"),
    )
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          bounds: {
            left: Math.round(bounds.left),
            right: Math.round(bounds.right),
            width: Math.round(bounds.width),
          },
          className: element.className,
          tag: element.tagName.toLowerCase(),
          text: element.textContent?.trim().slice(0, 80),
        };
      })
      .filter(
        (element) =>
          element.bounds.left < -0.5 ||
          element.bounds.right > clientWidth + 0.5,
      )
      .sort((left, right) => right.bounds.right - left.bounds.right)
      .slice(0, 8);

    return {
      clientWidth,
      offenders,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  expect(
    dimensions.scrollWidth,
    JSON.stringify(dimensions.offenders, null, 2),
  ).toBeLessThanOrEqual(dimensions.clientWidth);
});
