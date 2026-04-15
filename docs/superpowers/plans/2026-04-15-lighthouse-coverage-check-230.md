# Lighthouse 新規ルート追加漏れ防止 実装計画 (#230)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `src/app/**/page.tsx` と `lighthouserc.json` の URL 差分を自動検出し、新規ルート追加漏れを CI で防ぐ。

**Architecture:** TypeScript スクリプトが page.tsx を列挙 → URL パターンに変換し、lighthouserc.json の URL pathname と集合比較。差分があれば exit 1。allowlist JSON で意図的除外を管理。CI の lint-and-typecheck ジョブで実行。

**Tech Stack:** Bun (ts 実行), Node.js fs/glob, Vitest (small test)

**Spec:** [docs/superpowers/specs/2026-04-15-lighthouse-coverage-check-design.md](../specs/2026-04-15-lighthouse-coverage-check-design.md)

---

## 前提

- 作業ブランチ: `feat/230-lighthouse-coverage-check` (チェックアウト済み、spec コミット済み)
- base: `main` (#224 epic の全 PBI 完了、lighthouserc.json 16 URL)
- TDD: Task 1 で失敗テスト → Task 2 で実装 (red → green)

## File Structure

- Create: `scripts/check-lighthouse-coverage.ts` — 差分検出スクリプト (関数 export + main)
- Create: `scripts/lighthouse-coverage-allowlist.json` — 除外 allowlist (初期値 `{ "routes": [] }`)
- Create: `tests/small/scripts/check-lighthouse-coverage.test.ts` — Small テスト
- Modify: `package.json` — `check:lighthouse-coverage` script 追加
- Modify: `.github/workflows/ci.yml` — `lint-and-typecheck` ジョブに step 追加
- Modify: `.claude/rules/definition-of-done.md` — DoD ルール追記

---

## Task 1: Small テストを書く (red)

**Files:**
- Create: `tests/small/scripts/check-lighthouse-coverage.test.ts`

TDD の red フェーズ。`pageFileToRoutePattern`, `urlToRoutePattern`, `checkCoverage` を export 前提でテストを書く (実装は Task 2)。

- [ ] **Step 1: テストファイル作成**

Create `tests/small/scripts/check-lighthouse-coverage.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  pageFileToRoutePattern,
  urlToRoutePattern,
  checkCoverage,
} from "../../../scripts/check-lighthouse-coverage";

describe("pageFileToRoutePattern", () => {
  it("returns '/' for root (main) group page", () => {
    expect(pageFileToRoutePattern("src/app/(main)/page.tsx")).toBe("/");
  });

  it("strips (group) segments", () => {
    expect(pageFileToRoutePattern("src/app/(main)/materials/page.tsx")).toBe(
      "/materials",
    );
  });

  it("preserves dynamic [param] segments", () => {
    expect(
      pageFileToRoutePattern("src/app/(main)/materials/[id]/page.tsx"),
    ).toBe("/materials/[id]");
  });

  it("handles nested dynamic segments", () => {
    expect(
      pageFileToRoutePattern(
        "src/app/(main)/materials/[id]/cards/[cardId]/edit/page.tsx",
      ),
    ).toBe("/materials/[id]/cards/[cardId]/edit");
  });

  it("handles non-group routes (auth)", () => {
    expect(pageFileToRoutePattern("src/app/auth/login/page.tsx")).toBe(
      "/auth/login",
    );
  });
});

describe("urlToRoutePattern", () => {
  const patterns = [
    "/",
    "/materials",
    "/materials/[id]",
    "/materials/[id]/cards/[cardId]/edit",
  ];

  it("matches concrete UUID to [id] pattern", () => {
    expect(
      urlToRoutePattern(
        "http://localhost:3000/materials/00000000-0000-4000-8000-000000000001",
        patterns,
      ),
    ).toBe("/materials/[id]");
  });

  it("matches multi-segment dynamic route", () => {
    expect(
      urlToRoutePattern(
        "http://localhost:3000/materials/00000000-0000-4000-8000-000000000001/cards/00000000-0000-4000-8000-000000000002/edit",
        patterns,
      ),
    ).toBe("/materials/[id]/cards/[cardId]/edit");
  });

  it("returns pathname itself when no pattern matches (orphan)", () => {
    expect(
      urlToRoutePattern("http://localhost:3000/nonexistent", patterns),
    ).toBe("/nonexistent");
  });

  it("prefers static route over dynamic when both match", () => {
    const withStaticAndDynamic = ["/materials/new", "/materials/[id]"];
    expect(
      urlToRoutePattern(
        "http://localhost:3000/materials/new",
        withStaticAndDynamic,
      ),
    ).toBe("/materials/new");
  });
});

describe("checkCoverage", () => {
  it("returns empty missing and orphan when all pages are covered", () => {
    const pages = [
      "src/app/(main)/page.tsx",
      "src/app/(main)/materials/page.tsx",
    ];
    const urls = [
      "http://localhost:3000/",
      "http://localhost:3000/materials",
    ];
    const result = checkCoverage(pages, urls, { routes: [] });
    expect(result.missing).toEqual([]);
    expect(result.orphan).toEqual([]);
  });

  it("reports missing pages not in lighthouserc", () => {
    const pages = [
      "src/app/(main)/page.tsx",
      "src/app/(main)/materials/page.tsx",
    ];
    const urls = ["http://localhost:3000/"];
    const result = checkCoverage(pages, urls, { routes: [] });
    expect(result.missing).toEqual(["/materials"]);
  });

  it("reports orphan URLs with no corresponding page", () => {
    const pages = ["src/app/(main)/page.tsx"];
    const urls = [
      "http://localhost:3000/",
      "http://localhost:3000/deleted-route",
    ];
    const result = checkCoverage(pages, urls, { routes: [] });
    expect(result.orphan).toEqual(["/deleted-route"]);
  });

  it("excludes allowlisted routes from missing", () => {
    const pages = [
      "src/app/(main)/page.tsx",
      "src/app/(main)/internal/page.tsx",
    ];
    const urls = ["http://localhost:3000/"];
    const result = checkCoverage(pages, urls, { routes: ["/internal"] });
    expect(result.missing).toEqual([]);
  });
});
```

- [ ] **Step 2: テスト実行で red を確認**

```bash
bun test:small tests/small/scripts/check-lighthouse-coverage.test.ts 2>&1 | head -20
```

期待: `Cannot find module '../../../scripts/check-lighthouse-coverage'` 等でテスト失敗 (実装ファイル未作成)。

- [ ] **Step 3: コミット (red を残しておく必要はないので skip し Task 2 で 1 コミット)**

Task 1 はコミットせず、Task 2 完了時に test + impl を同じコミットに入れる。

---

## Task 2: スクリプト実装 (green)

**Files:**
- Create: `scripts/check-lighthouse-coverage.ts`
- Create: `scripts/lighthouse-coverage-allowlist.json`

- [ ] **Step 1: allowlist JSON 作成**

Create `scripts/lighthouse-coverage-allowlist.json`:

```json
{
  "routes": []
}
```

- [ ] **Step 2: スクリプト実装**

Create `scripts/check-lighthouse-coverage.ts`:

```typescript
#!/usr/bin/env bun
// @ts-check
/**
 * src/app/**\/page.tsx と lighthouserc.json の URL 差分を検出する。
 * 未登録ルートまたは存在しない URL があれば exit 1。
 * 意図的除外は scripts/lighthouse-coverage-allowlist.json で管理する。
 */
import { readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { Glob } from "bun";

export interface Allowlist {
  routes: string[];
}

/**
 * src/app/xxx/page.tsx のパスから Next.js App Router の URL パターンに変換する。
 * (group) は URL から除外し、[param] は動的セグメントとして保持する。
 */
export function pageFileToRoutePattern(relativePath: string): string {
  const withoutPrefix = relativePath
    .replace(/^src\/app\//, "")
    .replace(/\/page\.tsx$/, "");
  if (withoutPrefix === "" || withoutPrefix === "page.tsx") return "/";
  const segments = withoutPrefix
    .split("/")
    .filter((s) => !(s.startsWith("(") && s.endsWith(")")));
  if (segments.length === 0) return "/";
  return "/" + segments.join("/");
}

/**
 * lighthouserc URL の pathname を、page.tsx 由来のパターン集合に照合する。
 * 動的セグメントはワイルドカードとして扱う。静的セグメントが一致する方を優先する。
 */
export function urlToRoutePattern(
  url: string,
  allKnownPatterns: string[],
): string {
  const pathname = new URL(url).pathname;
  // 静的優先: [param] を含まないパターンを先にマッチさせる
  const staticFirst = [...allKnownPatterns].sort((a, b) => {
    const aDynamic = (a.match(/\[/g) ?? []).length;
    const bDynamic = (b.match(/\[/g) ?? []).length;
    return aDynamic - bDynamic;
  });
  for (const pattern of staticFirst) {
    const regex = new RegExp(
      "^" + pattern.replace(/\[[^\]]+\]/g, "[^/]+") + "$",
    );
    if (regex.test(pathname)) return pattern;
  }
  return pathname; // orphan
}

/**
 * page.tsx 群と lighthouserc URL 群の差分を返す。
 * missing: page.tsx にあるが URL に未登録 (allowlist 除く)
 * orphan: URL にあるが page.tsx に対応なし
 */
export function checkCoverage(
  pages: string[],
  lhUrls: string[],
  allowlist: Allowlist,
): { missing: string[]; orphan: string[] } {
  const pagePatterns = pages.map(pageFileToRoutePattern);
  const allowSet = new Set(allowlist.routes);
  const urlPatterns = lhUrls.map((u) => urlToRoutePattern(u, pagePatterns));
  const covered = new Set(urlPatterns);
  const missing = pagePatterns.filter(
    (p) => !covered.has(p) && !allowSet.has(p),
  );
  const orphan = urlPatterns.filter((p) => !pagePatterns.includes(p));
  return { missing, orphan };
}

async function main() {
  const repoRoot = resolve(__dirname, "..");

  // src/app/**/page.tsx を列挙
  const glob = new Glob("src/app/**/page.tsx");
  const pages: string[] = [];
  for await (const file of glob.scan({ cwd: repoRoot })) {
    pages.push(file);
  }

  // lighthouserc.json の URL 配列を読む
  const lhConfig = JSON.parse(
    readFileSync(resolve(repoRoot, "lighthouserc.json"), "utf-8"),
  ) as { ci: { collect: { url: string[] } } };
  const urls = lhConfig.ci.collect.url;

  // allowlist
  const allowlist = JSON.parse(
    readFileSync(
      resolve(repoRoot, "scripts/lighthouse-coverage-allowlist.json"),
      "utf-8",
    ),
  ) as Allowlist;

  const { missing, orphan } = checkCoverage(pages, urls, allowlist);

  if (missing.length === 0 && orphan.length === 0) {
    console.log(
      `✓ Lighthouse coverage OK (${pages.length} pages, ${urls.length} URLs)`,
    );
    return;
  }

  if (missing.length > 0) {
    console.error(
      `✗ lighthouserc.json に未登録のルート (${missing.length} 件):`,
    );
    for (const p of missing) console.error(`    ${p}`);
    console.error(
      `  対応: lighthouserc.json に URL を追加するか、scripts/lighthouse-coverage-allowlist.json の routes に追記してください`,
    );
  }
  if (orphan.length > 0) {
    console.error(`✗ page.tsx に対応しない URL (${orphan.length} 件):`);
    for (const p of orphan) console.error(`    ${p}`);
    console.error(
      `  対応: lighthouserc.json から削除するか、対応 page.tsx を追加してください`,
    );
  }
  process.exit(1);
}

// CLI として実行された場合のみ main を呼ぶ (test import では実行しない)
if (import.meta.main) {
  void main();
}
```

- [ ] **Step 3: テスト実行で green を確認**

```bash
bun test:small tests/small/scripts/check-lighthouse-coverage.test.ts
```

期待: 13 tests pass (上記テスト全て)。

- [ ] **Step 4: 実際のルート + lighthouserc.json で spot check**

```bash
bun run scripts/check-lighthouse-coverage.ts
```

期待出力:
```
✓ Lighthouse coverage OK (16 pages, 16 URLs)
```

- [ ] **Step 5: コミット**

```bash
touch .claude/.review-done
git add scripts/check-lighthouse-coverage.ts scripts/lighthouse-coverage-allowlist.json tests/small/scripts/check-lighthouse-coverage.test.ts
git commit -m "feat: Lighthouse coverage check スクリプトと allowlist を追加 (#230)"
```

---

## Task 3: package.json に script 追加

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 現状 scripts 確認**

```bash
jq '.scripts' package.json
```

- [ ] **Step 2: script 追加**

`package.json` の `"scripts"` に以下を追加 (他 script と同じインデント、alphabetical order を維持):

```json
    "check:lighthouse-coverage": "bun run scripts/check-lighthouse-coverage.ts",
```

挿入位置は既存の `"check:..."` グループの直後、または `"lhci"` の前あたり。具体配置は既存 JSON の順序を崩さない位置。

- [ ] **Step 3: 動作確認**

```bash
bun run check:lighthouse-coverage
```

期待: `✓ Lighthouse coverage OK (16 pages, 16 URLs)`

- [ ] **Step 4: コミット**

```bash
touch .claude/.review-done
git add package.json
git commit -m "feat: check:lighthouse-coverage script を追加 (#230)"
```

---

## Task 4: CI に check step を追加

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: 現状の lint-and-typecheck job を確認**

```bash
grep -n "lint-and-typecheck:" -A 10 .github/workflows/ci.yml
```

- [ ] **Step 2: lint-and-typecheck ジョブの末尾 step 追加**

`.github/workflows/ci.yml` の `lint-and-typecheck` ジョブに以下を追加 (`bun run typecheck` の後):

```yaml
      - run: bun run check:lighthouse-coverage
```

置換対象 (現状):

```yaml
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
      - uses: ./.github/actions/setup-kairous
      - run: bun run lint
      - run: bun run typecheck
```

置換後:

```yaml
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
      - uses: ./.github/actions/setup-kairous
      - run: bun run lint
      - run: bun run typecheck
      - run: bun run check:lighthouse-coverage
```

- [ ] **Step 3: コミット**

```bash
touch .claude/.review-done
git add .github/workflows/ci.yml
git commit -m "ci: lint-and-typecheck ジョブに check:lighthouse-coverage を追加 (#230)"
```

---

## Task 5: DoD にルール追記

**Files:**
- Modify: `.claude/rules/definition-of-done.md`

- [ ] **Step 1: 現状の PBI 完了セクションを確認**

```bash
grep -n "PBI 完了" -A 15 .claude/rules/definition-of-done.md
```

- [ ] **Step 2: PBI 完了条件に追加項目を挿入**

`.claude/rules/definition-of-done.md` の「PBI 完了」セクションの条件リストに以下を追加 (位置: UI 動作確認とドキュメント整合性の間が適切):

```markdown
3. **Lighthouse coverage**: 新規ルート (`src/app/**/page.tsx`) を追加した場合、`lighthouserc.json` にも対応 URL を追加し `bun run check:lighthouse-coverage` が pass する。意図的除外は `scripts/lighthouse-coverage-allowlist.json` の `routes` に追記する
```

後続項目の番号を繰り上げる。具体編集は現状のナンバリングに合わせる (仮に現状 `2. UI 動作確認` → `3. ドキュメント整合性` なら、新規を 3 に挿入し、ドキュメント整合性以降を +1)。

- [ ] **Step 3: コミット**

```bash
touch .claude/.review-done
git add .claude/rules/definition-of-done.md
git commit -m "docs: DoD に Lighthouse coverage チェックのルールを追記 (#230)"
```

---

## Task 6: PR 作成と CI 検証

- [ ] **Step 1: push**

```bash
git push -u origin feat/230-lighthouse-coverage-check
```

- [ ] **Step 2: PR 作成**

```bash
gh pr create --title "feat: Lighthouse 新規ルート追加漏れ防止 (DoD + 自動検知) (#230)" --body "$(cat <<'EOF'
## Summary

- `scripts/check-lighthouse-coverage.ts` を新設し、`src/app/**/page.tsx` と `lighthouserc.json` の URL 差分を検出
- 未登録ルート (missing) または対応 page 不在の URL (orphan) で exit 1
- `scripts/lighthouse-coverage-allowlist.json` で意図的除外を管理 (現状空)
- CI の `lint-and-typecheck` ジョブに step 追加 (fast-fail)
- DoD に新規ルート追加時のルールを追記
- Small テスト 13 ケース追加

closes #230

## 設計

`docs/superpowers/specs/2026-04-15-lighthouse-coverage-check-design.md`

## Test plan

- [ ] CI lint-and-typecheck が pass (現状 16 pages = 16 URLs で整合)
- [ ] Small テスト 13 ケース green
- [ ] ローカルで `bun run check:lighthouse-coverage` が pass
- [ ] 試しに lighthouserc.json から 1 URL 削除すると missing で fail することを手元で確認 (commit はしない)
EOF
)"
```

- [ ] **Step 3: CI watch**

```bash
gh run watch --exit-status
```

- [ ] **Step 4: Claude PR Review 確認 (マージ前必須)**

```bash
PR=$(gh pr view --json number --jq .number)
gh api "repos/u-stem/kairous/pulls/$PR/comments" --jq '.[] | select(.user.login=="claude[bot]") | {body: .body[0:300], path, line}'
gh api "repos/u-stem/kairous/issues/$PR/comments" --jq '[.[] | select(.user.login=="claude[bot]")] | .[-1].body[0:600]'
```

blocker / suggestion / nit に対応してから merge。

- [ ] **Step 5: マージ**

```bash
gh pr merge $PR --squash --delete-branch --body "Lighthouse 新規ルート追加漏れ防止 (DoD + 自動検知)。closes #230"
```

---

## Self-Review

### Spec coverage

- ✅ 「差分検出スクリプト」 → Task 2
- ✅ 「CI 自動実行」 → Task 4
- ✅ 「allowlist」 → Task 2 Step 1 + Task 2 Step 2 (checkCoverage で参照)
- ✅ 「Small テスト」 → Task 1 + Task 2 Step 3
- ✅ 「DoD ルール」 → Task 5

### Placeholder スキャン

- `$PR`: Task 6 で実行時取得 (意図的)
- TBD/TODO/implement later: なし

### 型整合性

- `pageFileToRoutePattern(relativePath: string): string` — Task 1 テスト = Task 2 実装シグネチャ一致
- `urlToRoutePattern(url: string, allKnownPatterns: string[]): string` — 同上
- `checkCoverage(pages, lhUrls, allowlist): { missing, orphan }` — 同上
- `Allowlist { routes: string[] }` — Task 2 で export、テストでは型を import せず直接 object 渡し (問題なし)
