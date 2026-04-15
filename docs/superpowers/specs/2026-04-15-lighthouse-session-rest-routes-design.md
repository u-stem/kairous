# Lighthouse a11y セッション/休息系動的ルート 設計書 (#228)

- Issue: [#228](https://github.com/u-stem/kairous/issues/228)
- 親 Epic: [#224](https://github.com/u-stem/kairous/issues/224)
- 作成日: 2026-04-15
- 前提: PBI #227 マージ済み (固定 UUID material + card seed の仕組み)

## Why

セッション実行・レビュー・サマリー・休息画面が Lighthouse CI の対象外。`in_progress` と `completed` の状態に依存するため、status 別に 2 種類のセッションを seed する必要がある。

## Goals

- 4 ルート (`/session/[id]`, `/session/[id]/review`, `/session/[id]/summary`, `/rest/[id]`) を Lighthouse CI で計測
- 各ルートで Accessibility ≥ 0.95
- status 依存 seed が CI 再実行で冪等

## Non-Goals

- 検出された a11y 違反の修正 (#229 で追跡。軽微なら本 PR でインライン)
- session player UI の改修

## 方針

#227 と同じ globalSetup 拡張パターン。固定 UUID で in_progress と completed の 2 セッションを seed。`/rest/[id]` は DB lookup を行わない pure client component のため in_progress session の UUID を流用。

## アーキテクチャ

### 固定 UUID

```
SESSION_IN_PROGRESS_ID = 00000000-0000-4000-8000-000000000003
SESSION_COMPLETED_ID   = 00000000-0000-4000-8000-000000000004
```

UUID v4 形式 (variant bits = 8) で Postgres `uuid` 型に互換。`/rest/[id]` は DB lookup なしのため SESSION_IN_PROGRESS_ID を流用。

### Seed フロー (`tests/large/global-setup.ts`)

#227 の seed の後ろに 2 セッションを追加:

```
1-5. (#227 既存): user → subject → material(...001) → linkSrsMethod → card(...002)
6.  createTestSession(userId, MATERIAL_ID, srsMethodId, "in_progress", SESSION_IN_PROGRESS_ID)
7.  createTestSession(userId, MATERIAL_ID, srsMethodId, "completed", SESSION_COMPLETED_ID,
                      { ended_at: nowIso, duration_sec: 300 })
```

冪等性: #227 と同じ仕組み (fresh test user + cascade delete + 固定 UUID で再 insert)。

### `tests/shared/helpers.ts` 変更

`createTestSession` に optional `id` と `extra` を追加:

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
  // ...insert/select/return
}
```

既存呼び出しは optional 引数省略で動作維持。

### `lighthouserc.json` 追加 URL

```json
"http://localhost:3000/session/00000000-0000-4000-8000-000000000003",
"http://localhost:3000/session/00000000-0000-4000-8000-000000000003/review",
"http://localhost:3000/session/00000000-0000-4000-8000-000000000004/summary",
"http://localhost:3000/rest/00000000-0000-4000-8000-000000000003"
```

### `scripts/lighthouse-auth.cjs`

変更なし。

### ルート要件確認 (実装読み)

| URL | 必須条件 | 充足方法 |
|-----|----------|----------|
| `/session/[id]` | session 存在 + (SRS の場合) cards.length > 0 | in_progress session + #227 で 1 card 既存。srs_states 行なしで新規扱い → 対象 |
| `/session/[id]/review` | session 存在 | in_progress session |
| `/session/[id]/summary` | session.status === "completed" | completed session + duration_sec/ended_at 設定 |
| `/rest/[id]` | DB lookup なし (pure client) | UUID 形式のみ妥当ならよい |

## 受け入れ条件への対応

| 条件 | 対応 |
|------|------|
| 4 ルートが計測される | lighthouserc.json URL 追加 |
| 各ルートで a11y ≥ 0.95 | 既存 assertion 自動適用 |
| status 依存 seed | in_progress + completed の 2 セッション |
| seed 冪等 | fresh user + cascade delete (#227 と同じ) |
| CI green | lighthouse ジョブで検証 |

## リスク

| リスク | 緩和 |
|--------|------|
| `/session/[id]` for SRS が getSessionCards で空 → notFound | #227 で SRS card 1 件 seed 済み、srs_states 行なし = 新規扱いで対象 |
| `/session/[id]/summary` のレンダーエラー (NULL field アクセス) | duration_sec=300, ended_at=now を設定。card_reviews は空配列でも `length` は 0 を返す |
| `createTestSession` の TypeScript 既存呼び出しが optional 追加で壊れる | optional 引数のため後方互換、4 番目以降は省略可能 |
| a11y 違反検出 | #229 で追跡。軽微なら本 PR で対応 (#226 #227 と同じ判断) |

## テスト

- 既存テスト変更なし
- CI lighthouse ジョブで全 16 URL (12 既存 + 4 新規) 計測 + assertion pass

## 参考

- 関連 PBI: #225 #226 #227 (✅), #229 (違反修正)
- ルート実装: `src/app/session/[id]/page.tsx` (status 分岐), `src/app/session/[id]/summary/page.tsx` (status==completed 必須), `src/app/rest/[id]/page.tsx` (DB lookup なし)
- helpers: `tests/shared/helpers.ts` `createTestSession`
