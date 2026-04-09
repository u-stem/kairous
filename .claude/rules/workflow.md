# Development Workflow

新機能やエピック規模の作業を開始する前に、以下の手順を必ず実行する。コードに着手する前に GitHub 上の管理体制を整える。

## PR 運用

- **PBI 単位で 1 PR**: 1 つの PBI に対して 1 つの feature ブランチと 1 つの PR を作成する
- PR サイズは 300 行以下を目安にする。超える場合は PBI の分解を検討する
- サブタスクごとに PR を分けない (PBI 内のサブタスクは同一 PR に含める)

## 品質保証の階層

| タイミング | 手段 | 内容 |
|-----------|------|------|
| 毎コミット | pre-commit hooks (自動) | lint, typecheck, test:small |
| 毎 push | pre-push hooks (自動) | full-check (lint + typecheck + test:small + test:medium) |
| PR 作成前 | UI 動作確認 | `bun dev` + ブラウザで変更画面を実操作 |
| PR 作成前 | ドキュメント整合性チェック | CLAUDE.md, .claude/rules/, docs/, README.md が実態と一致しているか |
| PR 作成前 | ローカル code-review ループ | 指摘を全て解消するまでレビュー→修正を繰り返す |
| PR push 時 | GitHub Actions CI | lint + typecheck + test:small + test:medium |
| PR push 時 | Claude PR Review (自動) | コメント投稿。返信→resolve のフローで対応 |

- hooks はローカルの即時フィードバック、CI はリモートの権威ある品質ゲート
- ローカル code-review は **PR 作成前** に全指摘を解消する。PR 作成後の Claude PR Review は追加チェック

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
2. **PBI (Issue) を作成**: Why + 受け入れ条件を記載。ラベル (区分 + 内容) を付与。Parent にエピックを設定。**エピック規模の作業でも PBI 分解は必須** -- 1 PR が 300 行を超えないよう、実装前に PBI を分割する。PBI 分解なしでエピックを直接実装しない
3. **サブタスクに分解**: PBI の sub-issues として登録。進捗を可視化する
4. **マイルストーンを設定**: 該当するマイルストーンがなければ作成し、エピック/PBI に紐付ける
5. **設計判断を記録**: 非自明な設計判断は GitHub Discussions (設計判断 ADR) にテンプレートを使って投稿
6. **ブランチを作成**: `feat/`, `fix/` 等の prefix でブランチを切る
7. **PR を作成し PBI と紐付け**: `closes #N` で PBI をリンク
8. **Project Board を更新**: ステータスを In Progress に変更

Issue 階層: エピック (大テーマ) > PBI (実装単位) > サブタスク (子タスク)。PBI は必ずエピック配下に置く (body の `Parent: #N` + sub-issue 両方を設定)。

## 並列開発

独立した PBI は git worktree で並列開発する。競合するファイルを触る PBI は GitHub の依存関係機能 (blocked by) で直列化を強制する。

### 競合判定

PBI 着手前に変更対象ファイルを洗い出し、他の進行中 PBI と競合するか判定する。

- **同一ファイルを触る PBI**: blocked by で直列化 (先行 PR マージ後に着手)
- **独立したファイルのみ**: 並列実行可能
- **全域変更 (コメント統一、フォーマット等)**: 他の全 PBI マージ後に単独実行

### worktree 運用

```bash
# 作成: 兄弟ディレクトリ方式
git worktree add ../kairous-fix-53 fix/53-stats-timezone

# 完了後: クリーンアップ
git worktree remove ../kairous-fix-53
git branch -d fix/53-stats-timezone
git worktree prune
```

- 各 worktree で `bun install` が必要 (node_modules は共有されない)
- `.env.local` はシンボリックリンクで共有する (`ln -sf /path/to/.env.local worktree/.env.local`)
- worktree ごとに独立した Claude Code セッションを実行可能
- 完了後は速やかに削除する (長期放置しない)
- `node_modules` はメインリポジトリからシンボリックリンクしない (パス解決が壊れる)。各 worktree で `bun install` を実行すること

### 依存関係の管理

- GitHub Issue の **blocked by / blocking** 機能で依存関係を設定する
- blocked な PR はレビュー可能だが、先行 PR マージ後にリベースしてからマージする
- 依存チェーンが 3 段以上になる場合は PBI の分解を見直す

### サブエージェントへの委譲ルール

- **migration 番号は事前割当**: 並列 worktree で番号が衝突しないようプロンプトで指定する
- **DB 制約をプロンプトに含める**: UNIQUE キー、FK の型、関連テーブルの DDL を添付する
- **モデル選択**: DB スキーマ・原子性・セキュリティに関わる実装は Opus、UI コンポーネントや純粋ロジックは Sonnet
- **テストの質を明示**: 「ソースコードの文字列検索ではなく、関数の入出力をテストすること」を指示に含める
- **レビューも並列実行**: 実装完了した worktree のレビューは同時に起動する
- **スコープ境界を明示**: 複数 PBI がある場合、担当外の PBI のファイルを列挙して「触らないこと」を指示する (例: 「PBI 3 の src/components/interleaving-button.tsx は変更しない」)

## タスク開始チェックリスト

各サブタスク着手前に必ず実行する。

1. **計画を読む**: 実装計画ドキュメントの該当タスクを確認する
2. **Sub-issue を In Progress に**: `gh issue edit #N` + Project Board のステータスを "In Progress" に更新
3. **現在のブランチ・状態を確認**: `git status` で未コミットの変更がないことを確認

## タスク完了チェックリスト

