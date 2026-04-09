# Definition of Done (DoD)

各粒度で「完了」と見なすための条件。自動チェック (hooks/CI) で担保される項目と、手動確認が必要な項目を区別する。

## サブタスク完了

1. **コードが動作する**: 新規コードにはテストがある。バグ修正には再現テストがある
2. **pre-commit が通る** (自動): lint + typecheck + test:small
3. **コミット**: Conventional Commits 形式
4. **Sub-issue をクローズ**: Project Board を Done に更新

## PBI 完了 (= PR 作成可能)

サブタスク完了の条件に加え:

1. **pre-push が通る** (自動): lint + typecheck + test:small + test:medium
2. **UI 動作確認**: `bun dev` + ブラウザで変更画面を実操作。表示崩れ、遷移、エラー状態を確認
3. **ドキュメント整合性**: 変更が影響する md ファイル (CLAUDE.md, .claude/rules/, docs/, README.md) が実態と一致
4. **ローカル code-review**: code-reviewer エージェントで全指摘を解消 (blocker 0 件)
5. **受け入れ条件の充足**: PBI Issue に記載した受け入れ条件を全て満たしている
6. **PR description**: Summary と Test plan が全コミットを反映している
7. **CI が通る** (自動): lint + typecheck + test:small + test:medium + test:large + migration
8. **Claude PR Review**: 自動レビューのコメントに返信し resolve

## エピック完了 (= マイルストーンクローズ可能)

PBI 完了の条件に加え:

1. **全 PBI がマージ済み**: エピック配下の PBI が全て closed
2. **E2E テスト**: 主要ユーザーフローの E2E テストが追加されている
3. **設計書との整合**: spec に対する過不足がない。差異がある場合は spec を更新済み
4. **ADR の完了**: 設計判断 Discussion が実装 PR リンク付きで close 済み
5. **振り返り**: GitHub Discussions に振り返りを投稿し、アクションアイテムを消化済み
6. **計画ファイルのコミット**: docs/superpowers/plans/ の未追跡ファイルがない

## 共通原則

- **自動チェックをスキップしない**: `--no-verify` 禁止。hooks が失敗したら根本原因を修正する
- **先送り禁止**: レビュー指摘を「将来対応」にする場合は必ず Issue を作成しリンクする
- **DoD を満たさない成果物はマージしない**: 例外なし
