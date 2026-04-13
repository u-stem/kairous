# Changelog

Claude Code 設定・運用ルールの変更履歴。コード側の変更は Git 履歴を参照。

## 2026-04-13

### Added
- `.claude/settings.json` を新設 (チーム共有設定)。`WorktreeCreate` / `WorktreeRemove` フックを個人の `settings.local.json` から移行し、`${CLAUDE_PROJECT_DIR}` でポータブル化
- `CHANGELOG.md` を新設 (`.claude/rules/code-quality.md` の更新ポリシーに準拠)
- `.github/workflows/add-to-project.yml` 新設 (#208): Issue/PR 作成時に Project #5 へ自動追加
- `.github/workflows/issue-status-sync.yml` 新設 (#209): PR ライフサイクル (draft / ready_for_review / converted_to_draft) に連動し linked issue の Project Status を In Progress / In Review に自動遷移
- Project Status 選択肢に **In Review** を追加 (Todo / In Progress / In Review / Done)
- `.github/ISSUE_TEMPLATE/pbi.yml` 新設 (#204): PBI 用テンプレート。「触るファイル領域」を必須項目化しマルチセッション協調で競合検知に使う
- `.claude/rules/workflow.md` に「マルチセッション協調」節と inline review comment 返信確認ルールを追加
- `docs/issue-guide.md` にマルチセッション協調節を追加

### Changed
- `.claude/rules/workflow.md` の「タスク開始チェックリスト」を自動化前提に更新 (手動 Project Status 更新を削除、着手宣言コメントを追加)
- `.claude/rules/workflow.md` の「ステータス更新のタイミング」を自動遷移表に再構成

### Notes
- Claude Code v2.1.104 時点のベストプラクティスに追従
- 個人の allow リスト整理 (`settings.local.json`) は各自の裁量で実施
