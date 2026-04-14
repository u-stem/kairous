import { defineConfig, devices } from "@playwright/test";
import { STORAGE_STATE_PATH } from "./helpers/types";

export default defineConfig({
  globalSetup: "./global-setup",
  globalTeardown: "./global-teardown",
  testDir: ".",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // 全環境で直列実行: 複数 worker が同じ storageState のリフレッシュトークンを
  // 同時に使用するとトークンローテーションで無効化されるため
  workers: 1,
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
      // storageState を使う認証済みテスト (materials 等)
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: STORAGE_STATE_PATH,
      },
      dependencies: ["setup"],
      testIgnore: /auth\.spec\.ts/,
    },
    {
      // 認証テスト: ログアウトが storageState セッションを無効化するため最後に実行する
      name: "auth-tests",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /auth\.spec\.ts/,
      dependencies: ["chromium"],
    },
  ],

  webServer: {
    // CI_REUSE_SERVER=1: build artifact を利用するジョブ (test-large matrix, lighthouse) が
    // 外部で起動済みの `bun run start` を再利用するためのオプトイン。
    // ビルド不要なので `bun run build && bun run start` を避け `bun run start` のみにする。
    command:
      process.env.CI_REUSE_SERVER === "1"
        ? "bun run start"
        : process.env.CI
          ? "bun run build && bun run start"
          : "bun run dev",
    port: 3000,
    // CI ではビルド時間を含むため余裕を持たせる
    timeout: 120_000,
    // Lighthouse CI の lhci:setup では外部で起動した Next を再利用する必要があるため
    // 専用の env で明示的にオプトイン (CI env の書き換えという副作用の大きい手段を避ける)
    reuseExistingServer:
      !process.env.CI ||
      process.env.LHCI_REUSE_SERVER === "1" ||
      process.env.CI_REUSE_SERVER === "1",
  },
});
