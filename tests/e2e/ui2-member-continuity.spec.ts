import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("filters survive card round trips, direct queries, reload and browser history", async ({
  page,
}) => {
  const errors: string[] = [];
  const mutations: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.method() === "POST") mutations.push(request.url());
  });
  await page.goto("/preview/member/slate");
  const thursday = page.getByRole("button", { name: "Thursday", exact: true });
  await thursday.click();
  await page.getByRole("button", { name: "Player props", exact: true }).click();
  await expect(page).toHaveURL(/day=THU&type=PLAYER/);
  await page
    .getByRole("button", { name: "Load 200-credit sample draft" })
    .click();
  await page.getByRole("link", { name: "My Card", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "My Card", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Left to allocate").locator("..")).toContainText(
    "500",
  );
  await page.getByRole("link", { name: "Make picks", exact: true }).click();
  await expect(thursday).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Player props", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(thursday).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Monday", exact: true }).click();
  await page.goBack();
  await expect(thursday).toHaveAttribute("aria-pressed", "true");
  await page.goForward();
  await expect(
    page.getByRole("button", { name: "Monday", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/preview/member/slate?day=ALL&type=GAME");
  await expect(
    page.getByRole("button", { name: "All games", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/preview/member/slate?day=bad&type=invalid");
  await expect(
    page.getByRole("status").filter({ hasText: /filter is unavailable/ }),
  ).toBeVisible();
  const saved = await page.evaluate(() =>
    Object.keys(sessionStorage)
      .map((key) => sessionStorage.getItem(key))
      .join(),
  );
  expect(saved).not.toMatch(
    /stake|receipt|subject|token|proposition|marketSnapshot/,
  );
  expect(mutations).toEqual([]);
  expect(errors).toEqual([]);
});

test("Schedule restores its selected week and preserves selector focus", async ({
  page,
}) => {
  await page.goto("/preview/member/schedule");
  const select = page.getByRole("combobox", { name: "Selected week" });
  await expect(select).toHaveValue("2");
  await select.focus();
  await select.selectOption("1");
  await expect(select).toBeFocused();
  await page.reload();
  await expect(select).toHaveValue("1");
  await expect(
    page.getByText("Viewing Week 1 · Current week is Week 2"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.goBack();
  await expect(select).toHaveValue("1");
  await page.goto("/preview/member/schedule?week=3");
  await expect(select).toHaveValue("3");
  await page.goto("/preview/member/schedule?week=99");
  await expect(select).toHaveValue("2");
  await expect(
    page.getByText("That week is unavailable. Showing Week 2."),
  ).toBeVisible();
});

test("member summaries and filters remain usable at desktop, mobile and enlarged text", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const measurements = [];
  for (const [width, zoom] of [
    [1440, 100],
    [390, 100],
    [320, 200],
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/preview/member/slate?day=THU&type=PLAYER");
    await expect(page.locator("html")).toHaveAttribute(
      "data-route-focus-ready",
      "true",
    );
    await page
      .getByRole("button", { name: "Load 200-credit sample draft" })
      .click();
    await page.evaluate((zoom) => {
      document.documentElement.style.fontSize = `${zoom}%`;
    }, zoom);
    await expect(
      page.getByText("Left to allocate").locator(".."),
    ).toContainText("500");
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    const size = await page.evaluate(() => ({
      width: innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(size.document).toBeLessThanOrEqual(width + 1);
    expect(size.body).toBeLessThanOrEqual(width + 1);
    measurements.push({ ...size, zoom });
    await page.screenshot({
      path: info.outputPath(`ui2-picks-${width}-${zoom}.png`),
      fullPage: true,
    });
    await page.getByRole("link", { name: "My Card", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "My Card", exact: true }),
    ).toBeFocused();
    await page.screenshot({
      path: info.outputPath(`ui2-card-${width}-${zoom}.png`),
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
  await info.attach("ui2-layout", {
    body: JSON.stringify(measurements, null, 2),
    contentType: "application/json",
  });
});
