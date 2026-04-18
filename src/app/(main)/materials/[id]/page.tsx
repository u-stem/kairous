import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Plus } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ja } from "date-fns/locale";

import { getMaterial } from "@/lib/actions/materials";
import { getMaterialElaborations } from "@/lib/actions/elaborations";
import { getCards } from "@/lib/actions/cards";
import { MethodChip } from "@/components/method-chip";
import { StartSessionButton } from "@/components/start-session-button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { hasCardBasedMethod, SELF_RATING_LABELS } from "@/lib/constants";
import { formatDurationHuman } from "@/lib/session-utils";
import { CardList } from "./card-list";
import { CardElaborationHistory } from "./card-elaboration-history";
import { MaterialMethodSheet } from "./material-method-sheet";
import { MethodSelectList } from "@/components/method-select-list";
import { MaterialReadingSection } from "@/components/material-reading-section";
import { MaterialPracticeLogSection } from "@/components/material-practice-log-section";
import type { PracticeLogEntry } from "@/lib/actions/practice-log";
import { MaterialNoteSection } from "@/components/material-note-section";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function MaterialDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab } = await searchParams;

  // 教材データ・カード一覧・elaboration 履歴を並列フェッチしてレイテンシを最小化する
  const [material, cards, elaborations] = await Promise.all([
    getMaterial(id),
    getCards(id),
    getMaterialElaborations(id),
  ]);

  if (!material) notFound();

  const srsMethod = material.methods.find((m) => m.slug === "srs");

  const isCardBased = hasCardBasedMethod(material.methods);

  const accuracyDisplay =
    material.accuracy_rate !== null
      ? `${Math.round(material.accuracy_rate * 100)}%`
      : "---";

  // カード不要手法のみの場合の代替指標
  const totalStudySec = material.recent_sessions.reduce((sum, s) => sum + s.duration_sec, 0);
  const sessionCount = material.recent_sessions.length;
  const lastStudiedAt = material.recent_sessions[0]?.started_at ?? null;

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      {/* 教材一覧へ戻るナビ: ユーザーが迷子にならないように階層を明示する */}
      <Link
        href="/materials"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 mb-2")}
      >
        <ChevronLeft aria-hidden="true" />
        教材一覧
      </Link>

      {/* ヘッダー: タイトル・カテゴリ・編集ボタン */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold" data-testid="material-title">{material.title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {material.category.name}
          </p>
        </div>
        <Link
          href={`/materials/${id}/edit`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
        >
          編集
        </Link>
      </div>

      {/* 手法チップ + 手法管理シートボタン */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {material.methods.map((method) => (
          <MethodChip key={method.id} method={method} />
        ))}
        <MaterialMethodSheet
          materialId={id}
          currentMethodIds={material.methods.map((m) => m.id)}
        />
      </div>

      {/* タブ: 概要 / カード / 統計 */}
      <Tabs defaultValue={tab === "cards" || tab === "stats" ? tab : "overview"}>
        <TabsList className="mb-4 w-full">
          <TabsTrigger value="overview">概要</TabsTrigger>
          <TabsTrigger value="cards">
            カード ({material.total_cards})
          </TabsTrigger>
          <TabsTrigger value="stats">統計</TabsTrigger>
        </TabsList>

        {/* 概要タブ: 説明文 + 3つのスタット + 直近セッション + 作成日 */}
        <TabsContent value="overview">
          {/* 説明文: 存在する場合のみ表示 */}
          {material.description && (
            <p className="mb-4 text-sm text-muted-foreground">{material.description}</p>
          )}

          {/* reading タイプ: 読書進捗セクション (手動進捗更新) */}
          {material.type === "reading" && (
            <div className="mb-4">
              <MaterialReadingSection
                materialId={material.id}
                completedUnits={material.completed_units}
                totalPages={
                  typeof material.meta?.total_pages === "number"
                    ? material.meta.total_pages
                    : undefined
                }
                unitLabel={material.unit_label}
              />
            </div>
          )}

          {/* practice_log タイプ: 練習エントリ追加 / 一覧 / 削除セクション */}
          {material.type === "practice_log" && (
            <div className="mb-4">
              <MaterialPracticeLogSection
                materialId={material.id}
                entries={
                  Array.isArray(material.meta?.entries)
                    ? (material.meta.entries as PracticeLogEntry[])
                    : []
                }
                entrySchema={
                  material.meta?.entry_schema === "duration" ||
                  material.meta?.entry_schema === "freeform"
                    ? material.meta.entry_schema
                    : "reps"
                }
                unitLabel={material.unit_label}
              />
            </div>
          )}

          {/* note タイプ: section_count / word_count 更新セクション */}
          {material.type === "note" && (
            <div className="mb-4">
              <MaterialNoteSection
                materialId={material.id}
                sectionCount={
                  typeof material.meta?.section_count === "number"
                    ? material.meta.section_count
                    : 0
                }
                wordCount={
                  typeof material.meta?.word_count === "number"
                    ? material.meta.word_count
                    : 0
                }
                unitLabel={material.unit_label}
              />
            </div>
          )}

          {isCardBased ? (
            <div className="grid grid-cols-3 gap-3">
              <Card size="sm">
                <CardHeader>
                  <CardTitle className="text-xs text-muted-foreground">
                    期限切れ
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold sm:text-2xl">{material.due_count}</p>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle className="text-xs text-muted-foreground">
                    総カード数
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold sm:text-2xl">{material.total_cards}</p>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle className="text-xs text-muted-foreground">
                    正答率
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold sm:text-2xl">{accuracyDisplay}</p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <Card size="sm">
                <CardHeader>
                  <CardTitle className="text-xs text-muted-foreground">
                    学習時間
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold sm:text-2xl">{formatDurationHuman(totalStudySec)}</p>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle className="text-xs text-muted-foreground">
                    セッション数
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold sm:text-2xl">{sessionCount}</p>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle className="text-xs text-muted-foreground">
                    最終学習日
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* 「約2ヶ月前」など日本語表現が長いため、SP で折り返しを許容 */}
                  <p className="text-base font-bold break-words sm:text-2xl">
                    {lastStudiedAt
                      ? formatDistanceToNow(new Date(lastStudiedAt), { addSuffix: true, locale: ja })
                      : "---"}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* 手法が1つなら1タップで開始、複数なら選択リストを表示してユーザーに選ばせる */}
          {material.methods.length > 0 && (
            <div className="mt-4">
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">
                {material.methods.length === 1 ? "学習を開始" : "学習手法を選択"}
              </h2>
              {material.methods.length === 1 ? (
                <StartSessionButton
                  materialId={material.id}
                  methodId={material.methods[0].id}
                  label={`${material.methods[0].name}${srsMethod && material.due_count > 0 ? ` (${material.due_count}枚)` : ""}`}
                  className="w-full rounded-lg bg-primary py-3 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                />
              ) : (
                <MethodSelectList
                  materialId={material.id}
                  methods={material.methods}
                  dueCounts={srsMethod ? { [srsMethod.id]: material.due_count } : undefined}
                />
              )}
            </div>
          )}

          {/* 直近セッション一覧 */}
          {material.recent_sessions.length > 0 && (
            <div className="mt-6">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                最近の学習
              </h2>
              <div className="flex flex-col gap-2">
                {material.recent_sessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between rounded-lg border px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium">{session.method.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDurationHuman(session.duration_sec)}
                        {session.self_rating !== null && (
                          <span className="ml-2">評価: {SELF_RATING_LABELS[session.self_rating as 1 | 2 | 3 | 4] ?? `${session.self_rating}`}</span>
                        )}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(session.started_at), {
                        addSuffix: true,
                        locale: ja,
                      })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {material.recent_sessions.length === 0 && (
            <p className="mt-8 text-center text-sm text-muted-foreground">
              まだ学習記録がありません
            </p>
          )}

          {/* elaboration 記述履歴: セッション履歴の下に表示 */}
          <CardElaborationHistory elaborations={elaborations} />

          {/* 作成日: メタ情報として概要タブの最下部に表示 */}
          <p className="mt-6 text-xs text-muted-foreground">
            作成日: {format(new Date(material.created_at), "yyyy年M月d日", { locale: ja })}
          </p>
        </TabsContent>

        {/* カードタブ: カード一覧 + 追加ボタン */}
        <TabsContent value="cards">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              {cards.length} 枚のカード
            </h2>
            <Link
              href={`/materials/${id}/cards/new`}
              className={cn(buttonVariants({ size: "sm" }))}
            >
              <Plus aria-hidden="true" />
              カードを追加
            </Link>
          </div>

          <CardList cards={cards} materialId={id} />
        </TabsContent>

        <TabsContent value="stats">
          <div className="flex flex-col items-center py-16">
            <p className="text-sm text-muted-foreground">
              この教材の統計データはまだありません
            </p>
            <Link
              href="/stats"
              className="mt-2 text-sm text-primary hover:underline"
            >
              全体統計を見る
            </Link>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
