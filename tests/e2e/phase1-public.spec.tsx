import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  InvitePreviewCard,
  SignedOutInviteActions,
} from "@/components/league/invite-public-preview";

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
  const alert = page.getByRole("alert");
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
  await page.goto("/");
  const previewMarkup = renderToStaticMarkup(
    <main className="bg-canvas min-h-screen px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-xl">
        <InvitePreviewCard
          actions={<SignedOutInviteActions token="private-invite-token" />}
          preview={{
            commissioner_name: "Alex",
            expires_at: "2026-09-01T17:00:00.000Z",
            league_name: "Sunday Friends",
            member_count: 3,
            mode: "LIVE",
            nfl_year: 2026,
          }}
        />
      </div>
    </main>,
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
