# Changelog

Claude Code 設定・運用ルールの変更履歴。コード側の変更は Git 履歴を参照。

## 2026-04-13

### Added
- `.claude/settings.json` を新設 (チーム共有設定)。`WorktreeCreate` / `WorktreeRemove` フックを個人の `settings.local.json` から移行し、`${CLAUDE_PROJECT_DIR}` でポータブル化
- `CHANGELOG.md` を新設 (`.claude/rules/code-quality.md` の更新ポリシーに準拠)

### Notes
- Claude Code v2.1.104 時点のベストプラクティスに追従
- 個人の allow リスト整理 (`settings.local.json`) は各自の裁量で実施
