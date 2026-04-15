# Lighthouse 新規ルート追加漏れ防止 設計書 (#230)

- Issue: [#230](https://github.com/u-stem/kairous/issues/230)
- 親 Epic: [#224](https://github.com/u-stem/kairous/issues/224) (closed)
- 作成日: 2026-04-15

## Why

今後 `src/app/**/page.tsx` が追加された際、`lighthouserc.json` への URL 登録を忘れると Lighthouse a11y 計測漏れが発生する。DoD ルール + CI 自動検知の二段構えで防ぐ。

## Goals

- `src/app/**/page.tsx` と `lighthouserc.json` の差分を自動検出
- 未登録ルートが存在する場合 CI で fail
- 意図的除外 (404 page / API route 等) を allowlist で管理
- DoD に新規ルート追加時のルールを明記

## Non-Goals

- 既存の a11y 違反検出 (lhci assert で既に実施)
- Lighthouse の performance / SEO カテゴリ追加

## 方針

page.tsx ファイルから導出したルートパターンと、lighthouserc.json の URL から抽出したパスパターンを **placeholder 正規化して集合比較** する。UUID の具体値は seed 側の責務で、本スクリプトは構造的一致のみ検証。

## アーキテクチャ

### 変更ファイル

- Create: `scripts/check-lighthouse-coverage.ts`
- Create: `scripts/lighthouse-coverage-allowlist.json` (初期値 `{ "routes": [] }`)
- Create: `tests/small/scripts/check-lighthouse-coverage.test.ts`
- Modify: `.claude/rules/definition-of-done.md` (DoD ルール追記)
- Modify: `.github/workflows/ci.yml` (lint-and-typecheck ジョブに step 追加)
- Modify: `package.json` (script 追加)

### スクリプト仕様

```typescript
// scripts/check-lighthouse-coverage.ts

interface Allowlist { routes: string[] }

// page.tsx のパスを URL パターンに変換
// 例: src/app/(main)/materials/[id]/page.tsx → "/materials/[id]"
export function pageFileToRoutePattern(relativePath: string): string {
  const withoutSrc = relativePath.replace(/^src\/app\//, "").replace(/\/page\.tsx$/, "");
  const segments = withoutSrc.split("/").filter((s) => !s.startsWith("(") || !s.endsWith(")"));
  const path = "/" + segments.join("/");
  return path === "/" ? path : path.replace(/\/$/, "");
}

// lighthouserc URL の pathname を dynamic セグメント化
// 例: "http://localhost:3000/materials/00000000-...-001" → "/materials/[id]"
export function urlToRoutePattern(url: string, allKnownPatterns: string[]): string {
  const pathname = new URL(url).pathname;
  // pathname の各セグメントについて、対応 page.tsx パターンにある [param] を一致させる
  // 実装: page.tsx パターン群の正規表現 (/\[[^\]]+\]/g → /[^/]+/) で pathname をマッチ、
  // マッチしたパターンを返す
  for (const pattern of allKnownPatterns) {
    const regex = new RegExp(
      "^" + pattern.replace(/\[[^\]]+\]/g, "[^/]+") + "$",
    );
    if (regex.test(pathname)) return pattern;
  }
  return pathname; // マッチしない = orphan URL
}

export function checkCoverage(
  pages: string[],       // src/app/**/page.tsx の相対パス
  lhUrls: string[],      // lighthouserc.json の URL 配列
  allowlist: Allowlist,
): { missing: string[]; orphan: string[] } {
  const pagePatterns = pages.map(pageFileToRoutePattern);
  const allowSet = new Set(allowlist.routes);
  const urlPatterns = lhUrls.map((u) => urlToRoutePattern(u, pagePatterns));
  
  const covered = new Set(urlPatterns);
  const missing = pagePatterns.filter(
    (p) => !covered.has(p) && !allowSet.has(p),
  );
  const orphan = urlPatterns.filter(
    (p) => !pagePatterns.includes(p),
  );
  return { missing, orphan };
}

// エントリポイント: main() で pages/urls/allowlist を読み、結果を出力 + exit code
```

`missing` = page.tsx にあるが lighthouserc に未登録。`orphan` = lighthouserc にあるが page.tsx に対応なし。

### Allowlist

`scripts/lighthouse-coverage-allowlist.json`:

```json
{
  "routes": []
}
```

現状 allowlist 対象なし (全 16 ルート対象)。将来 404 page や internal-only route が増えた場合に追加。

### DoD ルール追記

`.claude/rules/definition-of-done.md` の「PBI 完了」セクションに以下を追加:

- 新規ルート (`src/app/**/page.tsx`) を追加した場合、`lighthouserc.json` にも対応 URL を追加し、`bun run check:lighthouse-coverage` が pass すること。意図的除外は `scripts/lighthouse-coverage-allowlist.json` に記載する

### CI 統合

`.github/workflows/ci.yml` の `lint-and-typecheck` ジョブ末尾に追加:

```yaml
      - run: bun run check:lighthouse-coverage
```

Lighthouse ジョブ (重い) より前に lint-and-typecheck (軽い) で fail するため fast-fail できる。

### package.json script

```json
"check:lighthouse-coverage": "bun run scripts/check-lighthouse-coverage.ts"
```

### Small テスト

`tests/small/scripts/check-lighthouse-coverage.test.ts`:

- `pageFileToRoutePattern`: 各種パス (`(main)` group 除去、動的セグメント保持、ネスト)
- `urlToRoutePattern`: 具体 UUID → `[id]` マッチ
- `checkCoverage`: 正常ケース / missing / orphan / allowlist
- Arrange-Act-Assert、1 テスト 1 アサーション

## 受け入れ条件への対応

| 条件 | 対応 |
|------|------|
| DoD にルール明記 | `.claude/rules/definition-of-done.md` 追記 |
| 差分検出スクリプト | `scripts/check-lighthouse-coverage.ts` |
| CI 自動実行 | `lint-and-typecheck` ジョブに step |
| allowlist 対応 | `scripts/lighthouse-coverage-allowlist.json` |
| Small テスト | `tests/small/scripts/check-lighthouse-coverage.test.ts` |

## リスク

| リスク | 緩和 |
|--------|------|
| Next.js route group `(main)` / `(auth)` の誤除去 | page ファイルは `src/app/auth/...` 配下 (group なし) と `src/app/(main)/...` で混在。テストで両方カバー |
| Parallel/Intercepting routes の誤解析 | 現状使用なし、使用時は allowlist 拡張で対応 |
| 同一 URL が複数パターンにマッチする曖昧性 | Next.js ルート解決で静的セグメントが動的より優先。順序固定 (静的優先) で対応 |
| lighthouserc の URL typo が orphan 扱いで気づかれない | `checkCoverage` で orphan も fail 対象にする |

## テスト

- Small: `tests/small/scripts/check-lighthouse-coverage.test.ts` (関数単位)
- 統合: 実際の `src/app` + `lighthouserc.json` に対して `bun run check:lighthouse-coverage` が exit 0 (現状整合済み)

## 参考

- 関連 PBI: #225〜#228 (✅)、#229 (対応不要 close)
- Next.js App Router ルーティング: <https://nextjs.org/docs/app/building-your-application/routing>
