import { expect, test } from "@playwright/test";

const exampleSlug = "example-season";

test.describe("Phase 2 Rules and Standings", () => {
  test("renders human rules with technical evidence disclosed second", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(`/l/${exampleSlug}/rules`);

    await expect(
      page.getByRole("heading", { level: 1, name: "Example rules" }),
    ).toBeVisible();
    await expect(
      page.getByText("Markets and big-favorite limit"),
    ).toBeVisible();
    await expect(page.getByText("Audit details")).toBeVisible();
    await expect(page.getByText(/Illustrative Ruleset values/)).toBeVisible();
    await expect(
      page.locator("[data-nextjs-dialog], .vite-error-overlay"),
    ).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test("keeps official order and the displayed tiebreak chain together", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(`/l/${exampleSlug}/standings`);

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Example regular-season standings",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "How ties are ordered" }),
    ).toBeVisible();
    await expect(page.getByText(/Matchup win percentage/)).toContainText(
      "Stored deterministic random tiebreak value",
    );
    await expect(page.getByText("Audit details")).toBeVisible();
    await expect(
      page.locator("[data-nextjs-dialog], .vite-error-overlay"),
    ).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });
});
