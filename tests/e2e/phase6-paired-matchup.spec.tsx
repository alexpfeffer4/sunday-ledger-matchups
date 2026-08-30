import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PairedMatchupDto } from "@/application/queries/project-paired-matchup";
import { PairedMatchupView } from "@/components/matchup/paired-matchup-view";
import {
  makePhase6LiveUpdate,
  makePhase6Matchup,
  unrevealableReceiptText,
} from "../fixtures/phase6-paired-matchup";

function matchupMarkup(matchup: PairedMatchupDto): string {
  return renderToStaticMarkup(
    createElement(PairedMatchupView, {
      matchup,
      refreshControl: createElement(
        "button",
        {
          className:
            "bg-registry text-canvas min-h-11 rounded-lg px-4 text-sm font-semibold",
          type: "button",
        },
        "Refresh matchup",
      ),
    }),
  );
}

async function mountMatchup(page: Page, matchup: PairedMatchupDto) {
  await page.evaluate((markup) => {
    document.body.innerHTML = markup;
  }, matchupMarkup(matchup));
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
  await page.goto("/");
});

test("partial reveal keeps sealed receipt data out of DOM and accessible names", async ({
  page,
}) => {
  await mountMatchup(page, makePhase6Matchup("PARTIAL_REVEAL"));

  await expect(page.getByText("Partial reveal")).toBeVisible();
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
  await mountMatchup(page, makePhase6Matchup("LIVE"));

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
  await mountMatchup(page, makePhase6Matchup("LIVE"));
  const initialNames = await page
    .locator('[aria-labelledby="paired-matchup-heading"] h2:not(.sr-only)')
    .allTextContents();

  await mountMatchup(page, makePhase6LiveUpdate());
  await expect(
    page.getByLabel("Alex Ledger score 200.00 credits"),
  ).toBeVisible();
  expect(
    await page
      .locator('[aria-labelledby="paired-matchup-heading"] h2:not(.sr-only)')
      .allTextContents(),
  ).toEqual(initialNames);
  await expect(page.locator('[data-position-id$="13"]')).toBeVisible();

  await mountMatchup(page, makePhase6Matchup("PROVISIONAL"));
  await expect(
    page.getByText("Provisional", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByLabel("Alex Ledger score 400.00 credits"),
  ).toBeVisible();

  await mountMatchup(page, makePhase6Matchup("FINAL"));
  await expect(page.getByText("Final", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByLabel("Jordan Rival score 200.00 credits"),
  ).toBeVisible();
});
