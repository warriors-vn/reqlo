import { test, expect } from "@playwright/test";

test("a variable's value changes what a request resolves to after switching environments", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Import" })).toBeVisible({ timeout: 15_000 });

  // Import a request that templates a query param off {{TODO_ID}}.
  await page.getByRole("button", { name: "Import" }).click();
  await page.getByRole("menuitem", { name: "Import cURL" }).click();
  const importDialog = page.getByRole("dialog");
  await importDialog
    .getByPlaceholder(/curl -X POST/)
    .fill("curl 'https://jsonplaceholder.typicode.com/todos/{{TODO_ID}}'");
  await importDialog.getByRole("button", { name: "Import" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const createEnvironment = async (todoId: string) => {
    // exact: true — Workspace's empty-tabs state has its own "Search ⌘K"
    // button, a substring superset match that Playwright's default
    // name-matching would also resolve, causing a strict-mode violation if
    // it's still mounted for a moment after the curl import opens a tab.
    await page.getByRole("button", { name: "⌘K", exact: true }).click();
    await page.getByPlaceholder("Search commands, requests…").fill("Create Environment");
    await page.getByRole("option", { name: "Create Environment" }).click();

    const envDialog = page.getByRole("dialog");
    await expect(envDialog).toBeVisible();
    await envDialog.getByRole("button", { name: "Add row" }).click();
    // Scoped with .last(): a previous environment's own (still-rendered)
    // variable row also matches this placeholder, and the one this "Add
    // row" click just appended is always the newest in DOM order.
    await envDialog.getByPlaceholder("Variable").last().fill("TODO_ID");
    await envDialog.getByPlaceholder("Value").last().fill(todoId);
    await page.keyboard.press("Escape");
    await expect(envDialog).toHaveCount(0);
  };

  // Create an environment with TODO_ID=1, made active automatically.
  await createEnvironment("1");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText('"id": 1')).toBeVisible({ timeout: 15_000 });

  // Create and switch to a second environment with TODO_ID=2, then resend —
  // the resolved response should now reflect the new environment's value,
  // proving the switch actually took effect on the next send.
  await createEnvironment("2");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText('"id": 2')).toBeVisible({ timeout: 15_000 });
});
