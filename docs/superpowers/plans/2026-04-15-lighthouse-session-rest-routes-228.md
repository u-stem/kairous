# Lighthouse a11y セッション/休息系動的ルート 実装計画 (#228)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** セッション/休息系動的ルート 4 件を Lighthouse CI で計測できるよう、in_progress と completed の 2 セッションを固定 UUID で seed する。

**Architecture:** `tests/large/global-setup.ts` に session 2 件を追加 seed (#227 の続き)。`tests/shared/helpers.ts` の `createTestSession` に optional `id` と `extra` を追加。`lighthouserc.json` に固定 UUID URL を 4 件追加。

**Tech Stack:** Supabase JS SDK, Lighthouse CI 0.15.1, Playwright globalSetup

**Spec:** [docs/superpowers/specs/2026-04-15-lighthouse-session-rest-routes-design.md](../specs/2026-04-15-lighthouse-session-rest-routes-design.md)

---

## 前提

- 作業ブランチ: `feat/228-lighthouse-session-rest-routes` (チェックアウト済み、spec コミット済み)
- base: `main` (#227 マージ済み、global-setup に既に LIGHTHOUSE_MATERIAL_ID seed 済み)
- 実装範囲: 3 ファイル変更

## File Structure

- Modify: `tests/shared/helpers.ts` — `createTestSession` に optional `id`/`extra` 追加
- Modify: `tests/large/global-setup.ts` — session 2 件 seed 追加
- Modify: `lighthouserc.json` — 4 URL 追加

---

## Task 1: createTestSession に optional id と extra を追加

**Files:**
- Modify: `tests/shared/helpers.ts`

- [ ] **Step 1: 現状の createTestSession を確認**

```bash
grep -n "createTestSession" tests/shared/helpers.ts | head -3
```

期待: 1 行ヒット (現行 113 行付近)。

- [ ] **Step 2: createTestSession 関数全体を以下で置換**

`tests/shared/helpers.ts` の `createTestSession` を以下で置換:

```typescript
export async function createTestSession(
  userId: string,
  materialId: string,
  methodId: string,
  status = "in_progress",
  id?: string,
  extra?: { ended_at?: string; duration_sec?: number },
) {
  const insertData: Record<string, unknown> = {
    user_id: userId,
    material_id: materialId,
    method_id: methodId,
    status,
  };
  if (id) insertData.id = id;
  if (extra?.ended_at) insertData.ended_at = extra.ended_at;
  if (extra?.duration_sec !== undefined) insertData.duration_sec = extra.duration_sec;
  const result = await getAdminClient()
    .from("sessions")
    .insert(insertData)
    .select()
    .single();
  if (result.error) throw new Error(`テストセッション作成失敗: ${result.error.message}`);
  return result.data as { id: string; user_id: string; material_id: string; method_id: string; status: string; started_at: string };
}
```

- [ ] **Step 3: typecheck と small test pass を確認**

```bash
bun run typecheck
bun test:small
```

期待: 既存呼び出し (引数 4 個まで) は互換、エラーなし。

- [ ] **Step 4: コミット**

```bash
touch .claude/.review-done
git add tests/shared/helpers.ts
git commit -m "feat: createTestSession に optional id/extra を追加 (#228)"
```

---

## Task 2: global-setup に session 2 件 seed を追加

**Files:**
- Modify: `tests/large/global-setup.ts`

- [ ] **Step 1: 現状の global-setup.ts を確認**

```bash
cat tests/large/global-setup.ts
```

期待: #227 で追加された LIGHTHOUSE_MATERIAL_ID/CARD_ID seed の構造。`linkMaterialMethod` の後ろが card 作成。

- [ ] **Step 2: 既存の seed 末尾に session 2 件を追加**

`tests/large/global-setup.ts` のうち、import を以下に置換:

```typescript
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  createTestUser,
  createTestSubject,
  createTestMaterial,
  createTestCard,
  createTestSession,
  linkMaterialMethod,
  getSrsMethodId,
} from "./helpers/db";
import { E2E_PASSWORD } from "./helpers/types";
```

(`createTestSession` を追加。他は #227 のまま。)

定数定義部分を以下に置換 (既存 2 定数 + 新規 2 定数):

```typescript
// Lighthouse CI が動的ルート (/materials/[id], /cards/[cardId] 等) を計測するための固定 UUID。
// lighthouserc.json でハードコードされており、ここで作成する material/card と一致する必要がある
export const LIGHTHOUSE_MATERIAL_ID = "00000000-0000-4000-8000-000000000001";
export const LIGHTHOUSE_CARD_ID = "00000000-0000-4000-8000-000000000002";
// セッション系動的ルート (/session/[id], /summary, /rest/[id]) 計測用。
// /session/[id] は in_progress、/summary は completed が必要なため 2 セッション seed する
export const LIGHTHOUSE_SESSION_IN_PROGRESS_ID = "00000000-0000-4000-8000-000000000003";
export const LIGHTHOUSE_SESSION_COMPLETED_ID = "00000000-0000-4000-8000-000000000004";
```

`globalSetup` 本体内の card 作成の後 (writeFileSync の前) に以下を挿入:

```typescript
  // セッション系動的ルート計測用に in_progress / completed の 2 セッションを seed。
  // /rest/[id] は DB lookup なしのため in_progress session の UUID を流用する
  const srsMethodId = await getSrsMethodId();
  await createTestSession(
    userId,
    LIGHTHOUSE_MATERIAL_ID,
    srsMethodId,
    "in_progress",
    LIGHTHOUSE_SESSION_IN_PROGRESS_ID,
  );
  await createTestSession(
    userId,
    LIGHTHOUSE_MATERIAL_ID,
    srsMethodId,
    "completed",
    LIGHTHOUSE_SESSION_COMPLETED_ID,
    { ended_at: new Date().toISOString(), duration_sec: 300 },
  );
```

注: 現行コードでは `linkMaterialMethod(...)` で `getSrsMethodId()` を 1 回呼んでいる。新規追加でもう一度呼ぶ形になるが (重複コスト数 ms)、簡潔さ優先で許容。気になる場合は変数化して使い回す。

- [ ] **Step 3: helpers/db.ts に createTestSession の re-export があるか確認**

```bash
grep "createTestSession" tests/large/helpers/db.ts
```

期待: 1 行ヒット (`export { createTestSession } from "../../shared/helpers";` 等)。なければ追加が必要だが既存実装で含まれているはず (#227 で確認済み)。

- [ ] **Step 4: typecheck pass**

```bash
bun run typecheck
```

- [ ] **Step 5: コミット**

```bash
touch .claude/.review-done
git add tests/large/global-setup.ts
git commit -m "feat: global-setup に session 2 件 (in_progress + completed) を追加 seed (#228)"
```

---

## Task 3: lighthouserc.json に 4 URL 追加

**Files:**
- Modify: `lighthouserc.json`

- [ ] **Step 1: 現状確認**

```bash
cat lighthouserc.json
```

現状: 12 URL (#227 完了状態)。

- [ ] **Step 2: URL 配列を以下で置換**

`lighthouserc.json` の `"url"` 配列を以下で置換 (新規 4 件をカード edit の後、stats の前に挿入):

```json
      "url": [
        "http://localhost:3000/",
        "http://localhost:3000/materials",
        "http://localhost:3000/materials/new",
        "http://localhost:3000/materials/00000000-0000-4000-8000-000000000001",
        "http://localhost:3000/materials/00000000-0000-4000-8000-000000000001/edit",
        "http://localhost:3000/materials/00000000-0000-4000-8000-000000000001/cards/new",
        "http://localhost:3000/materials/00000000-0000-4000-8000-000000000001/cards/00000000-0000-4000-8000-000000000002/edit",
        "http://localhost:3000/session/00000000-0000-4000-8000-000000000003",
        "http://localhost:3000/session/00000000-0000-4000-8000-000000000003/review",
        "http://localhost:3000/session/00000000-0000-4000-8000-000000000004/summary",
        "http://localhost:3000/rest/00000000-0000-4000-8000-000000000003",
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
git commit -m "feat: Lighthouse a11y 対象に session/rest 動的ルート 4 件を追加 (#228)"
```

---

## Task 4: PR 作成と CI 検証

- [ ] **Step 1: push**

```bash
git push -u origin feat/228-lighthouse-session-rest-routes
```

- [ ] **Step 2: PR 作成**

```bash
gh pr create --title "feat: Lighthouse a11y 対象に session/rest 動的ルート 4 件を追加 (#228)" --body "$(cat <<'EOF'
## Summary

セッション/休息系動的ルート 4 件を Lighthouse CI 計測対象に追加:
- /session/[id] (in_progress)
- /session/[id]/review
- /session/[id]/summary (completed)
- /rest/[id]

固定 UUID で in_progress (`...003`) と completed (`...004`) の 2 セッションを `tests/large/global-setup.ts` で seed。`/rest/[id]` は DB lookup なしのため in_progress session UUID を流用。

closes #228

## 設計

`docs/superpowers/specs/2026-04-15-lighthouse-session-rest-routes-design.md`

## Test plan

- [ ] CI lighthouse ジョブが 16 URL 全てを計測
- [ ] 追加 4 URL の Accessibility ≥ 0.95
- [ ] 既存 12 URL のスコア維持
- [ ] global-setup の session seed が冪等
EOF
)"
```

- [ ] **Step 3: CI watch + assertion 確認**

```bash
gh run watch --exit-status
```

- 16 URL 全て計測されること
- a11y assertion pass
- 0.95 未満が出た場合は report artifact を取得して違反を特定 (#226 #227 と同じ手順):
  ```bash
  gh run download <run-id> --name lighthouse-report
  cat localhost-session_*.report.json | jq '.audits | to_entries | map(select(.value.score != null and .value.score < 1)) | map({id: .key, title: .value.title})'
  ```
  軽微なら本 PR で修正、複雑なら #229 で defer。

- [ ] **Step 4: Claude PR Review コメント確認 (マージ前必須)**

```bash
PR=$(gh pr view --json number --jq .number)
gh api "repos/u-stem/kairous/pulls/$PR/comments" --jq '.[] | select(.user.login=="claude[bot]") | {body: .body[0:300], path, line}'
gh api "repos/u-stem/kairous/issues/$PR/comments" --jq '[.[] | select(.user.login=="claude[bot]")] | .[-1].body[0:600]'
```

inline comment と total review の両方確認。blocker/suggestion/nit に対応してから merge。

- [ ] **Step 5: マージ**

```bash
gh pr merge $PR --squash --delete-branch --body "session/rest 動的ルート 4 件を Lighthouse CI 対象に追加。固定 UUID で in_progress + completed セッションを global-setup で seed。closes #228"
```

---

## Self-Review

### Spec coverage

- ✅ 「4 ルート計測」 → Task 3
- ✅ 「a11y ≥ 0.95」 → 既存 assertion 自動適用、Task 4 で検証
- ✅ 「status 依存 seed」 → Task 2 (in_progress + completed)
- ✅ 「seed 冪等」 → Task 2 (#227 と同じ仕組み)
- ✅ 「CI green」 → Task 4 Step 3

### Placeholder スキャン

- `<run-id>`, `$PR`: Task 4 で実行時取得 (意図的)
- TBD/TODO/implement later: なし

### 型整合性

- `LIGHTHOUSE_SESSION_IN_PROGRESS_ID` / `LIGHTHOUSE_SESSION_COMPLETED_ID`: Task 2 で定義、Task 3 の URL と一致
- `createTestSession(userId, materialId, methodId, status?, id?, extra?)`: Task 1 シグネチャ = Task 2 呼び出しと一致
- `extra.ended_at` (string), `extra.duration_sec` (number): Task 1 型定義 = Task 2 呼び出し値の型と一致
