# CI 高速化 設計書 (#231)

- Issue: [#231](https://github.com/u-stem/kairous/issues/231)
- 親 Epic: [#224 Lighthouse Accessibility を全画面に拡大](https://github.com/u-stem/kairous/issues/224)
- 作成日: 2026-04-14

## Why

`lighthouse-ci` と `test-large` が独立に Supabase ローカル起動と Next.js production build を毎回実行しており、それぞれ 5〜10 分を要する。#224 で Lighthouse 計測対象を 5 画面から 15 画面規模へ拡大すると、build 由来の冗長な所要時間がさらに膨らむ。画面拡大前にデファクトな最適化で底上げしておくことで、以降の PBI で効果検証 (計測→改善) をやりやすくする。

## Goals

- Next.js production build を CI 実行あたり 1 回に正規化する (現状 2 ジョブで重複)
- baseline / post-change の所要時間を PR description に表で提示し、改善幅を定量化する

## Non-Goals

- Supabase ローカル起動の共通化 (docker image cache / volume snapshot)。GitHub Actions における確立されたパターンが存在せず、flake リスクが効果を上回ると判断。後続 PBI 候補として切り出す
- Lighthouse URL の matrix 並列化。URL 数 5〜15 に対し matrix job の起動オーバーヘッド (Bun/Supabase/Playwright setup 各〜30 秒) が優位にならない
- Supabase hosted preview project 化 (Issue 備考の長期案)
- Playwright `--shard` による test-large の並列化。実装の結果 Playwright project 依存 (`auth-tests.dependencies: [chromium]`) により chromium 33 tests が全 shard でフル実行され、wall-clock 改善ゼロ + compute minutes 4 倍化となったため revert。根本対処には auth-tests / chromium の project 構造見直しが必要で、別 PBI として切り出す

## 方針

GitHub Actions と Next.js / Playwright 各公式が推奨する標準パターンで統一する:

- **`actions/cache` による `.next/cache` 永続化** — Next.js 公式ドキュメント記載の incremental build key (`${{ hashFiles('**/bun.lock', '**/*.[jt]s', '**/*.[jt]sx', '!**/.next/**') }}`) を使用
- **`actions/upload-artifact` / `actions/download-artifact` による build 成果物の job 間共有** — Next.js を含む多数の Node.js プロジェクトで定着
- **Playwright `--shard=i/N` + GitHub Actions matrix** — Playwright 公式ドキュメント「Sharding」の標準構成
- **Composite action による共通 setup の DRY 化** — GitHub 公式推奨

## アーキテクチャ

### 変更後の job 依存グラフ

```
lint-and-typecheck ┐
test-small ────────┤
migration ─────────┤
build (new) ───────┼──> test-large shard 1/4 ┐
                   │    test-large shard 2/4 │
                   │    test-large shard 3/4 ├── all shards complete
                   │    test-large shard 4/4 ┘
                   │
                   └──> lighthouse
test-medium (既存、Supabase 起動)
```

`build` は lint/typecheck/test-small と並列開始可能。`test-large` shard と `lighthouse` は `build` 完了後に fan-out。

### 1. Composite action: `.github/actions/setup-kairous`

全ジョブで重複している「checkout + bun setup + frozen-lockfile install」を 1 つの composite action に集約する。インターフェース:

```yaml
# 使用側
- uses: ./.github/actions/setup-kairous
```

入出力なし。副作用として Node modules がインストール済みの状態を作る。SHA 固定は composite action 内部で維持する。

### 2. build ジョブ (新設)

```yaml
build:
  runs-on: ubuntu-latest
  needs: [lint-and-typecheck]
  steps:
    - uses: ./.github/actions/setup-kairous
    - uses: actions/cache@<sha> # .next/cache の incremental key
      with:
        path: .next/cache
        key: nextjs-${{ hashFiles('bun.lock') }}-${{ hashFiles('src/**', 'public/**', 'next.config.ts', 'tsconfig.json') }}
        restore-keys: |
          nextjs-${{ hashFiles('bun.lock') }}-
    - run: bun run build
    - uses: actions/upload-artifact@<sha>
      with:
        name: nextjs-build
        path: |
          .next
          !.next/cache
        retention-days: 1
```

`.next/cache` は restore のみ有用で artifact には含めない (サイズ削減)。`retention-days: 1` でストレージコストを抑制。

### 3. lighthouse ジョブ変更

現行の `bun run build` ステップを削除し、build artifact を download する:

```yaml
- uses: actions/download-artifact@<sha>
  with:
    name: nextjs-build
    path: .next
- name: Next.js サーバ起動 (バックグラウンド)
  run: |
    bun run start &
    bunx wait-on http://localhost:3000 --timeout 60000
```

Supabase 起動と環境変数設定は現状維持 (Non-Goal)。

### 4. test-large ジョブ変更

matrix shard 化 + build artifact 消費:

```yaml
test-large:
  needs: [test-medium, lint-and-typecheck, build]
  strategy:
    fail-fast: false
    matrix:
      shard: [1, 2, 3, 4]
  steps:
    - uses: ./.github/actions/setup-kairous
    - uses: actions/download-artifact@<sha>
      with:
        name: nextjs-build
        path: .next
    - uses: supabase/setup-cli@<sha>
    - name: Supabase ローカル起動
      run: supabase start -x ...
    # 環境変数設定
    - name: Playwright ブラウザインストール
      run: bunx playwright install --with-deps chromium
    - name: E2E (shard ${{ matrix.shard }}/4)
      run: bunx playwright test --shard=${{ matrix.shard }}/4
    - uses: actions/upload-artifact@<sha>
      if: ${{ !cancelled() }}
      with:
        name: playwright-report-${{ matrix.shard }}
        path: |
          playwright-report/
          test-results/
        retention-days: 7
```

shard 数 4 は初期値。計測結果で 2 または 6 に調整する余地を残す。`fail-fast: false` で 1 shard 失敗時も他の結果を得る。

### 5. Playwright 設定の補強

shard 間で test isolation 前提を守るため、`tests/large/playwright.config.ts` が既に各 test でユニークなユーザーを生成していることを確認する (既存 test:large のテストデータ規約より)。shard 共有を意識した追加コードは不要。

## テスト戦略

- **既存テスト**: 本 PBI 内では変更しない (CI 構成変更のみ)
- **CI 構成の検証**: PR 上で CI を 3 回 push して flake 有無と所要時間分散を観察
- **計測**: baseline は main の直近 5 件の所要時間を `gh run list --workflow ci.yml` と `gh run list --workflow lighthouse-ci.yml` から取得し中央値を算出。post-change は PR 内 3 push の中央値を算出。build / test-large / lighthouse / 全体の 4 指標で比較表を PR description に掲載

## ロールアウト順序

1. composite action を新設し、`lint-and-typecheck` のみに適用して動作確認
2. composite action を他全ジョブに展開
3. `build` ジョブ新設 + `.next/cache` キャッシュ + artifact upload
4. `lighthouse` ジョブから `bun run build` を削除し artifact download に切替
5. `test-large` を matrix shard 化 + artifact download
6. baseline / post-change 計測を 3 push で実施、PR description 更新

各ステップ個別コミット。ロールバックは該当ステップの revert で可能。

## リスクと緩和

| リスク | 緩和 |
|--------|------|
| composite action のバグが全ジョブに波及 | 段階導入 (1 ジョブで検証 → 展開) |
| artifact の転送コストが build 短縮効果を上回る | `.next/cache` を除外して artifact 肥大化を回避、`retention-days: 1` で保持最小化 |
| shard 間のテスト独立性崩壊 (データ競合) | 既存 test:large はテストごとにユニークユーザー生成する規約。本 PBI 内では追加対策不要と判断 |
| shard 数 N で Supabase 起動 × N となり total minutes は増える | wall-clock の短縮が目的。GitHub Actions 料金は分あたりだが、Private repo でないため問題化しない |
| `.next/cache` key の hash 構成ミスで hit しない | `restore-keys` で部分一致フォールバックを設ける |
| artifact 名重複 (shard ごとの playwright-report) | `playwright-report-${{ matrix.shard }}` で shard 毎に分離 |

## 受け入れ条件との対応

| 受け入れ条件 | 満たし方 |
|--------------|----------|
| lighthouse / test-large で build の共通化 or キャッシュ化 | build ジョブ新設 + artifact 共有 |
| CI 所要時間の計測と改善幅の PR description 記載 | 表形式で baseline / post / 差分を掲載 |
| 並列化による flake 増加なし | shard × push 3 回 × shard 4 = 12 run で flake 率確認。閾値は 0 とする (発生時は対処してから merge) |
| 既存 CI が緑維持 | 段階コミット各時点で CI green を確認 |

## 設計判断 (ADR 候補)

- **Supabase 起動共通化を Non-Goal とした判断**: docker image cache / volume snapshot のいずれも GitHub Actions + Supabase CLI v2 系での確立パターンが公開されておらず、flake と debugging コストが効果を上回る見込み。PBI #231 スコープ内では見送り、別 PBI で実験的に検証する
- **shard 数 4 の選定**: 現状 E2E spec は 30 前後。shard=4 で 1 shard あたり 7-8 spec、各 shard の Supabase 起動 1-2 分を吸収できるバランス。計測後に調整

## 参考

- Next.js ドキュメント: [GitHub Actions caching](https://nextjs.org/docs/app/guides/ci-build-caching#github-actions)
- Playwright ドキュメント: [Sharding tests between multiple machines](https://playwright.dev/docs/test-sharding)
- GitHub Actions: [Creating a composite action](https://docs.github.com/en/actions/creating-actions/creating-a-composite-action)
