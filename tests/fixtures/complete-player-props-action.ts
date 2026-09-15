import { expect, type Locator, type Page } from "@playwright/test";

/** Keep the action's network work outside the subsequent state assertion's
 * polling budget. A completed HTTP response alone does not prove app success;
 * callers also check actual success feedback or the committed result. */
export async function completePlayerPropsAction(
  page: Page,
  button: Locator,
  successMessage?: string | RegExp,
  clickOptions?: { timeout: number },
) {
  const pathname = new URL(page.url()).pathname;
  const [response] = await Promise.all([
    page.waitForResponse(
      (result) =>
        result.request().method() === "POST" &&
        new URL(result.url()).pathname === pathname,
    ),
    button.click(clickOptions),
  ]);
  expect(response.ok()).toBe(true);
  expect(await response.finished()).toBeNull();
  if (successMessage)
    await expect(
      page.getByRole("status").filter({ hasText: successMessage }).last(),
    ).toBeVisible();
}
