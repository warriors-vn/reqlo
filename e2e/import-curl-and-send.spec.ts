import { test, expect } from "@playwright/test";

test("importing a cURL command creates a request, and Send returns a real response", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Import" })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Import" }).click();
  await page.getByRole("menuitem", { name: "Import cURL" }).click();

  const dialog = page.getByRole("dialog");
  await dialog
    .getByPlaceholder(/curl -X POST/)
    .fill("curl https://jsonplaceholder.typicode.com/todos/1");
  await dialog.getByRole("button", { name: "Import" }).click();

  // The modal closes into a new tab for the imported request.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Request URL" })).toHaveValue(
    "https://jsonplaceholder.typicode.com/todos/1",
  );

  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(/^200\b/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/"userId"/)).toBeVisible();
});
