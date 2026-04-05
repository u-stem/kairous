---
name: run-tests
description: テストを実行して結果を報告する。引数で small/medium/large/all を指定
---

## テスト実行

引数に応じてテストを実行する。

### 実行コマンド

- `small` (デフォルト): `bun test:small`
- `medium`: `bun test:medium` (要: Supabase ローカル起動)
- `large`: `bun test:large` (要: dev サーバー + Supabase ローカル)
- `all`: small → medium の順に実行

### 実行手順

1. 指定されたテストスイートを実行する
2. 結果を解析する:
   - パス件数 / 失敗件数 / スキップ件数
   - 失敗したテストの名前とエラーメッセージ
3. 失敗がある場合:
   - エラーメッセージを分析して原因を特定する
   - 修正方針を提案する
4. 全件パスした場合:
   - 「全件パス」と報告する

### Medium テストの前提条件

Medium テストは Supabase ローカルが起動済みであること。
起動していない場合は以下を実行:

```bash
bunx supabase start
```
