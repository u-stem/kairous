# Development Workflow

新機能やエピック規模の作業を開始する前に、以下の手順を必ず実行する。コードに着手する前に GitHub 上の管理体制を整える。

## PR 運用

- **PBI 単位で 1 PR**: 1 つの PBI に対して 1 つの feature ブランチと 1 つの PR を作成する
- PR サイズは 300 行以下を目安にする。超える場合は PBI の分解を検討する
- サブタスクごとに PR を分けない (PBI 内のサブタスクは同一 PR に含める)
- **docs のみの変更**: 設計書、CLAUDE.md、rules/ の更新はコード変更と同じコミットに含めるか、PBI の PR に含める。独立した docs 更新は main 直接 push を許可する (CI スキップ対象のため)

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

### 単体エージェント (サブエージェント)

独立した小タスクに使用。Agent ツールで直接起動する。

| エージェント | 用途 | 使い方 |
|-------------|------|--------|
| general-purpose | 実装 (コード、テスト、コミット) | 計画の該当タスクを渡して実装を委譲 |
| Explore | 既存コードのパターン調査 | 実装前の調査フェーズで使用 |
| Plan | 実装方針の設計 | 計画が不明確な場合に方針を立てさせる |
| test-runner | テスト実行と結果要約 | 実装後の検証 |
| code-reviewer | PR レビュー | エピック完了時に PR 全体をレビュー |

### Agent Teams (並列実装)

独立した PBI が 2つ以上ある場合に使用する。TeamCreate で チームを構成し、各 Teammate が worktree で並列作業する。

**チーム構成**:
- Lead (自分): 進行管理のみ。実装しない
- Implementer (Sonnet, `mode: "auto"`, `isolation: "worktree"`): PBI のサブタスク単位で実装
- Reviewer (Opus): 完了した実装を並列レビュー
- チームサイズ: 3-5 (Lead + 実装 2-3 + レビュー 1)

**起動手順**:
1. `TeamCreate` でチームを作成
2. `TaskCreate` で PBI ごとのタスクを作成 (ファイル所有権を明記)
3. `Agent` で Teammate を spawn (`team_name`, `name`, `mode: "auto"`, `isolation: "worktree"`)
4. Lead は TaskList で進捗を監視し、SendMessage で調整
5. 全タスク完了後、Reviewer を spawn してレビュー
6. `SendMessage` で `shutdown_request` を送信してチーム解散

**ファイル所有権**: タスク作成時に担当ファイルを明示する。共有ファイル (constants.ts, types/ 等) は Lead が逐次更新する

**使わないケース**:
- PBI が 1つだけ (サブエージェント直接起動で十分)
- 同一ファイルの編集が必要 (直列で実装)
- 強い依存関係がある逐次タスク (Pipeline パターンを検討)

### 共通ルール

- 実装エージェントには計画ドキュメントのパス、対象ファイル、コンテキストを明示的に渡す
- メインは結果の確認、Issue 管理、次タスクへの橋渡しを行う

## 着手前チェックリスト

1. **エピックを確認/作成**: 該当するエピックが既にあるか確認。なければ作成 (ラベル: エピック + 内容)
2. **PBI (Issue) を作成**: Why + 受け入れ条件を記載。ラベル (区分 + 内容) を付与。Parent にエピックを設定。**エピック規模の作業でも PBI 分解は必須** -- 1 PR が 300 行を超えないよう、実装前に PBI を分割する。PBI 分解なしでエピックを直接実装しない
3. **サブタスクに分解**: PBI の sub-issues として登録。進捗を可視化する
4. **マイルストーンを設定**: 該当するマイルストーンがなければ作成し、エピック/PBI に紐付ける
5. **設計判断を記録**: 非自明な設計判断は GitHub Discussions (設計判断 ADR) にテンプレートを使って投稿
6. **ブランチを作成**: `feat/`, `fix/` 等の prefix でブランチを切る
7. **PR を作成し PBI と紐付け**: `closes #N` で PBI をリンク (Project Status は PR open で自動的に In Progress / In Review に遷移する。手動更新は不要)

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

### worktree の制約

- **worktree エージェントは `mode: "auto"` 必須**: サブエージェントは親セッションの許可設定を継承しない。`mode: "auto"` を指定しないとツール呼び出しのたびにユーザー許可を求めて停滞する
- **Agent Teams 経由で使用**: worktree 並列開発は Agent Teams の Teammate として起動する。単体の Agent + worktree は `mode: "auto"` を指定すれば使用可
- **WorktreeCreate フックにガード必須**: `if [ "$(pwd)" = "/path/to/main-repo" ]; then exit 0; fi` でメインリポ内での実行を防ぐ。シンボリックリンクの循環参照事故を防止する

### リカバリ時のルール

