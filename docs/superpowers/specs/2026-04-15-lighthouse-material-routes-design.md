# Lighthouse a11y 教材系動的ルート 設計書 (#227)

- Issue: [#227](https://github.com/u-stem/kairous/issues/227)
- 親 Epic: [#224 Lighthouse Accessibility を全画面に拡大](https://github.com/u-stem/kairous/issues/224)
- 作成日: 2026-04-15

## Why

教材詳細・カード編集系の動的ルートが Lighthouse CI の対象外。固定 ID で到達可能にするため seed データが必要。`/materials/[id]`, `/edit`, `/cards/new`, `/cards/[cardId]/edit` の 4 画面を計測対象に加えてアクセシビリティを継続検証する。

## Goals

- 4 動的ルートを Lighthouse CI で計測する
- 各ルートで Accessibility ≥ 0.95 を assertion で強制する
- seed が CI 再実行で衝突せず冪等に動作する

## Non-Goals

- 検出された a11y 違反の修正 (別 PBI #229 で対応。ただし軽微で本 PR スコープに収まるなら #226 と同様にインライン修正してよい)
- カード編集 UI / 教材編集 UI の改修

## 方針

既存 `tests/large/global-setup.ts` を拡張し、test user 作成に続けて固定 UUID で subject + material + material_methods + card を seed する。lighthouse-auth.cjs は変更せず、既存の storageState cookie 注入で test user として認証 → RLS で seed データにアクセス可能。lighthouserc.json は固定 UUID を含む URL を 4 件追加する。

## アーキテクチャ

### 固定 UUID

```
MATERIAL_UUID = 00000000-0000-4000-8000-000000000001
CARD_UUID     = 00000000-0000-4000-8000-000000000002
```

UUID v4 形式 (variant bits = 8) を満たすため Postgres `uuid` 型に invalid と判定されない。

### Seed フロー (`tests/large/global-setup.ts`)

```
1. createTestUser(email)                                          → userId
2. createTestSubject(userId)                                      → subjectId
3. createTestMaterial(subjectId, userId, title, id=MATERIAL_UUID)
4. linkMaterialMethod(MATERIAL_UUID, getSrsMethodId())
5. createTestCard(MATERIAL_UUID, "表", "裏", 0, id=CARD_UUID)
```

冪等性: 各 PR の CI run は `e2e-${Date.now()}@kairous.local` で fresh test user を作成。前 run の test user は global-teardown で削除されており、cascade で material/card も消滅。同一 run 内で globalSetup は 1 回のみ。

### `tests/shared/helpers.ts` 変更

`createTestMaterial` と `createTestCard` に optional `id` 引数を追加:

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

`createTestCard` 同様。既存呼び出しは引数省略で動作維持。

### `lighthouserc.json` 追加 URL

```json
"http://localhost:3000/materials/00000000-0000-4000-8000-000000000001",
"http://localhost:3000/materials/00000000-0000-4000-8000-000000000001/edit",
"http://localhost:3000/materials/00000000-0000-4000-8000-000000000001/cards/new",
"http://localhost:3000/materials/00000000-0000-4000-8000-000000000001/cards/00000000-0000-4000-8000-000000000002/edit"
```

### `scripts/lighthouse-auth.cjs`

変更なし。既存 storageState cookie 注入で test user として認証 → RLS で seed material / card にアクセス可能。

## 受け入れ条件への対応

| 条件 | 対応 |
|------|------|
| 4 ルートが Lighthouse CI で計測 | lighthouserc.json URL 追加 |
| 各ルートで a11y ≥ 0.95 | 既存 assertion (`minScore: 0.95`) が全 URL に適用 |
| seed 冪等 | fresh test user + cascade delete で前回データ消滅、固定 UUID で再 insert |
| CI green | 既存 lighthouse ジョブで検証 |

## リスク

| リスク | 緩和 |
|--------|------|
| 固定 UUID が他 E2E test と衝突 | 既存 helpers は random UUID 生成、固定 UUID と衝突せず |
| globalSetup 失敗時の partial state | 既存 global-teardown が test user 削除 → FK cascade で material/card 消滅 |
| `/materials/[id]/edit` などで a11y 違反検出 | #229 で追跡。軽微なら本 PR でインライン修正 (#226 と同じ判断) |
| material_methods 紐付け漏れで詳細ページが 404 | linkMaterialMethod を seed フローに含める |

## テスト

- 既存テスト変更なし
- CI lighthouse ジョブで全 12 URL (8 既存 + 4 新規) 計測 + assertion pass

## 参考

- 既存 helpers: `tests/shared/helpers.ts` `createTestMaterial`, `createTestCard`, `linkMaterialMethod`, `getSrsMethodId`
- globalSetup: `tests/large/global-setup.ts`
- 関連 PBI: #225 (未認証画面 ✅), #226 (認証後静的 ✅), #228 (セッション/休息系), #229 (違反修正)
