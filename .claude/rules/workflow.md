# Development Workflow

新機能やエピック規模の作業を開始する前に、以下の手順を必ず実行する。コードに着手する前に GitHub 上の管理体制を整える。

## PR 運用

- **エピック単位で 1 PR**: PBI に対応する feature ブランチで 1 つの PR を作成する
- サブタスクごとに PR を分けない (互いに依存しており個別マージ不可)
- PR は着手前チェックリストの時点で作成し、全タスク完了後にレビュー依頼する

## 品質保証の階層

| タイミング | 手段 | 内容 |
|-----------|------|------|
| 毎コミット | pre-commit hooks (自動) | lint, typecheck, test:small |
| 毎 push | pre-push hooks (自動) | full-check (lint + typecheck + test:small + test:medium) |
| PR push 時 | GitHub Actions CI | lint + typecheck + test:small + test:medium (PR 全体の diff で判定、毎回実行) |
| レビュー依頼前 | ドキュメント整合性チェック | CLAUDE.md, .claude/rules/, docs/, README.md が実態と一致しているか確認・更新 |
| レビュー依頼前 | code-reviewer エージェント | PR 全体のレビュー (設計整合性, セキュリティ, テスト網羅性) |

- hooks はローカルの即時フィードバック、CI はリモートの権威ある品質ゲート
- code-reviewer はエピック完了後の PR レビュー時に 1 回実行する

## エージェントチーム

メインコンテキストは進行管理に徹し、実作業はサブエージェントに委譲する。

| エージェント | 用途 | 使い方 |
|-------------|------|--------|
| general-purpose | 実装 (コード、テスト、コミット) | 計画の該当タスクを渡して実装を委譲 |
| Explore | 既存コードのパターン調査 | 実装前の調査フェーズで使用 |
| Plan | 実装方針の設計 | 計画が不明確な場合に方針を立てさせる |
| test-runner | テスト実行と結果要約 | 実装後の検証 |
| code-reviewer | PR レビュー | エピック完了時に PR 全体をレビュー |

- 独立したタスクは複数エージェントを並列実行する
- 実装エージェントには計画ドキュメントのパス、対象ファイル、コンテキストを明示的に渡す
- メインは結果の確認、Issue 管理、次タスクへの橋渡しを行う

## 着手前チェックリスト

1. **エピックを確認/作成**: 該当するエピックが既にあるか確認。なければ作成 (ラベル: エピック + 内容)
2. **PBI (Issue) を作成**: Why + 受け入れ条件を記載。ラベル (区分 + 内容) を付与。Parent にエピックを設定
3. **サブタスクに分解**: PBI の sub-issues として登録。進捗を可視化する
4. **マイルストーンを設定**: 該当するマイルストーンがなければ作成し、エピック/PBI に紐付ける
5. **設計判断を記録**: 非自明な設計判断は GitHub Discussions (設計判断 ADR) に投稿
6. **ブランチを作成**: `feat/`, `fix/` 等の prefix でブランチを切る
7. **PR を作成し PBI と紐付け**: `closes #N` で PBI をリンク
8. **Project Board を更新**: ステータスを In Progress に変更

Issue 階層: エピック (大テーマ) > PBI (実装単位) > サブタスク (子タスク)。PBI は必ずエピック配下に置く。

## タスク開始チェックリスト

各サブタスク着手前に必ず実行する。

1. **計画を読む**: 実装計画ドキュメントの該当タスクを確認する
2. **Sub-issue を In Progress に**: `gh issue edit #N` + Project Board のステータスを "In Progress" に更新
3. **現在のブランチ・状態を確認**: `git status` で未コミットの変更がないことを確認

## タスク完了チェックリスト

各サブタスクの実装完了後に必ず実行する。指示がなくても自律的にこの流れを取ること。

1. **コミット**: Conventional Commits 形式でコミット (pre-commit hooks が lint + typecheck + test を実行)
2. **push**: `git push` でリモートに反映 (pre-push hooks が full-check を実行)
3. **Sub-issue をクローズ**: `gh issue close #N` で完了 + Project Board を "Done" に
4. **ADR 更新** (該当する場合): 設計判断があれば GitHub Discussions にコメント追加
5. **次タスクへ**: 進捗を簡潔に報告してから次のタスクに着手

## PR レビュー依頼前チェックリスト

全サブタスク完了後、レビュー依頼前に必ず実行する。

1. **ドキュメント整合性チェック**: 今回の変更で影響を受ける md ファイルを確認し、実態と乖離していれば同じ PR 内で更新する
   - `CLAUDE.md`: Tech Stack, Directory Structure, Design Decisions, Commands
   - `.claude/rules/`: ワークフロー、テスト、セキュリティ等のルール
   - `docs/`: 設計書、ガイド
   - `README.md`: プロジェクト概要
2. **PR description を最終化**: 全コミットを反映した Summary と Test plan に更新する
3. **code-reviewer エージェントで PR レビュー**: 設計整合性、セキュリティ、テスト網羅性を確認

## ステータス更新のタイミング

- サブタスク着手時: In Progress
- サブタスク完了時: Done (Issue クローズ)
- マイルストーン / エピック完了時
- 新しいサブプロジェクトの設計完了時
- PR マージ後
- ブロッカー発生時

## 参照

- [Issue Guide](docs/issue-guide.md) -- ラベル、トリアージ、常駐エピック
- [PR Review Guide](docs/review-guide.md) -- レビュープロセス
- Project: Kairous Product Backlog (GitHub Projects)
