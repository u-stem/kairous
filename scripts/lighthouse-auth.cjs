// @ts-check
/**
 * Lighthouse CI が各 URL navigate 前に呼び出す puppeteer script。
 * 認証必須ルートでは Playwright の storageState から Supabase 認証 cookie を
 * 取り出して Puppeteer に注入する。未認証ルート (/auth/*) では逆に cookie を
 * クリアし、middleware の「認証済みユーザーを / へリダイレクト」を回避する。
 *
 * auth.setup.ts を lhci 実行前に `bun run lhci:setup` として別途走らせておく前提。
 */
const fs = require("node:fs");
const path = require("node:path");

const STORAGE_STATE_PATH = path.resolve(
  __dirname,
  "..",
  "tests/large/.auth/user.json",
);

/**
 * @typedef {(
 *   browser: import('puppeteer').Browser,
 *   context: {url: string},
 * ) => Promise<void>} PuppeteerScript
 */

/** @type {PuppeteerScript} */
module.exports = async (browser, { url }) => {
  const context = browser.defaultBrowserContext();
  const { pathname } = new URL(url);

  // /auth/* は未認証ユーザーが訪れる画面。既存 cookie が残っていると
  // middleware が / へリダイレクトしてしまうため、計測前にクリアする。
  // deleteCookie は内部で CDP の Storage.setCookies (expires:0) を使うことがあり、
  // name/domain だけ渡すと value 欠落でエラーになるため cookie オブジェクト全体を渡す
  if (pathname.startsWith("/auth/")) {
    const existing = await context.cookies();
    if (existing.length > 0) {
      await context.deleteCookie(...existing);
    }
    return;
  }

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
