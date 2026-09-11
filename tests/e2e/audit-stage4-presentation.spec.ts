import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const fixtures = JSON.parse(
  readFileSync(resolve("tests/e2e/generated/audit-stage4-markup.json"), "utf8"),
) as Record<string, string>;
for (const [name, markup] of Object.entries(fixtures)) {
  test(`${name} reflows with readable contrast at narrow and desktop widths`, async ({
    page,
  }) => {
    await page.route(/\/_next\/static\/chunks\/.*\.js(?:\?.*)?$/, (r) =>
      r.abort(),
    );
    await page.goto("/");
    await page.evaluate((m) => {
      document.body.innerHTML = m;
    }, markup);
    for (const [width, textSize] of [
      [390, 100],
      [320, 200],
      [1440, 100],
    ]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = `${size}%`;
      }, textSize);
      const dimensions = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(
        dimensions.scroll,
        `${name} at ${width}px/${textSize}%`,
      ).toBeLessThanOrEqual(dimensions.client);
      const brokenNumbers = await page
        .locator(".standings-value, .paired-scores [aria-label]")
        .filter({ visible: true })
        .evaluateAll((elements) =>
          elements
            .filter((element) => {
              const range = document.createRange();
              range.selectNodeContents(element);
              return (
                new Set(
                  Array.from(range.getClientRects()).map((rect) =>
                    Math.round(rect.top),
                  ),
                ).size > 1
              );
            })
            .map((element) => element.textContent),
        );
      expect(
        brokenNumbers,
        `Complete numbers at ${width}px/${textSize}%`,
      ).toEqual([]);
      if (name === "standings" && textSize === 200) {
        const label = page.locator(".standings-metric-label").first();
        await expect(label).toHaveCSS("clip-path", "none");
        await expect(label).toHaveCSS("position", "static");
      }
    }
    const a11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(a11y.violations).toEqual([]);
    if (name === "standings") {
      const headers = page.getByRole("columnheader");
      await expect(headers.filter({ hasText: "Points For" })).toHaveCSS(
        "text-align",
        "right",
      );
      await expect(
        page
          .getByText("Playoff line", { exact: true })
          .filter({ visible: true }),
      ).toHaveCount(1);
    } else if (
      [
        "ordinary",
        "sparse",
        "unavailable",
        "nonqualifier",
        "four",
        "playoffTie",
      ].includes(name)
    ) {
      const primary = page.locator("#your-playoff-contest");
      await expect(primary).toBeVisible();
      if (name === "playoffTie")
        await expect(
          page.getByText(/The higher qualification seed advances an exact tie/),
        ).toBeVisible();
      if (name === "unavailable")
        await expect(
          page.getByRole("button", { name: "Refresh playoffs" }),
        ).toBeVisible();
      const audit = page
        .locator("details")
        .filter({ has: page.getByText("Effective bracket version") })
        .locator("summary");
      await audit.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByText("Effective bracket version")).toBeVisible();
    } else if (name === "prequalification") {
      await expect(
        page.getByRole("link", { name: "View standings" }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole("heading", { name: /You won|You lost|You tied/ }),
      ).toHaveCount(1);
      await expect(
        page.getByRole("heading", { name: "Remaining", exact: true }),
      ).toHaveCount(0);
      if (name === "corrected") {
        const correction = page.getByText(
          "Correction · Harbor Club at Lake Club",
        );
        await correction.focus();
        await page.keyboard.press("Enter");
        await expect(
          page.getByText(/Commissioner Morgan recorded/),
        ).toBeVisible();
      }
    }
  });
}
