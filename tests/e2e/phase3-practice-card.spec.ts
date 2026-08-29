import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

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

async function addPick(page: Page, outcomeName: string, stake: string) {
  const trigger = page.getByRole("button", { name: outcomeName }).first();
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Stake in credits").fill(stake);
  await dialog.getByRole("button", { name: "Add to card" }).click();
  await expect(dialog).not.toBeVisible();
}

test("public Practice is factual, unsaved, accessible, and usable at 320 px", async ({
  page,
}) => {
  const competitiveRequests: string[] = [];
  page.on("request", (request) => {
    if (/supabase|\/rest\/v1|\/rpc\//i.test(request.url())) {
      competitiveRequests.push(request.url());
    }
  });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/practice");

  await expect(page).toHaveURL(/\/practice$/);
  await expect(page).toHaveTitle(/Practice Week/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Build a practice card" }),
  ).toBeVisible();
  await expect(page.getByText("Practice · Unsaved")).toBeVisible();
  await expect(
    page.getByText(/not saved and cannot affect a league/i),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Start a real league" }),
  ).toHaveAttribute("href", "/auth/create-account?next=%2Fleagues");
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/auth/sign-in?next=%2Fleagues",
  );
  expect(competitiveRequests).toEqual([]);

  const compactColumns = await page
    .getByRole("group", {
      name: "Harbor Club at Lake Club Winner",
    })
    .locator(".outcome-selector-grid")
    .evaluate(
      (element) =>
        getComputedStyle(element).gridTemplateColumns.split(" ").length,
    );
  expect(compactColumns).toBe(1);

  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAccessibilityViolations(page);

  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const trigger = page
    .getByRole("button", { name: "Harbor Club −185" })
    .first();
  await trigger.click();
  const dialog = page.getByRole("dialog");
  const close = dialog.getByRole("button", { name: "Close pick editor" });
  await expect(close).toBeVisible();
  await dialog
    .getByRole("button", { name: "Add to card" })
    .scrollIntoViewIfNeeded();
  await expect(
    dialog.getByRole("button", { name: "Add to card" }),
  ).toBeVisible();
  await close.click();
  await expect(trigger).toBeFocused();
});

test("390 px Practice completes validation, review, reconciliation, and receipt handoff", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/practice");

  const standardColumns = await page
    .getByRole("group", {
      name: "Harbor Club at Lake Club Winner",
    })
    .locator(".outcome-selector-grid")
    .evaluate(
      (element) =>
        getComputedStyle(element).gridTemplateColumns.split(" ").length,
    );
  expect(standardColumns).toBe(2);

  const favoriteTrigger = page
    .getByRole("button", { name: "Capital Club −205" })
    .first();
  await favoriteTrigger.click();
  const editor = page.getByRole("dialog");
  const stake = editor.getByLabel("Stake in credits");
  await stake.fill("1000");
  await editor.getByRole("button", { name: "Add to card" }).click();
  await expect(editor.getByRole("alert")).toContainText("at most 750 credits");
  await expect(stake).toBeFocused();
  await editor.getByRole("button", { name: "Close pick editor" }).click();
  await expect(favoriteTrigger).toBeFocused();

  await addPick(page, "Harbor Club −185", "500");
  await addPick(page, "River Club +175", "250");
  await addPick(page, "Under 42.5 −110", "250");

  const tray = page.getByRole("region", { name: "Working card" });
  await expect(tray).toContainText("3 picks · 1,000 allocated");
  const trayBox = await tray.boundingBox();
  expect(trayBox).not.toBeNull();
  expect((trayBox?.y ?? 0) + (trayBox?.height ?? 0)).toBeLessThanOrEqual(844);
  await tray.getByRole("button", { name: "Review card" }).click();

  await expect(
    page.getByRole("heading", { name: "Review your complete card" }),
  ).toBeVisible();
  await expect(page.getByText("−185 → −190")).toBeVisible();
  await page.getByRole("button", { name: "Use updated odds" }).click();
  await page.getByRole("button", { name: "Confirm and seal card" }).click();

  await expect(
    page.getByRole("heading", { name: "Your practice card is sealed" }),
  ).toBeVisible();
  await expect(page.getByText(/Practice receipt 01/)).toBeVisible();
  await expect(
    page.getByText(/Accepted together with the complete card/).first(),
  ).toBeVisible();
  await expect(page.getByText("Harbor Club −3.5")).toHaveCount(0);
  await expect(page.getByText("Capital Club")).toHaveCount(0);
  await expect(page.getByText("Over 42.5")).toHaveCount(0);
  expect(pageErrors).toEqual([]);

  await page.reload();
  await expect(page.getByText(/Practice receipt 01/)).toHaveCount(0);
  await expect(page.getByText("0 used · 1,000 left")).toBeVisible();
});
