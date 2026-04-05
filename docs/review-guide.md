# PR レビューガイド

## コメントプレフィックス

レビューコメントにはプレフィックスを付けて意図を明確にする。

| プレフィックス | 意味 | 対応 |
|---|---|---|
| `blocker:` | マージをブロックする問題 | 修正必須 |
| `suggestion:` | 改善提案 | 任意、議論可 |
| `nit:` | 些細な指摘 (スタイル、命名等) | 任意 |
| `question:` | 理解のための質問 | 回答必要 |
| `note:` | 将来の参考情報 | 対応不要 |

- `blocker` が 1 件でもあればマージしない
- `suggestion` は議論の上で対応を決定。即対応が不要なら Issue 化して follow-up
- `nit` は同コミット内で対応可能なら修正、そうでなければスキップ可

## LGTM 要件

LGTM (マージ承認) を出す際は、以下を明記する。

### 必須チェック項目

1. **自動チェック結果**: lint, typecheck, tests の PASS/FAIL
2. **セキュリティ確認**: 認証・認可、入力バリデーション、秘密情報の露出有無
3. **Spec との整合性**: 仕様に対する過不足
4. **残存リスク**: known issues, 今回対応しない項目とその理由

### 判断根拠

- blocker が 0 件であること
- 残存リスクが Issue 化または文書化されていること
- 「問題がないから LGTM」ではなく「確認した結果問題がないから LGTM」

## レビュー担当

- 計画・設計・レビュー: Opus
- 実装: Sonnet
- レビューを Haiku で実施しない

## 自動レビュー (GitHub Actions)

`claude-code-action` による自動レビューが PR 作成時に実行される。

- `.github/workflows/claude-review.yml`: PR open/sync 時に自動レビュー
- `.github/workflows/claude.yml`: `@claude` メンションで対話的に質問・修正依頼

### セットアップ要件

1. [Claude GitHub App](https://github.com/apps/claude) をリポジトリにインストール
2. リポジトリの Secrets に `ANTHROPIC_API_KEY` を設定
3. workflow ファイルが `.github/workflows/` に配置されていること