- **worktree/並列開発が失敗した場合も PR 経由必須**: cherry-pick で main に直接取り込まない。必ず feature ブランチ → PR → CI → マージの流れを守る
- **main に直接コミットしない**: 例外なし

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
- **worktree パス確認を指示**: プロンプトに「作業開始前に `pwd` と `git branch --show-current` で自分の worktree とブランチを確認すること」を含める。v0.12.0 で 2 回ブランチ混線が発生した原因は、エージェントが別の worktree で作業してしまったため
- **コミット前に git diff HEAD で範囲確認を指示**: プロンプトに「コミット前に `git diff HEAD --stat` で担当ファイル以外の変更が混入していないか確認すること」を含める。v0.13.0 でブランチ混線再発。作業開始時の pwd 確認だけでは検知できなかった
- **PostgreSQL RPC overload 対策**: 既存 RPC に引数を追加する migration は、新シグネチャを `CREATE OR REPLACE` する前に旧シグネチャを `DROP FUNCTION IF EXISTS ...` する。引数数が変わると別関数として共存し、PostgREST が関数解決で曖昧エラーを出す

## マルチセッション協調

独立した Claude Code セッションが並行稼働する運用で、セッション間の作業領域を事前調整する。通信は GitHub Issue + コメント + Project Status を唯一の非同期バスとして扱う (Agent Teams は同一親セッション内のみ)。

### セッション開始時

1. `gh issue list --repo u-stem/kairous --state open --json number,title,projectItems` で全 open Issue の Status を確認
2. 他セッションが In Progress / In Review の Issue を抽出し、その「触るファイル領域」と自分の作業範囲が重ならないか確認
3. 重なる場合は以下のいずれか:
   - 先行 Issue の完了を待つ (blocked by で明示)
   - 自分の範囲を狭める
   - 領域の切り分けを Issue コメントで合意する

### 着手宣言

自分が PBI に着手する際、Issue にコメントを投稿する:

```
着手: セッション <識別子> / 開始 YYYY-MM-DD HH:MM / 領域: <ファイル/glob>
```

目的は他セッションへの可視化。PR を開けば Project Status は自動で In Progress に遷移するため、ラベル操作は不要。

### ファイル領域の明記

PBI Issue には「触るファイル領域」を必ず記載する (PBI テンプレート `.github/ISSUE_TEMPLATE/pbi.yml` の必須項目)。広い範囲は glob で OK。正確でなくてよいが、実装前に想定を書くこと。

## タスク開始チェックリスト

各サブタスク着手前に必ず実行する。

1. **計画を読む**: 実装計画ドキュメントの該当タスクを確認する
2. **他セッションの作業領域を確認**: 上記「マルチセッション協調」参照。競合リスクがあれば先に調整する
3. **Issue に着手宣言を投稿**: セッション識別子 + 開始時刻 + 触るファイル領域
4. **現在のブランチ・状態を確認**: `git status` で未コミットの変更がないことを確認
5. **Project Status**: PR 作成で自動遷移するため手動更新は不要 (PR 作成前に Todo のまま作業開始して OK)

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

- **マージ前に必ず Claude PR Review を待つ**: CI の pass だけではマージしない。Claude PR Review のコメントを全件確認し、blocker/suggestion/nit を解消してから merge する。マージ後に follow-up PR で後追い対応するのは本来の運用ではない
- **inline review comment の残件確認**: マージ前に `gh api repos/u-stem/kairous/pulls/<N>/comments` で inline コメントを全件取得し、各コメントに返信済みか確認する。general (issue) comment だけでなく inline も必ずチェックする
- **コメントへの返信**: 各コメントに対応内容を返信してから resolve する。未返信のままマージしない
- **重複コメント防止**: `claude-review.yml` の prompt に「前回レビューで resolve 済みの指摘は繰り返さない」を含める
- **Dependabot PR**: 初回の Dependabot push では制限トークンで secret アクセス不可となり review が早期 fail する。ユーザー (またはメンテナ) が同じブランチに push 追加すると権限が切り替わり、Claude review は正常に動作する。lockfile 同期等の修正 push をすれば review も走る

## ステータス更新のタイミング

Project Status の大半は自動遷移する (Issue/Project 連携の自動化、Epic #196)。手動操作が必要な場面のみ残る。

### 自動遷移 (手動操作不要)

| トリガー | 遷移 | 仕組み |
|----------|------|--------|
| Issue / PR open | Project 追加 (Todo) | `.github/workflows/add-to-project.yml` |
| 親 Issue が Project にある状態で子 Issue 作成 | Project 追加 (Todo) | built-in "Auto-add sub-issues" |
| PR opened (draft) / converted_to_draft | linked issue → In Progress | `.github/workflows/issue-status-sync.yml` |
| PR ready_for_review | linked issue → In Review | 同上 |
| PR merged / Issue closed | → Done | built-in workflow |

### 手動更新が必要なケース

- **ブロッカー発生時**: Issue コメントで状況共有 + 必要に応じて In Progress → Todo に戻す
- **マイルストーン / エピック完了時**: マイルストーンを close、振り返り投稿
- **新しいサブプロジェクトの設計完了時**: ADR を close

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
