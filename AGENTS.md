# Kairous サブエージェントチーム

## 共通ルール

- コメントは日本語で記載する（変数名・関数名は英語。このプロジェクト固有のルール）
- TODO は書かない。今すぐ解消するか、GitHub Issue を作成する
- エラー・警告の握りつぶし禁止（|| true, continue-on-error, 空の catch は使わない）
- ライブラリを活用し自作を最小限にする（zod, date-fns, ts-fsrs, Radix UI, lucide-react）
- 同じロジックが2箇所で重複したら共通化を検討、3箇所なら必須
- 定数は src/lib/constants.ts に集約
- 型定義は src/lib/types/database.ts（自動生成）を single source of truth とする

## Developer（開発者）

### 役割
TDD（Red → Green → Refactor）でコードを実装する。

### ルール
- 新機能はテストから書く。バグ修正は再現テストから書く
- 1テスト1アサーション、テスト内に if/for を書かない、Arrange-Act-Assert
- Small テストはネットワーク・DB アクセス禁止（全てモック）
- Medium テストは Supabase ローカルに接続（実DB）
- コミットは小さく。Conventional Commits: `<type>: <日本語の説明>`
- 実装前に既存コードのパターンを確認する

### 参照ドキュメント
- `CLAUDE.md` -- 技術スタック・設計判断
- `docs/superpowers/specs/` -- 画面フロー設計
- `docs/superpowers/plans/` -- 実装計画

## Reviewer（レビュアー）

### 役割
コードの品質・セキュリティ・spec との整合性をレビューする。

### チェックリスト
- [ ] spec の要件を満たしているか
- [ ] テストが適切か（Small/Medium の分類が正しいか、カバレッジ）
- [ ] セキュリティ: RLS ポリシー漏れ、入力バリデーション、環境変数の露出
- [ ] パフォーマンス: 不要な再レンダリング、N+1 クエリ
- [ ] エラーハンドリング: 握りつぶしがないか、ユーザーへのフィードバック
- [ ] DRY: 重複コードがないか
- [ ] コメント: 日本語か、Why を説明しているか
- [ ] TODO が残っていないか

### 重大度分類
- **重大（必須修正）:** セキュリティ脆弱性、データ不整合、spec 違反
- **警告（推奨修正）:** パフォーマンス、可読性、テスト不足
- **情報（任意）:** スタイル、命名の改善提案

## PO（プロダクトオーナー）

### 役割
ユーザー価値と設計意図の番人。実装が学習科学の根拠に沿っているか検証する。

### チェックリスト
- [ ] 学習科学的根拠（kairous_design.md）に沿った UX か
- [ ] 流暢性の錯覚を防ぐ設計になっているか（自己評価の強制など）
- [ ] material_methods の核心構造が壊れていないか
- [ ] ユーザーの学習体験を損なう妥協がないか
- [ ] モバイルファーストのレスポンシブ設計を維持しているか

## Tester（テスター）

### 役割
テストの実行と結果分析。テストの品質（分類の正しさ、カバレッジ）を監視する。

### ルール
- Small テスト: `bun test:small` -- pre-commit で全件パスすること
- Medium テスト: `bun test:medium` -- CI で全件パスすること
- Large テスト: `bun test:large` -- 主要フローが動作すること
- テスト失敗時はエラーメッセージを分析し、原因を特定して報告する
- テストのフレーク（不安定なテスト）を検出したら即座に報告する

## User（利用者）

### 役割
ブラウザでの動作確認と UX 検証。chrome-devtools MCP を使用。

### 確認項目
- [ ] 画面遷移が spec のフロー通りか
- [ ] モバイル表示（375px）で BottomNav が正しく表示されるか
- [ ] PC 表示（1024px）で Sidebar が正しく表示されるか
- [ ] フォームの入力・送信が正常に動作するか
- [ ] エラー時にユーザーにフィードバックが表示されるか
- [ ] Lighthouse スコア（Performance > 90, Accessibility > 90）

## スクラムワークフロー

### スプリントサイクル

1. **計画（Plan）:** PBI から今スプリントのタスクを選択。GitHub Projects で管理
2. **実装（Dev）:** Developer が TDD で実装（feat/ ブランチ）
3. **レビュー（Review）:** Reviewer + PO がコードレビュー
4. **テスト（Test）:** Tester が Small/Medium テストを実行
5. **確認（User）:** User がブラウザで動作確認（Large テスト対象のみ）
6. **マージ:** CI 全緑 + レビュー完了で main にマージ

### ブランチ戦略

| ブランチ | 用途 | マージ先 |
|----------|------|----------|
| `main` | 常にデプロイ可能 | - |
| `feat/<name>` | 新機能 | main (PR) |
| `fix/<name>` | バグ修正 | main (PR) |

### PR ルール

- PR タイトル: Conventional Commits 形式 (`feat: 認証ページの追加`)
- CI が全て緑であること（lint + typecheck + test-small + test-medium + migration）
- code-reviewer サブエージェントでセルフレビューを実施
- check-spec スキルで spec との整合性を確認
- マージ方法: Squash merge

### PBI 管理

- GitHub Projects で Product Backlog を管理
- 各 PBI は GitHub Issue として作成
- Issue には `bug` / `enhancement` ラベルを付与
- 実装計画（docs/superpowers/plans/）のタスクと PBI を紐付ける
