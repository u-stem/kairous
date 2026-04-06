# Stats 可視化 設計書

## 概要

daily_logs テーブルのデータを可視化し、学習量の把握・傾向分析・習慣の継続確認を実現する Stats ページ (`/stats`)。

## 設計判断

| 項目 | 決定 | 理由 |
|------|------|------|
| 構成 | サマリー + ドリルダウン | スクロールで完結、Today ページと同じ UX パターン |
| 期間 | 7/30/90 日切り替え (デフォルト 7) | 直近の傾向 + 長期トレンドの両立 |
| チャートライブラリ | Recharts | React 向け定番、宣言的 API、tree-shakeable |
| データ切り口 | 分野別 + 手法別 | daily_logs のスキーマ (subject x method) に自然にマッピング |
| 教材別 | スコープ外 | material detail ページに既存の統計がある |

## データソース

### daily_logs テーブル

```
(user_id, subject_id, method_id, log_date, total_sec, session_count, cards_reviewed)
UNIQUE(user_id, subject_id, method_id, log_date)
INDEX(user_id, log_date)
```

Edge Function `complete-session` がセッション完了時に `upsert_daily_log` RPC で原子的に upsert する。

### JOIN 対象

- `subjects` -- 分野名 (name)
- `learning_methods` -- 手法名 (name, slug)

## ページ構成

URL: `/stats`
Layout: `(main)` route group (BottomNav/Sidebar 内)

### 1. 期間セレクタ

ピルボタンで 7日 / 30日 / 90日 を切り替え。選択中の期間をハイライト。URL search params (`?period=7`) で状態管理し、ブラウザバックで戻れるようにする。

### 2. サマリーカード x3

| カード | 値 | 比較 |
|--------|-----|------|
| 学習時間 | total_sec の合計を時間表示 | 前期間比 (+12% / -5% 等) |
| セッション数 | session_count の合計 | 前期間比 |
| レビュー枚数 | cards_reviewed の合計 | 前期間比 |

前期間比較: 7日選択時は前の 7日間と比較。増加は緑、減少は赤、変化なしはグレー。

### 3. 日別学習時間チャート

- Recharts `BarChart`
- X軸: 日付 (date-fns で ja locale フォーマット)
- Y軸: 学習時間 (分単位、60分以上は時間表示)
- ツールチップ: 日付 + 時間 + セッション数

### 4. 分野別セクション

- Recharts `PieChart` (左) + 凡例リスト (右)
- 凡例: 分野名 + 学習時間 (降順ソート)
- データがない分野は表示しない

### 5. 手法別セクション

- 分野別と同じレイアウト (BreakdownChart コンポーネントを再利用)
- 手法名 + 学習時間

### 空状態

daily_logs が 0 件の場合:「まだ学習記録がありません。セッションを完了すると統計が表示されます。」

## Server Action

### `getStats(period: 7 | 30 | 90)`

`src/lib/actions/stats.ts` に定義。

```typescript
type StatsData = {
  summary: {
    totalSec: number;
    sessionCount: number;
    cardsReviewed: number;
    prevTotalSec: number;
    prevSessionCount: number;
    prevCardsReviewed: number;
  };
  daily: Array<{
    date: string;       // YYYY-MM-DD
    totalSec: number;
    sessionCount: number;
  }>;
  bySubject: Array<{
    subjectId: string;
    subjectName: string;
    totalSec: number;
    sessionCount: number;
    cardsReviewed: number;
  }>;
  byMethod: Array<{
    methodId: string;
    methodName: string;
    totalSec: number;
    sessionCount: number;
    cardsReviewed: number;
  }>;
};
```

**クエリ戦略:**

1. 現在の期間 (log_date >= today - period) と前期間 (log_date >= today - 2*period AND log_date < today - period) を 1 クエリで取得
2. daily: group by log_date、全 subject/method を合算
3. bySubject: group by subject_id、JOIN subjects で name 取得
4. byMethod: group by method_id、JOIN learning_methods で name 取得

daily_logs の既存インデックス `idx_daily_logs_user_date` が (user_id, log_date) なので、期間フィルタは効率的。

## コンポーネント構成

```
src/app/(main)/stats/
  page.tsx                -- Server Component: getStats() でデータ取得、期間を searchParams から読む
  stats-dashboard.tsx     -- Client Component: 期間切り替え + 全チャートの親
  period-selector.tsx     -- 期間ピルボタン (useRouter で searchParams 更新)
  summary-cards.tsx       -- サマリーカード x3 (前期間比較付き)
  daily-chart.tsx         -- 日別棒グラフ (Recharts BarChart)
  breakdown-chart.tsx     -- 円グラフ + 凡例リスト (分野/手法で再利用)
```

### データフロー

```
page.tsx (Server)
  ├── searchParams.period を読む (デフォルト 7)
  ├── getStats(period) を呼ぶ
  └── <StatsDashboard data={stats} period={period} />
        ├── <PeriodSelector current={period} />
        ├── <SummaryCards summary={data.summary} />
        ├── <DailyChart daily={data.daily} />
        ├── <BreakdownChart title="分野別" data={data.bySubject} />
        └── <BreakdownChart title="手法別" data={data.byMethod} />
```

期間切り替え時は `router.push(?period=30)` で Server Component を再レンダリング。Client-side navigation なのでレイアウトは維持される。

## 依存パッケージ

- `recharts` -- チャート描画
- `date-fns` -- 日付フォーマット (既存)

## テスト方針

### Small テスト

- `getStats` Server Action のモックテスト (Supabase クライアントをモック)
  - 期間フィルタが正しく適用されるか
  - 前期間比較の計算が正しいか
  - 空データ時の戻り値
- サマリーカードの比較値計算 (増減率)
- 日付フォーマットのユーティリティ

### Medium テスト

- `getStats` が実際の daily_logs データから正しく集約するか
- 複数 subject/method の集約が正しいか

## スコープ外 (将来の改善)

- ヒートマップ (GitHub 風の習慣可視化)
- CSV エクスポート
- 教材別ドリルダウン
- 学習ストリーク (連続日数)
- 目標設定と達成率
