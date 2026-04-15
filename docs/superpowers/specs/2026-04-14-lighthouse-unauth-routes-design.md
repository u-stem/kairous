# Lighthouse a11y 未認証画面追加 設計書 (#225)

- Issue: [#225](https://github.com/u-stem/kairous/issues/225)
- 親 Epic: [#224 Lighthouse Accessibility を全画面に拡大](https://github.com/u-stem/kairous/issues/224)
- 作成日: 2026-04-14

## Why

`/auth/login`, `/auth/signup` はログイン前のユーザーが最初に触れる画面で、アクセシビリティ品質の維持が重要。現在 Lighthouse CI の対象は認証後の 3 画面 (`/`, `/materials`, `/stats`) のみで、未認証画面はカバーされていない。

## Goals

- `/auth/login` と `/auth/signup` を Lighthouse CI の計測対象に追加する
- 両画面とも Accessibility スコア ≥ 0.95 を assertion で強制する
- 認証必須ルートと混在して計測できる構成にする

## Non-Goals

- 検出された a11y 違反の修正 (別 PBI #229 で対応)
- 未認証ルートに対する a11y 以外の計測 (performance, SEO 等)

## 方針

`scripts/lighthouse-auth.cjs` の puppeteer script に URL 分岐を追加する。Lighthouse CI は `invokePuppeteerScriptForUrl(url)` で各 URL navigate 前にスクリプトを呼び出し、第 2 引数に `{url, options}` を渡すため、script 側で URL に応じた cookie 処理ができる。

- `/auth/*` の場合: 既存 cookie をクリアして middleware の認証済み → `/` リダイレクトを回避する
- それ以外: 従来通り Playwright storageState から cookie を注入する

## アーキテクチャ

### 変更ファイル

- `lighthouserc.json`: `collect.url` 配列に 2 URL を追加
- `scripts/lighthouse-auth.cjs`: 関数シグネチャに `{url}` を追加し URL 分岐を実装

### 変更内容詳細

**lighthouserc.json**:

```json
{
  "ci": {
    "collect": {
      "url": [
        "http://localhost:3000/",
        "http://localhost:3000/materials",
        "http://localhost:3000/stats",
        "http://localhost:3000/auth/login",
        "http://localhost:3000/auth/signup"
      ],
      ...
    }
  }
}
```

**scripts/lighthouse-auth.cjs**:

```js
module.exports = async (browser, { url }) => {
  const context = browser.defaultBrowserContext();
  const { pathname } = new URL(url);

  if (pathname.startsWith("/auth/")) {
    // 未認証ルート。既存 cookie をクリアして middleware リダイレクトを回避
    const existing = await context.cookies();
    if (existing.length > 0) {
      // cookie オブジェクト全体を渡す (deleteCookie は内部で setCookie expires:0 を使い value を要求する)
      await context.deleteCookie(...existing);
    }
    return;
  }

  // 認証必須ルート。storageState から cookie を注入
  if (!fs.existsSync(STORAGE_STATE_PATH)) {
    throw new Error(`storageState が見つからない: ${STORAGE_STATE_PATH}`);
  }
  // ...既存の cookie 注入ロジック
};
```

### 受け入れ条件への対応

| 条件 | 対応 |
|------|------|
| `/auth/login`, `/auth/signup` が Lighthouse CI で計測される | lighthouserc.json に URL 追加 |
| 両画面とも Accessibility ≥ 0.95 を satisfy | 既存 assertion (`minScore: 0.95`) が全 URL に適用される |
| puppeteer スクリプトが認証不要ルートでは auth を行わない分岐を持つ | lighthouse-auth.cjs の URL 分岐 |
| CI が green | 既存 lighthouse ジョブで検証 |

## リスク

| リスク | 緩和 |
|--------|------|
| cookie クリア後に次 URL で再注入されないと 401 等で失敗 | LHCI は各 URL 前に script を呼ぶため、認証必須ルートでは script 内で再注入される |
| `/auth/login` か `/auth/signup` が現状で a11y ≥ 0.95 を満たさない | 本 PBI では検出が目的、修正は #229 で追跡 |
| `context.deleteCookie` の引数形式がバージョン依存 | LHCI 0.15.1 同梱の puppeteer は内部で `Storage.setCookies` (expires:0) を呼ぶため、`{name, domain}` だけだと CDP が value 欠落でエラー。既存 cookie オブジェクトを丸ごと渡す |

## テスト

- 既存テストは変更しない (CI 構成の変更のみ)
- CI 上の lighthouse ジョブが 5 URL 全てに対して計測し assertion が pass すること
- ローカル検証は Supabase + Playwright setup を要するため CI に委譲する

## 参考

- LHCI puppeteer script 仕様: `node_modules/@lhci/cli/src/collect/puppeteer-manager.js` `invokePuppeteerScriptForUrl`
- Kairous middleware: `src/lib/supabase/middleware.ts` (認証済みユーザーを `/auth/*` → `/` にリダイレクト)
