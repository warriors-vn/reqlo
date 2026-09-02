import { test, expect } from "@playwright/test";

test("running the seeded 'Getting Started' collection completes and shows a pass/fail summary", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Import" })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Getting Started actions" }).click();
  await page.getByRole("menuitem", { name: "Run all requests" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/^\d+\/\d+ complete$/)).toBeVisible({ timeout: 45_000 });
  await expect(dialog.getByText(/\d+\/\d+ requests passed/)).toBeVisible();
});
