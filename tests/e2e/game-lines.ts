import { expect, type Locator } from "@playwright/test";

/** Open the game containing a market through its visible disclosure control. */
export async function openGameLinesFor(target: Locator) {
  const panel = target
    .locator(
      "xpath=ancestor-or-self::section[starts-with(@aria-labelledby, 'card-builder-event-')]",
    )
    .locator(":scope > details");
  await panel.waitFor({ state: "attached" });
  if ((await panel.getAttribute("open")) === null)
    await panel.locator(":scope > summary").click();
  await expect(panel).toHaveAttribute("open", "");
}
