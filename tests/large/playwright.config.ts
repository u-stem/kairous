import { defineConfig, devices } from "@playwright/test";
import { STORAGE_STATE_PATH } from "./helpers/types";

export default defineConfig({
  globalSetup: "./global-setup",
  globalTeardown: "./global-teardown",
  testDir: ".",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // CI では Supabase ローカルへの競合書き込みを防ぐため直列実行
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",

  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: STORAGE_STATE_PATH,
      },
      dependencies: ["setup"],
    },
  ],

  webServer: {
    command: process.env.CI ? "bun run build && bun run start" : "bun run dev",
    port: 3000,
    // CI ではビルド時間を含むため余裕を持たせる
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
