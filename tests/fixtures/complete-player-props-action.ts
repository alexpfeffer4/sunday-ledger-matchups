import { expect, type Locator, type Page } from "@playwright/test";

/** Wait for action response headers, then observable application completion.
 * RSC streams can remain open after the mutation commits and success renders;
 * stream closure is not an action completion condition. Without a status
 * message, callers must assert the rendered or committed result themselves. */
export async function completePlayerPropsAction(
  page: Page,
  button: Locator,
  successMessage?: string | RegExp,
  clickOptions?: { timeout: number },
) {
  // Deep-link disclosures and long menus can move an offscreen button. Finish
  // scrolling before click's stability check, especially in mobile WebKit.
  await button.scrollIntoViewIfNeeded();
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
  if (successMessage)
    await expect(
      page.getByRole("status").filter({ hasText: successMessage }).last(),
    ).toBeVisible();
}
