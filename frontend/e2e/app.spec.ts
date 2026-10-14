import { expect, test } from "@playwright/test";

const TOKEN = process.env.E2E_TOKEN ?? "e2e-token";

test("rejects an invalid access token", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Access token").fill("definitely-wrong");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByText(/unauthorized/i)).toBeVisible();
});

test("unlock, connect and browse keys", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Access token").fill(TOKEN);
  await page.getByRole("button", { name: "Unlock" }).click();

  await expect(page.getByText("No active connection")).toBeVisible();

  // Create a direct connection to the local Redis.
  await page
    .getByRole("main")
    .getByRole("button", { name: "New connection" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Connection name").fill("local");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();

  // Open it from the sidebar.
  await page.getByRole("button", { name: /local/ }).first().click();
  await expect(
    page.getByPlaceholder("Pattern, e.g. user:*"),
  ).toBeVisible();

  // The seeded "user:*" keys form a tree; expand and open user:1.
  const userFolder = page.locator('[title="user"]');
  await expect(userFolder).toBeVisible();
  await userFolder.click();
  await page.locator('[title="user:1"]').click();

  // StringValue renders the value in a textarea.
  await expect(page.locator("textarea").first()).toHaveValue("alice");
});
