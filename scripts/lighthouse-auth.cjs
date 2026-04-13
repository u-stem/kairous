// @ts-check
/**
 * Lighthouse CI が各 URL navigate 前に呼び出す puppeteer script。
 * Playwright で生成済みの storageState (tests/large/.auth/user.json) から
 * Supabase 認証 cookie を取り出し、Puppeteer の Browser コンテキストに注入する。
 *
 * auth.setup.ts を lhci 実行前に `playwright test --project=setup` として
 * 別途走らせておく前提。
 */
const fs = require("node:fs");
const path = require("node:path");

const STORAGE_STATE_PATH = path.resolve(
  __dirname,
  "..",
  "tests/large/.auth/user.json",
);

/**
 * @typedef {(browser: import('puppeteer').Browser) => Promise<void>} PuppeteerScript
 */

/** @type {PuppeteerScript} */
module.exports = async (browser) => {
  if (!fs.existsSync(STORAGE_STATE_PATH)) {
    throw new Error(
      `storageState が見つからない: ${STORAGE_STATE_PATH}\n先に 'bun run lhci:setup' で auth.setup.ts を実行すること`,
    );
  }

  const state = JSON.parse(fs.readFileSync(STORAGE_STATE_PATH, "utf-8"));

  // Playwright cookie 形式 → Puppeteer CDP 形式
  // sameSite は Playwright が小文字で返すことがあるため正規化
  const cookies = (state.cookies ?? []).map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    expires: c.expires,
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: normalizeSameSite(c.sameSite),
  }));

  // BrowserContext 単位で cookie を設定しておくと、以降の全ページで有効になる
  const context = browser.defaultBrowserContext();
  await context.setCookie(...cookies);
};

/** @param {string | undefined} value */
function normalizeSameSite(value) {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (lower === "strict") return "Strict";
  if (lower === "lax") return "Lax";
  if (lower === "none") return "None";
  return undefined;
}