各サブタスクの実装完了後に必ず実行する。指示がなくても自律的にこの流れを取ること。完了条件の詳細は [Definition of Done](.claude/rules/definition-of-done.md) を参照。

1. **DoD (サブタスク) を満たす**: テスト、pre-commit、コミット、Sub-issue クローズ
2. **push**: `git push` でリモートに反映 (pre-push hooks が full-check を実行)
3. **ADR 更新** (該当する場合): 設計判断があれば GitHub Discussions にコメント追加
4. **次タスクへ**: 進捗を簡潔に報告してから次のタスクに着手

## PR 作成前チェックリスト

全サブタスク完了後、**PR 作成前** に必ず実行する。完了条件の詳細は [Definition of Done](.claude/rules/definition-of-done.md) を参照。

1. **DoD (PBI) を全て満たす**: UI 動作確認、ドキュメント整合性、ローカル code-review、受け入れ条件充足
2. **ローカル code-review の指摘対応**:
   - blocker: 必ず修正
   - suggestion: その場で修正 (後述の「Issue 化の基準」に該当しない限り)
   - nit: その場で修正
   - question: 回答し、必要なら修正
   - note: 確認して必要なら対応
   - **全指摘が解消されてから PR を作成する**
3. **PR 作成**: `gh pr create` で PR を作成し PBI と紐付け (`closes #N`)
4. **PR description を最終化**: 全コミットを反映した Summary と Test plan に更新する

## レビュー指摘の対応方針

### その場で修正するもの

- blocker / suggestion / nit は原則その場で修正する
- 修正量が小さい (数行~数十行) もの
- 既存コードのパターンに合わせる修正
- テストの追加・修正
- ドキュメントの更新

### Issue 化するもの

以下の **全て** に該当する場合のみ Issue 化を許可する:
- PR のスコープ外の変更が必要 (別のファイル群、別の機能領域)
- 設計判断が必要 (複数の有効なアプローチがある)
- 修正量が大きい (新規ファイル作成、アーキテクチャ変更)

Issue 化する場合は理由を明記し、PR コメントでリンクする。

### 「将来対応」の禁止

レビュー指摘に対して「将来対応」「次の機会に検討」等の先送り返信をする場合、**必ず同時に Issue (PBI) を作成**し、PR コメントに `#N で追跡します` とリンクすること。Issue のない先送りは実質的に放置と同じであり、禁止する。

## GitHub PR Review (自動)

Claude PR Review が PR push 時に自動実行される。

- **コメントへの返信**: 各コメントに対応内容を返信してから resolve する
- **重複コメント防止**: `claude-review.yml` の prompt に「前回レビューで resolve 済みの指摘は繰り返さない」を含める

## ステータス更新のタイミング

- サブタスク着手時: In Progress
- サブタスク完了時: Done (Issue クローズ)
- マイルストーン / エピック完了時
- 新しいサブプロジェクトの設計完了時
- PR マージ後
- ブロッカー発生時

## マイルストーンとバージョニング

**1 Epic = 1 バージョン = 1 振り返り**。複数 Epic をまとめない。小さい Epic でもバージョンを切る。

## 振り返りの運用

Epic 完了時に振り返りを GitHub Discussions (振り返りカテゴリ) に投稿する。Discussion テンプレート (`.github/DISCUSSION_TEMPLATE/振り返り.yml`) を使用すること。PR マージ後にエピックが完了したかを確認し、完了していれば振り返りを同セッション内で投稿する。後回しにしない。

### 振り返り本文

テンプレートに従い、以下を記載する:
- 概要 (Epic/PBI/PR/テスト数)
- よかったこと
- 改善すべきこと
- 数値
- アクションアイテム (`- [ ]` チェックリスト、必須)
- アクションのないふわっとした「学び」はアクション化しないで OK (記録として残す)

### アクションの消化

- 振り返り投稿後、同セッション内で全アクションを消化する。積むだけで放置しない
- ルール追記、Issue 作成、ADR 更新など具体的な成果物に落とす
- 消化後、Discussion にコメントで `- [x]` を記録する

### クローズ

- アクションアイテムが全て消化済み → close
- アクションアイテムがない振り返り → 投稿後に close

## ADR (設計判断) の運用

GitHub Discussions (設計判断 ADR カテゴリ) で設計判断を記録する。Discussion テンプレート (`.github/DISCUSSION_TEMPLATE/設計判断-adr.yml`) を使用すること。

### 採番

タイトルに連番を含める: `ADR-NNN: <タイトル>` (例: `ADR-001: SRS セッション実行フロー`)。次の番号は既存の最大値 + 1。

### ステータスとクローズ

| ステータス | Discussion | 説明 |
|-----------|-----------|------|
| Accepted + 実装完了 | close | 決定が実装に反映された |
| Deferred | open | 次回検討対象として可視化する |
| Superseded | close | 後継 ADR への参照リンクを追記 |

- 実装完了時はコメントで実装 PR と日付を記録してから close

## 計画ファイルの管理

- 実装計画 (`docs/superpowers/plans/`) はマイルストーン完了時にコミットする (設計書と同様にリポジトリの記録として残す)
- 未追跡の計画ファイルを放置しない。`git status` で検出したら即座にコミットまたは削除する
- 計画ファイルが別マイルストーンの作業と混同されないよう、ファイル名にマイルストーン or Issue 番号を含める

## 参照

- [Issue Guide](docs/issue-guide.md) -- ラベル、トリアージ、常駐エピック
- [PR Review Guide](docs/review-guide.md) -- レビュープロセス
- Project: Kairous Product Backlog (GitHub Projects)
