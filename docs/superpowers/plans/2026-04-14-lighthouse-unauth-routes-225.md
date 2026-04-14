# Lighthouse a11y 未認証画面追加 実装計画 (#225)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/auth/login` と `/auth/signup` を Lighthouse CI の計測対象に追加し、Accessibility ≥ 0.95 を assertion で強制する。

**Architecture:** `lighthouserc.json` の URL 配列に 2 URL 追加 + `scripts/lighthouse-auth.cjs` に URL 分岐を追加 (`/auth/*` なら cookie クリア、それ以外は従来通り storageState 注入)。

**Tech Stack:** Lighthouse CI 0.15.1, puppeteer (LHCI 同梱), Next.js middleware

**Spec:** [docs/superpowers/specs/2026-04-14-lighthouse-unauth-routes-design.md](../specs/2026-04-14-lighthouse-unauth-routes-design.md)

---

## 前提

- 作業ブランチ: `feat/225-lighthouse-unauth-routes` (チェックアウト済み、spec コミット済み)
- base: `main` (#231 マージ後、lighthouse は ci.yml 内の lighthouse ジョブで実行される)
- 変更範囲: 2 ファイルのみ。workflow (`.github/workflows/ci.yml`) は変更不要 (lighthouse ジョブが同じ `bun run lhci` を実行する)

## File Structure

- Modify: `lighthouserc.json` — `collect.url` に 2 URL 追加
- Modify: `scripts/lighthouse-auth.cjs` — 関数シグネチャ変更 + URL 分岐実装

---

## Task 1: puppeteer script に URL 分岐を追加

**Files:**
- Modify: `scripts/lighthouse-auth.cjs`

このタスクでは lighthouse-auth.cjs を置き換える。Test を先に書く余地がないため (puppeteer API を mock するコスト > 得られる価値)、実装のみ。CI 上の実 Lighthouse 実行で動作検証する。

- [ ] **Step 1: 現状の scripts/lighthouse-auth.cjs を読んで構造を把握する**

```bash
cat scripts/lighthouse-auth.cjs
```

現状: 第 1 引数 `browser` のみ受け、storageState から読んだ cookie を `context.setCookie(...)` で注入する。

- [ ] **Step 2: スクリプト全体を以下で置換する**

`scripts/lighthouse-auth.cjs` を以下の内容で上書き:

```js
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
  // middleware が / へリダイレクトしてしまうため、計測前にクリアする
  if (pathname.startsWith("/auth/")) {
    const existing = await context.cookies();
    if (existing.length > 0) {
      await context.deleteCookie(
        ...existing.map((c) => ({ name: c.name, domain: c.domain })),
      );
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
```

変更点:
- 関数シグネチャ `(browser) => ...` → `(browser, { url }) => ...`
- 冒頭に `/auth/*` 分岐を追加 (cookie クリア + early return)
- storageState 存在チェックは認証必須ルートでのみ発生 (未認証ルートでは不要)
- typedef を更新

- [ ] **Step 3: lint + typecheck が通ることを確認**

```bash
bun run lint
bun run typecheck
```

期待: 両方とも既存と同等の結果 (新規エラーなし)。scripts/ は tsconfig の exclude に入っている可能性があるため typecheck で触れないことも正常。

- [ ] **Step 4: 変更をコミット (push はまだしない)**

```bash
touch .claude/.review-done
git add scripts/lighthouse-auth.cjs
git commit -m "feat: Lighthouse puppeteer script に未認証ルート分岐を追加 (#225)"
```

Task 2 と 1 commit にまとめる選択もあるが、puppeteer script 変更と URL 追加は責務が分かれるため分ける。

---

## Task 2: lighthouserc.json に未認証 URL を追加

**Files:**
- Modify: `lighthouserc.json`

- [ ] **Step 1: 現状の URL 配列を確認**

```bash
cat lighthouserc.json
```

現状:
```json
"url": [
  "http://localhost:3000/",
  "http://localhost:3000/materials",
  "http://localhost:3000/stats"
]
```

- [ ] **Step 2: URL 配列を以下で置換**

`lighthouserc.json` 内の `"url"` 配列を以下で置換:

```json
      "url": [
        "http://localhost:3000/",
        "http://localhost:3000/materials",
        "http://localhost:3000/stats",
        "http://localhost:3000/auth/login",
        "http://localhost:3000/auth/signup"
      ],
```

(インデントは既存と揃える。行頭スペース 6 個。)

- [ ] **Step 3: JSON が有効であることを確認**

```bash
bun -e "JSON.parse(require('node:fs').readFileSync('lighthouserc.json','utf-8')); console.log('valid')"
```

期待出力: `valid`

- [ ] **Step 4: コミット**

```bash
touch .claude/.review-done
git add lighthouserc.json
git commit -m "feat: Lighthouse CI 対象に /auth/login, /auth/signup を追加 (#225)"
```

---

## Task 3: PR 作成と CI 検証

**Files:** 変更なし

- [ ] **Step 1: push**

```bash
git push -u origin feat/225-lighthouse-unauth-routes
```

pre-push hooks (`full-check`) が走る。全 pass することを確認。

- [ ] **Step 2: PR を作成**

```bash
gh pr create --title "feat: Lighthouse a11y 対象に /auth/login, /auth/signup を追加 (#225)" --body "$(cat <<'EOF'
## Summary

- `lighthouserc.json` の計測 URL に `/auth/login`, `/auth/signup` を追加
- `scripts/lighthouse-auth.cjs` に URL 分岐を追加: `/auth/*` では cookie をクリアして middleware の認証済み → `/` リダイレクトを回避、それ以外は従来通り storageState から cookie 注入

closes #225

## 設計書

`docs/superpowers/specs/2026-04-14-lighthouse-unauth-routes-design.md`

## Test plan

- [ ] CI lighthouse ジョブが 5 URL 全てを計測し assertion pass
- [ ] `/auth/login`, `/auth/signup` の Accessibility スコアがレポートに含まれる
- [ ] 既存の 3 URL (`/`, `/materials`, `/stats`) のスコアが現状を維持
EOF
)"
```

- [ ] **Step 3: CI を watch して green を確認**

```bash
gh run watch --exit-status
```

lighthouse ジョブのログで以下を確認:
- 5 URL の lhci report 生成 (`Dumping 5 reports to disk`)
- 全 URL の Accessibility ≥ 0.95

- [ ] **Step 4: Accessibility スコア < 0.95 の URL が出た場合**

`/auth/login` か `/auth/signup` が基準未満なら Lighthouse レポート artifact をダウンロードして違反を特定:

```bash
gh run download <run-id> --name lighthouse-report
```

違反の修正は本 PBI のスコープ外 (#229 で追跡)。修正コストが小さければ本 PR 内で対応、大きければ Issue を切って defer。

- [ ] **Step 5: Claude PR Review の指摘を確認**

```bash
gh api repos/u-stem/kairous/pulls/<pr-number>/comments
```

blocker があれば対応。suggestion/nit はその場で修正。

- [ ] **Step 6: マージ**

```bash
gh pr merge <pr-number> --squash --delete-branch
```

---

## Self-Review

### Spec coverage

- ✅ 「`/auth/login`, `/auth/signup` を Lighthouse CI で計測」 → Task 2 (URL 追加)
- ✅ 「両画面とも Accessibility ≥ 0.95」 → 既存 assertion が自動適用、Task 3 Step 3 で検証
- ✅ 「puppeteer スクリプトが認証不要ルートでは auth を行わない分岐を持つ」 → Task 1 (URL 分岐)
- ✅ 「CI が green」 → Task 3 Step 3

### Placeholder スキャン

- `<run-id>`: Task 3 Step 4 で実行時に判明 (意図的)
- `<pr-number>`: Task 3 Step 5-6 で実行時に判明 (意図的)
- その他 TBD/TODO/implement later: なし

### 型整合性

- `PuppeteerScript` 型定義: `(browser, {url}) => Promise<void>` で一貫
- `STORAGE_STATE_PATH`: Task 1 内のみで使用、変更なし
- `normalizeSameSite`: 関数名・戻り値型 Task 1 内で一貫
