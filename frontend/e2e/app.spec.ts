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
  await page.getByRole("button", { name: "New connection" }).click();
  await page.getByLabel("Connection name").fill("local");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  // Open it from the sidebar.
  await page.getByRole("button", { name: /local/ }).first().click();

  // The seeded "user:*" keys form a tree; expand and open user:1.
  const userFolder = page.getByText("user", { exact: true }).first();
  await expect(userFolder).toBeVisible();
  await userFolder.click();
  await page.getByText("1", { exact: true }).first().click();

  // StringValue renders the value in a textarea.
  await expect(page.locator("textarea").first()).toHaveValue("alice");
});
