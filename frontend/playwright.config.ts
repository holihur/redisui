import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:8093",
    trace: "on-first-retry",
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
