# Development Workflow

Kairous の開発フロー。コードに着手する前に GitHub 上の管理体制 (Epic / PBI / マイルストーン) を整える。

## PR 運用

- **PBI 単位で 1 PR**: 1 つの PBI = 1 feature ブランチ = 1 PR
- **PR サイズ 300 行以下 (初回 push 時の +追加行)**: 超過する PBI は事前分割する。典型パターンは「Server Action + Small テスト」と「UI + 統合 + Large E2E」の 2 分割
  - 計測は初回 push 時のみ。レビュー対応のフォローアップ commit は上限計算から除外
  - 根拠: Claude PR Review が 30 turn 上限で完走しない大型 PR を避ける
- **docs のみの変更**: PBI の PR に含めるか、単独は main 直接 push 可 (CI skip 対象)。PR 経由にする場合、Claude PR Review は CI を待つため 30 分 timeout する既知の挙動あり (#310 で追跡)。admin merge で進めてよい
- **Stacked PR の扱い**: base branch が別 feat ブランチの PR は、先行 PR を `--delete-branch` 付きでマージすると自動 close される。stacked にする場合は先行マージ時に `--delete-branch` を避けるか、先行マージ後すぐ後続 PR を rebase + 再作成する

## 品質保証

テスト戦略 / 品質保証階層 / CI flake 対処は [testing.md](./testing.md) を参照 (single source of truth)。

## エージェント委譲

メインコンテキストは進行管理・判断に徹し、作業はサブエージェントに委譲する場合の基準。

### 委譲の基準

- **5 クエリ超 or 結果量が大きい調査**: `Explore` / `explorer` に委譲
- **独立した実装タスク**: `general-purpose` に委譲
- **PR レビュー**: `code-reviewer`
- **テスト実行**: `test-runner`

単発の小タスクや結果をすぐ使う調査はメインで直接実行する (Opus 4.7 は context 1M のため保護目的の委譲は不要)。モデル選択は複雑度で判断する (DB スキーマ / 原子性 / セキュリティ系は Opus、単純 CRUD / 純粋ロジックは Sonnet)。

### Agent Teams (worktree 並列)

適用条件: **3 PBI 以上 & 完全独立ファイル**。いずれかを満たさなければ sequential で実行する。

- Lead (自分): 進行管理のみ、実装しない
- Implementer: `mode: "auto"` + `isolation: "worktree"` 指定必須 (親の許可設定は継承されない)
- Reviewer: 完了後に並列起動

**使わないケース**:
- PBI が 1〜2 つ (sequential で十分)
- 同一ファイルの編集が必要
- 強い依存関係がある逐次タスク

## 着手前チェックリスト

1. **エピックを確認/作成**: 関連 Epic があれば配下、なければ新規 (常駐 or 独立を判断)
2. **PBI を作成**: Why + 触るファイル領域 + 受け入れ条件 + Parent Epic。300 行超の見込みなら事前分割
3. **サブタスクに分解** (必要なら): PBI の sub-issues として登録
4. **マイルストーン割当**: 独立 Epic のみ
5. **ADR 投稿**: 非自明な設計判断は Discussions
6. **ブランチ作成**: `feat/`, `fix/` prefix
7. **PR 作成時に `closes #N`**: Project Status は自動遷移

Issue 階層: エピック > PBI > サブタスク。PBI は必ずエピック配下 (body の `Parent: #N` + sub-issue 両方設定)。

## 並列開発

独立 PBI は git worktree で並列開発できる。競合ファイルは `blocked by` で直列化する。

### 競合判定

- **同一ファイルを触る PBI**: blocked by で直列化
- **delete + modify の衝突**: 最も起きやすい rebase conflict 源。削除/移動を伴う PBI を先行させる (Epic #288 PBI-2 ↔ PBI-3 で発生実績)
- **独立ファイルのみ**: 並列可
- **全域変更** (フォーマット等): 単独実行

### worktree 基本操作

推奨は `bun run worktree:create` / `worktree:cleanup` 経由 (#265)。ディレクトリ命名 (`../kairous-<issue>-<slug>`) と後始末 (remove + branch -d + prune) を 1 コマンドに束ねる。`worktree:create` は `supabase/migrations/` の最大番号 + 他 worktree の予約番号を避けた次番号を予約して標準出力に表示し、`.kairous/worktree.json` に記録する (#266)。並列 DB スキーマ変更時の番号衝突を事前回避できる。`bun run worktree:list` (#267) で現在の全 worktree を一覧表示 (branch / 予約番号 / 未コミット変更 / main マーカー) できる。

```bash
# 作成: bun run worktree:create <issue-number> <branch-name>
bun run worktree:create 53 fix/53-stats-timezone
# → ../kairous-53-stats-timezone にブランチ付きで worktree を作る

# 完了後: bun run worktree:cleanup <worktree-path>
bun run worktree:cleanup ../kairous-53-stats-timezone
# → worktree remove + branch -d + prune を一括実行
```

素の git コマンドで同じことをする場合:

```bash
git worktree add -b fix/53-stats-timezone ../kairous-53-stats-timezone
git worktree remove ../kairous-53-stats-timezone
git branch -d fix/53-stats-timezone
git worktree prune
```

- 各 worktree で `bun install` 必要 (node_modules 共有不可、シンボリックリンク化も禁止 = パス解決が壊れる)
- `.env.local` はシンボリックリンクで共有 (`ln -sf /path/to/.env.local worktree/.env.local`)
- 完了後は速やかに削除 (長期放置しない)

### 複数同時起動時のポート割当

複数の worktree で `bun dev` / `supabase start` を同時に走らせる場合、デフォルトポートが衝突する。以下のルールで回避する。

**Supabase**: **単一 worktree (通常は main) でのみ `supabase start` を走らせる**のを推奨。他の worktree は `.env.local` のシンボリックリンク経由で main の Supabase に接続するため、追加起動は不要。マイグレーション検証で別 DB が必要な場合に限り `supabase/config.toml` を書き換えて固有ポートに変更する。

`supabase/config.toml` のデフォルトポート (同時起動する場合は各 worktree で +10 オフセット等に変更):

| サービス | デフォルト port |
|---------|---------------:|
| api | 54321 |
| db | 54322 (shadow: 54320) |
| studio | 54323 |
| inbucket | 54324 |
| analytics | 54327 |
| db.pooler | 54329 |

**Next.js dev サーバー**: `bun dev` のデフォルトポートは 3000。worktree B では `PORT=3001 bun dev` のように環境変数で逃す。

実例 (main + worktree A の 2 並列):

```bash
# main: supabase + Next.js dev
(cd /Users/mikiya/ws/kairous && supabase start && bun dev)

# worktree A: main の Supabase を共有、Next.js dev は PORT=3001 に逃す
cd /Users/mikiya/ws/kairous-feat-316
ln -sf /Users/mikiya/ws/kairous/.env.local .env.local   # 既に WorktreeCreate hook で作成済み
PORT=3001 bun dev
```

E2E テスト (`bun test:large`) の Playwright は `webServer` 設定のポートに依存するため、別 worktree で並列実行する場合は `playwright.config.ts` の `baseURL` / `webServer.port` を合わせて上書きする必要がある。

### リカバリ

- worktree/並列開発が失敗しても **PR 経由必須**。cherry-pick で main 直接取り込み禁止
- main への直接コミット禁止 (例外なし)
- `.github/workflows/*.yml` を触る PR が main に merge された直後、先行する feat branch は default branch と workflow 不一致になり Claude PR Review が 401 Workflow validation failed になる。`.github/workflows/rebase-open-prs.yml` が main push で自動実行され、自分宛 open PR の branch を一括 main 同期する (#351)。手動実行したい場合は Actions タブから workflow_dispatch、または `./scripts/rebase-open-prs.sh --run` (ローカル実行版)。conflict 発生 branch は PR に自動コメントされるので手動解決

### auto-merge と並列 PR

Merge Queue は personal account 所有 repo では利用不可のため、GitHub Actions + auto-merge で代替する (#271 Deferred / #351)。

- Settings → General → **Allow auto-merge** を有効化 (初回のみ)
- PR 作成時に `gh pr create --enable-auto-merge` か、open 後 `gh pr merge <N> --auto --squash` で auto-merge を enable。branch protection の required status checks (現行は `gh api repos/u-stem/kairous/branches/main/protection --jq .required_status_checks.contexts` で確認) が全 pass すると自動で squash merge される
- admin merge (`--admin`) は Claude PR Review の非必須状態で早期マージしたい場合のみ使う。通常は auto-merge で十分
- main への merge 完了後、rebase-open-prs.yml が他の open PR を順次 main に同期する

## マルチセッション協調

独立した Claude Code セッションが並行稼働する場合、GitHub Issue + コメント + Project Status を非同期バスとして使う (Agent Teams は同一親セッション内のみ)。

### セッション開始時

`gh issue list --state open --json number,title,projectItems` で他セッションの In Progress / In Review を確認し、触るファイル領域が競合しないか検証する。競合時は blocked by 明示 or 範囲を狭める。

### 着手宣言

Issue コメントでセッション識別子 (ブランチ名) + 開始日 + 領域を明記:

```markdown
### 着手 (in-progress)

- セッション: `feat/193-responsive-check`
- 開始: 2026-04-13
- 領域: `src/app/**`, `src/components/**`, `tests/large/responsive.spec.ts` (新規)
```

中断時は `### 着手取消 (paused)`、再開時は `### 再開 (resumed)` を使う (同フォーマット)。見出しに応じて Project Status がコメント検知で自動遷移する (#240)。

### ファイル領域

PBI Issue に「触るファイル領域」を必須記載 (`.github/ISSUE_TEMPLATE/pbi.yml`)。glob OK、精度より想定の可視化が目的。

## タスク完了チェックリスト

実装完了後に自律的に実行する (完了条件の詳細は [Definition of Done](./definition-of-done.md) 参照)。

### サブタスク
1. テスト + pre-commit + コミット
2. push (pre-push hooks が full-check)
3. ADR 更新 (該当時)
4. 次タスクへ

### PBI (PR 作成前)
1. DoD (PBI) を全て満たす: UI 動作確認、ドキュメント整合、ローカル code-review
2. ローカル code-review の blocker/suggestion/nit を全解消 → **全指摘解消してから PR 作成**
3. `gh pr create` で `closes #N`
4. PR description の Summary / Test plan を最終化

## レビュー指摘の対応

- 原則その場で修正 (blocker / suggestion / nit / question / note 全て)
- Issue 化は以下すべてを満たす時のみ: PR スコープ外 + 設計判断必要 + 修正量大
- **「将来対応」返信時は必ず Issue 作成**。Issue なしの先送りは禁止

## GitHub PR Review (自動)

- CI 全 green 後に自動起動。fork PR や `.github/workflows/*.yml` 変更 PR は起動しない (token 権限の制約)
- マージ前に **Claude PR Review の完走とコメント返信** を確認。CI green だけでマージしない
- inline review comment は `gh api repos/u-stem/kairous/pulls/<N>/comments` で取得し、全件返信 + resolve してからマージ
- 重複指摘防止: `claude-review.yml` の prompt に「resolve 済み指摘は再提示しない」を含める
- Dependabot PR は初回 push では token 権限不足で review 失敗、lockfile 同期等の追加 push で正常化

## ステータス更新のタイミング

Project Status は大半が自動遷移 (Epic #196 で自動化)。

### 自動遷移

| トリガー | 遷移 |
|----------|------|
| Issue / PR open | Project 追加 (Todo) |
| 親 Issue が Project にある状態で子 Issue 作成 | Project 追加 (Todo) |
| Issue コメント `### 着手 (in-progress)` / `### 再開 (resumed)` | Issue → In Progress |
| Issue コメント `### 着手取消 (paused)` | Issue → Todo |
| PR opened (draft) / converted_to_draft / reopened (draft) | linked issue → In Progress |
| PR opened (non-draft) / ready_for_review / reopened (non-draft) | linked issue → In Review |
| PR merged / Issue closed | → Done |

Issue コメント由来の遷移は `.github/workflows/issue-comment-status-sync.yml` による。Done 状態の Issue は巻き戻さない。OWNER / MEMBER / COLLABORATOR のコメントのみ対象。

### 手動更新

- ブロッカー発生時: In Progress → Todo に戻す + 状況コメント
- マイルストーン / エピック完了時: 振り返り投稿後 close
- ADR 完了時: Discussion close

### Project Workflow 前提

Project #5 の built-in Workflow のうち `Auto-add sub-issues` / `Item closed` / `Pull request merged` を ON に保つ。`Auto-close issue` は OFF (意図外 close を避ける)。

## マイルストーンとバージョニング

**1 Epic = 1 バージョン = 1 振り返り**。複数 Epic をまとめない。

### 常駐 vs 独立

| 種類 | 代表例 | 用途 | 振り返り | マイルストーン |
|------|-------|------|---------|---------------|
| 常駐エピック | #14 リファクタ / #15 セキュリティ / #16 パフォーマンス / #239 研究候補 | 横断テーマの受け皿 | しない | 紐付けない |
| 独立エピック | #196 / #288 / #299 | 1 バージョンで完結する明確スコープ | 必須 | 1:1 紐付け |

**独立エピックの判断基準**: PBI 3 本以上 + 完了条件明確 + 振り返りで汎用的学びが得られる。単発小修正は常駐配下。迷ったら常駐。

## 振り返り

Epic 完了時に Discussions (振り返りカテゴリ) に投稿 (テンプレート `.github/DISCUSSION_TEMPLATE/振り返り.yml`)。

- 概要 / よかったこと / 改善すべきこと / 数値 / アクションアイテム (必須 `- [ ]`)
- 投稿後は**同セッション内でアクション消化**。積んで放置しない
- 全アクション消化後に close (アクションなしの振り返りは投稿後即 close)

## ADR

Discussions (設計判断 ADR カテゴリ) に `ADR-NNN: <タイトル>` で投稿。

| ステータス | 操作 |
|-----------|------|
| Accepted + 実装完了 | 実装 PR リンク + 日付を記録して close |
| Deferred | open で保持 |
| Superseded | 後継 ADR リンク追記して close |

## 計画ファイル

- `docs/superpowers/plans/` はマイルストーン完了時にコミット
- 未追跡ファイルを放置しない (`git status` で検出即コミット or 削除)
- ファイル名にマイルストーン or Issue 番号を含める

## 参照

- [Issue Guide](../../docs/issue-guide.md) -- ラベル、トリアージ、常駐エピック
- [PR Review Guide](../../docs/review-guide.md) -- レビュープロセス
- [Definition of Done](./definition-of-done.md) -- 完了条件の詳細
