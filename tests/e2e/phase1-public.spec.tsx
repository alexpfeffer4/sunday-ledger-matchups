import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const safeNext = "/join/private-invite-token?source=email";

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

test("distinct auth intents preserve the exact safe destination", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/auth/sign-in?next=${encodeURIComponent(safeNext)}`);

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "New here? Create account" }),
  ).toHaveAttribute(
    "href",
    `/auth/create-account?next=${encodeURIComponent(safeNext)}`,
  );
  await expect(page.getByRole("button", { name: /Password/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Email link" }).click();
  await expect(
    page.getByRole("button", { name: /Email link/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/existing accounts/i)).toBeVisible();

  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAccessibilityViolations(page);

  await page.goto(`/auth/create-account?next=${encodeURIComponent(safeNext)}`);
  await expect(
    page.getByRole("heading", { name: "Create account" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Email account link" }),
  ).toBeVisible();
  await expect(
    page.getByText(/required username and password setup/i),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAccessibilityViolations(page);
});

test("invalid invitation and invalid email-link states are focused and usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/join/bad");
  await expect(
    page.getByRole("heading", {
      name: "This league link is no longer active",
    }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAccessibilityViolations(page);

  await page.goto(
    `/auth/sign-in?error=invalid_link&next=${encodeURIComponent(safeNext)}`,
  );
  const alert = page.getByRole("main").getByRole("alert");
  await expect(alert).toBeFocused();
  await expect(
    page.getByRole("button", { name: /Email link/ }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("signed-out valid invitation preview reflows and exposes keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(/\/_next\/static\/chunks\/.*\.js(?:\?.*)?$/, (route) =>
    route.abort(),
  );
  await page.goto("/");
  const previewMarkup = readFileSync(
    resolve("tests/e2e/generated/phase1-invitation.html"),
    "utf8",
  );
  await page.evaluate((markup) => {
    document.body.innerHTML = markup;
  }, previewMarkup);

  await expect(
    page.getByRole("heading", { name: "Sunday Friends" }),
  ).toBeVisible();
  const createAccount = page.getByRole("link", { name: "Create account" });
  const signIn = page.getByRole("link", { name: "Sign in" });
  await expect(createAccount).toHaveAttribute(
    "href",
    "/auth/create-account?next=%2Fjoin%2Fprivate-invite-token",
  );
  await expect(signIn).toHaveAttribute(
    "href",
    "/auth/sign-in?next=%2Fjoin%2Fprivate-invite-token",
  );
  await createAccount.focus();
  await expect(createAccount).toBeFocused();
  expect(
    await createAccount.evaluate(
      (element) => getComputedStyle(element).outlineStyle,
    ),
  ).not.toBe("none");

  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAccessibilityViolations(page);
});

test("email confirmation submits an origin-checked POST without leaking the credential in Referer", async ({
  page,
}) => {
  await page.goto(
    `/auth/confirm?token_hash=public-test-invalid&type=email&flow=create-account&next=${encodeURIComponent(safeNext)}`,
  );
  await expect(
    page.getByRole("heading", { name: "Confirm your email link" }),
  ).toBeVisible();
  const submitted = page.waitForResponse(
    (response) =>
      response.url().endsWith("/auth/confirm") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  const response = await submitted;
  expect(response.status()).toBe(303);
  expect(response.request().headers()["origin"]).toBe("http://127.0.0.1:3000");
  expect(response.request().headers()["referer"]).toBe(
    "http://127.0.0.1:3000/",
  );
  await expect(page).toHaveURL(/\/auth\/create-account\?error=invalid_link/);
  expect(new URL(page.url()).searchParams.get("next")).toBe(safeNext);
});
