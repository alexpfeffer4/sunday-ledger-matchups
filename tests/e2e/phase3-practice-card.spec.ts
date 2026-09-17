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
  await expect(dialog).toContainText("Total returned if won");
  await dialog.getByRole("button", { name: "Add to card" }).click();
  await expect(dialog).not.toBeVisible();
}

test("editor keeps its close, return and action inside a shortened visual viewport", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Deterministic geometry regression; the real iOS keyboard still needs a
  // device check because WebKit automation does not display its accessory bar.
  await page.addInitScript(() => {
    const viewport = Object.assign(new EventTarget(), {
      height: 844,
      offsetTop: 0,
    });
    Object.defineProperty(window, "visualViewport", {
      value: viewport,
      configurable: true,
    });
  });
  await page.goto("/practice");
  const trigger = page
    .getByRole("button", { name: "Harbor Club −185" })
    .first();
  await trigger.click();
  const dialog = page.getByRole("dialog");
  const stake = dialog.getByLabel("Stake in credits");
  await stake.fill("250");
  for (const textSize of [100, 200]) {
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = `${size}%`;
      const viewport = window.visualViewport!;
      Object.assign(viewport, { height: 400, offsetTop: 64 });
      viewport.dispatchEvent(new Event("resize"));
      viewport.dispatchEvent(new Event("scroll"));
    }, textSize);
    await expect(dialog).toHaveAttribute("data-compact-viewport", "true");
    await expect(stake).toHaveValue("250");
    for (const control of [
      dialog.getByRole("button", { name: "Close pick editor" }),
      dialog.getByRole("group", { name: "Return if this pick wins" }),
      dialog.getByRole("button", { name: "Add to card" }),
    ]) {
      await expect(control).toBeVisible();
      const rect = await control.boundingBox();
      expect(rect!.y).toBeGreaterThanOrEqual(64);
      expect(rect!.y + rect!.height).toBeLessThanOrEqual(465);
    }
    const action = await dialog
      .getByRole("button", { name: "Add to card" })
      .boundingBox();
    expect(action!.height).toBeGreaterThanOrEqual(48);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: info.outputPath(`editor-visual-viewport-${textSize}.png`),
    });
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "100%";
    Object.assign(window.visualViewport!, { height: 844, offsetTop: 0 });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect(dialog).toHaveAttribute("data-compact-viewport", "false");
  await dialog.getByRole("button", { name: "Add to card" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("region", { name: "Working card" }),
  ).toContainText("1 pick · 250 allocated");
});

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
    page.getByRole("heading", { level: 1, name: "Practice week" }),
  ).toBeVisible();
  await expect(page.getByText("Practice · Unsaved")).toBeVisible();
  const scope = page.getByRole("region", {
    name: "Practice uses older full-card rules",
  });
  await expect(scope).toContainText("complete card once");
  await expect(scope).toContainText(
    "Partial cards count; accepted bets cannot be changed",
  );
  await expect(scope).toContainText("Unused credits expire");
  await expect(
    scope.getByRole("link", { name: "Compare submission rules" }),
  ).toHaveAttribute("href", "/rules");
  await expect(
    page.getByText(/not saved and cannot affect a league/i),
  ).toBeVisible();
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
  expect(compactColumns).toBe(2);

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
  await expect(stake).toHaveAttribute("max", "750");
  expect(
    await stake.evaluate(
      (input: HTMLInputElement) => input.validity.rangeOverflow,
    ),
  ).toBe(true);
  await expect(editor).toContainText("This pick may use up to 750 credits");
  await expect(stake).toBeFocused();
  await expect(stake).toHaveAttribute("aria-invalid", "true");
  await expect(editor.getByRole("alert")).toBeVisible();
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

  await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();
  await expect(page.getByText("−185 → −190")).toBeVisible();
  await page.getByRole("button", { name: "Use updated odds" }).click();
  await page.getByRole("button", { name: "Confirm and seal card" }).click();

  await expect(
    page.getByRole("heading", { name: "Card sealed", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Practice receipt 01/)).toBeVisible();
  await expect(
    page.getByText(/Sealed with your complete card/).first(),
  ).toBeVisible();
  await expect(page.getByText("Harbor Club −3.5")).toHaveCount(0);
  await expect(page.getByText("Capital Club", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Over 42.5")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Reveal kickoff and see results" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your result", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("link", { name: "Start a real league" }),
  ).toHaveCount(1);
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAccessibilityViolations(page);
  expect(pageErrors).toEqual([]);

  await page.reload();
  await expect(page.getByText(/Practice receipt 01/)).toHaveCount(0);
  await expect(page.getByText("0 used · 1,000 left")).toBeVisible();
});
