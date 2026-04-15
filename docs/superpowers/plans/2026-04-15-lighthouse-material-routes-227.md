# Lighthouse a11y 教材系動的ルート 実装計画 (#227)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 教材系動的ルート 4 件を Lighthouse CI で計測できるよう、global-setup で固定 UUID の seed データを作成する。

**Architecture:** `tests/large/global-setup.ts` に subject + material + material_methods + card の seed を追加。`tests/shared/helpers.ts` の `createTestMaterial`/`createTestCard` に optional `id` 引数を追加。`lighthouserc.json` に固定 UUID を含む 4 URL を追加。

**Tech Stack:** Supabase JS SDK (admin client), Lighthouse CI 0.15.1, Playwright globalSetup

**Spec:** [docs/superpowers/specs/2026-04-15-lighthouse-material-routes-design.md](../specs/2026-04-15-lighthouse-material-routes-design.md)

---

## 前提

- 作業ブランチ: `feat/227-lighthouse-material-routes` (チェックアウト済み、spec コミット済み)
- base: `main` (#225, #226 マージ済み、lighthouserc.json 8 URL の状態)
- 実装範囲: 3 ファイル変更

## File Structure

- Modify: `tests/shared/helpers.ts` — `createTestMaterial`/`createTestCard` に optional `id` 引数を追加
- Modify: `tests/large/global-setup.ts` — seed フロー (subject/material/method 紐付け/card) を追加
- Modify: `lighthouserc.json` — 4 URL 追加

---

## Task 1: helpers.ts に optional id 引数を追加

**Files:**
- Modify: `tests/shared/helpers.ts`

- [ ] **Step 1: 現状の createTestMaterial / createTestCard を確認**

```bash
grep -n "createTestMaterial\|createTestCard" tests/shared/helpers.ts | head -5
```

期待: それぞれ 1 行ずつヒット。後続の `.insert(...)` 呼び出しを修正する。

- [ ] **Step 2: createTestMaterial を以下で置換**

`tests/shared/helpers.ts` の `createTestMaterial` 関数を以下で置換:

```typescript
export async function createTestMaterial(
  subjectId: string,
  userId: string,
  title = "テスト教材",
  id?: string,
) {
  const insertData: Record<string, unknown> = {
    subject_id: subjectId,
    user_id: userId,
    title,
  };
  if (id) insertData.id = id;
  const result = await getAdminClient()
    .from("materials")
    .insert(insertData)
    .select()
    .single();
  if (result.error) throw new Error(`テスト教材作成失敗: ${result.error.message}`);
  return result.data as { id: string; title: string; subject_id: string; user_id: string };
}
```

- [ ] **Step 3: createTestCard を以下で置換**

```typescript
export async function createTestCard(
  materialId: string,
  front = "テスト表面",
  back = "テスト裏面",
  displayOrder = 0,
  id?: string,
) {
  const insertData: Record<string, unknown> = {
    material_id: materialId,
    front,
    back,
    display_order: displayOrder,
  };
  if (id) insertData.id = id;
  const result = await getAdminClient()
    .from("cards")
    .insert(insertData)
    .select()
    .single();
  if (result.error) throw new Error(`テストカード作成失敗: ${result.error.message}`);
  return result.data as { id: string; material_id: string; front: string; back: string; display_order: number };
}
```

- [ ] **Step 4: typecheck と small test が pass することを確認**

```bash
bun run typecheck
bun test:small
```

期待: 既存呼び出しは optional 引数を省略しているため互換、エラーなし。

- [ ] **Step 5: コミット**

```bash
touch .claude/.review-done
git add tests/shared/helpers.ts
git commit -m "feat: createTestMaterial/createTestCard に optional id 引数を追加 (#227)"
```

---

## Task 2: global-setup に Lighthouse 用 seed を追加

**Files:**
- Modify: `tests/large/global-setup.ts`

- [ ] **Step 1: 現状の global-setup.ts を確認**

```bash
cat tests/large/global-setup.ts
```

現状: createTestUser のみ。後続 step で seed 4 件を追加する。

- [ ] **Step 2: global-setup.ts を以下で置換**

```typescript
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  createTestUser,
  createTestSubject,
  createTestMaterial,
  createTestCard,
  linkMaterialMethod,
  getSrsMethodId,
} from "./helpers/db";
import { E2E_PASSWORD } from "./helpers/types";

// Lighthouse CI が動的ルート (/materials/[id], /cards/[cardId] 等) を計測するための固定 UUID。
// lighthouserc.json でハードコードされており、ここで作成する material/card と一致する必要がある
export const LIGHTHOUSE_MATERIAL_ID = "00000000-0000-4000-8000-000000000001";
export const LIGHTHOUSE_CARD_ID = "00000000-0000-4000-8000-000000000002";

async function globalSetup() {
  const email = `e2e-${Date.now()}@kairous.local`;
  const userId = await createTestUser(email, E2E_PASSWORD);

  // Lighthouse CI で動的ルート (/materials/[id], cards/[cardId]) を計測するため
  // test user 配下に固定 UUID で 1 教材 + 1 カードを seed する。
  // 各 PR の CI run は fresh user で動作し、global-teardown で cascade 削除されるため冪等
  const subject = await createTestSubject(userId, "Lighthouse seed分野");
  await createTestMaterial(
    subject.id,
    userId,
    "Lighthouse seed教材",
    LIGHTHOUSE_MATERIAL_ID,
  );
  await linkMaterialMethod(LIGHTHOUSE_MATERIAL_ID, await getSrsMethodId());
  await createTestCard(
    LIGHTHOUSE_MATERIAL_ID,
    "Lighthouse seed 表",
    "Lighthouse seed 裏",
    0,
    LIGHTHOUSE_CARD_ID,
  );

  // auth.setup.ts と global-teardown.ts で使うためファイルに保存
  // パスワードはファイルに書き出さず、定数として共有する
  const authDir = resolve(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    resolve(authDir, "test-user.json"),
    JSON.stringify({ id: userId, email }),
  );
}

export default globalSetup;
```

- [ ] **Step 3: typecheck が pass することを確認**

```bash
bun run typecheck
```

期待: import 追加分のみで型エラーなし。

- [ ] **Step 4: ローカルで Supabase 起動済みなら手動 seed 検証 (optional)**

Supabase ローカルが起動中なら以下で seed を試行:

```bash
bun run lhci:setup
```

期待: globalSetup が成功し `tests/large/.auth/test-user.json` が作成される。Supabase Studio で `materials` テーブルに UUID `00000000-0000-4000-8000-000000000001` のレコードがあることを確認。

(Supabase 未起動なら CI に委譲。)

- [ ] **Step 5: コミット**

```bash
touch .claude/.review-done
git add tests/large/global-setup.ts
git commit -m "feat: global-setup に Lighthouse 用 seed (固定 UUID material + card) を追加 (#227)"
```

---

## Task 3: lighthouserc.json に動的ルート 4 件を追加

**Files:**
- Modify: `lighthouserc.json`

- [ ] **Step 1: 現状の URL 配列を確認**

```bash
cat lighthouserc.json
```

現状: 8 URL (`/`, `/materials`, `/materials/new`, `/stats`, `/profile`, `/profile/notifications`, `/auth/login`, `/auth/signup`)。

- [ ] **Step 2: URL 配列を以下で置換**

`lighthouserc.json` の `"url"` 配列を以下で置換 (既存 URL の順序を維持し、教材詳細系を `/materials/new` の後に配置):

```json
      "url": [
        "http://localhost:3000/",
        "http://localhost:3000/materials",
        "http://localhost:3000/materials/new",
        "http://localhost:3000/materials/00000000-0000-4000-8000-000000000001",
        "http://localhost:3000/materials/00000000-0000-4000-8000-000000000001/edit",
        "http://localhost:3000/materials/00000000-0000-4000-8000-000000000001/cards/new",
        "http://localhost:3000/materials/00000000-0000-4000-8000-000000000001/cards/00000000-0000-4000-8000-000000000002/edit",
        "http://localhost:3000/stats",
        "http://localhost:3000/profile",
        "http://localhost:3000/profile/notifications",
        "http://localhost:3000/auth/login",
        "http://localhost:3000/auth/signup"
      ],
```

- [ ] **Step 3: JSON 妥当性確認**

```bash
bun -e "JSON.parse(require('node:fs').readFileSync('lighthouserc.json','utf-8')); console.log('valid')"
```

期待: `valid`

- [ ] **Step 4: コミット**

```bash
touch .claude/.review-done
git add lighthouserc.json
git commit -m "feat: Lighthouse a11y 対象に教材系動的ルート 4 件を追加 (#227)"
```

---

## Task 4: PR 作成と CI 検証

- [ ] **Step 1: push**

```bash
git push -u origin feat/227-lighthouse-material-routes
```

- [ ] **Step 2: PR 作成**

```bash
gh pr create --title "feat: Lighthouse a11y 対象に教材系動的ルート 4 件を追加 (#227)" --body "$(cat <<'EOF'
## Summary

教材系動的ルート 4 件を Lighthouse CI 計測対象に追加:
- /materials/[id]
- /materials/[id]/edit
- /materials/[id]/cards/new
- /materials/[id]/cards/[cardId]/edit

固定 UUID で seed する material + card を `tests/large/global-setup.ts` に追加。`createTestMaterial` / `createTestCard` に optional `id` 引数を追加。

closes #227

## 設計

`docs/superpowers/specs/2026-04-15-lighthouse-material-routes-design.md`

## Test plan

- [ ] CI lighthouse ジョブが 12 URL 全てを計測
- [ ] 追加 4 URL の Accessibility ≥ 0.95
- [ ] 既存 8 URL のスコア維持
- [ ] global-setup の seed が冪等 (CI 再実行で衝突なし)
EOF
)"
```

- [ ] **Step 3: CI watch + assertion 確認**

```bash
gh run watch --exit-status
```

lighthouse ジョブのログで以下を確認:
- 12 URL の `Running Lighthouse 1 time(s) on ...` が出力される
- assertion で全 URL pass
- もし `/materials/[id]/edit` 等で 0.95 未満が出た場合、レポート artifact をダウンロードして違反内容を確認:
  ```bash
  gh run download <run-id> --name lighthouse-report
  cat localhost-materials_*.report.json | jq '.audits | to_entries | map(select(.value.score != null and .value.score < 1)) | map({id: .key, title: .value.title})'
  ```
  軽微な違反 (#226 の button-name と同程度) は本 PR で修正。複雑なら #229 follow-up に Issue 化して defer。

- [ ] **Step 4: Claude PR Review コメント確認 (マージ前必須)**

```bash
PR=$(gh pr view --json number --jq .number)
gh api "repos/u-stem/kairous/pulls/$PR/comments" --jq '.[] | select(.user.login=="claude[bot]") | {body: .body[0:300], path, line}'
gh api "repos/u-stem/kairous/issues/$PR/comments" --jq '[.[] | select(.user.login=="claude[bot]")] | .[-1].body[0:500]'
```

blocker / suggestion / nit があれば対応または Issue 化。**未対応のままマージしない** (#225 #226 で実際にスキップして follow-up が必要になった反省)。

- [ ] **Step 5: マージ**

```bash
gh pr merge $PR --squash --delete-branch --body "教材系動的ルート 4 件を Lighthouse CI 対象に追加。固定 UUID で seed (material + card) を global-setup で作成。closes #227"
```

---

## Self-Review

### Spec coverage

- ✅ 「4 ルートが Lighthouse CI で計測」 → Task 3
- ✅ 「各ルートで a11y ≥ 0.95」 → 既存 assertion 自動適用、Task 4 で検証
- ✅ 「seed 冪等」 → Task 2 (fresh user + cascade delete + 固定 UUID insert)
- ✅ 「CI green」 → Task 4 Step 3

### Placeholder スキャン

- `<run-id>`, `<pr-number>`, `$PR`: Task 4 で実行時取得 (意図的)
- TBD/TODO/implement later: なし

### 型整合性

- `LIGHTHOUSE_MATERIAL_ID` = `"00000000-0000-4000-8000-000000000001"` — Task 2 で定義、Task 3 の URL と一致
- `LIGHTHOUSE_CARD_ID` = `"00000000-0000-4000-8000-000000000002"` — 同上
- `createTestMaterial(subjectId, userId, title, id?)`: Task 1 シグネチャ = Task 2 呼び出しと一致
- `createTestCard(materialId, front, back, displayOrder, id?)`: 同上
