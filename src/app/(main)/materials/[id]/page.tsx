import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Plus } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ja } from "date-fns/locale";

import { getMaterial } from "@/lib/actions/materials";
import { getCards } from "@/lib/actions/cards";
import { MethodChip } from "@/components/method-chip";
import { StartSessionButton } from "@/components/start-session-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { CardList } from "./card-list";
import { MaterialMethodSheet } from "./material-method-sheet";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function MaterialDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab } = await searchParams;

  // 教材データとカード一覧を並列フェッチしてレイテンシを最小化する
  const [material, cards] = await Promise.all([
    getMaterial(id),
    getCards(id),
  ]);

  if (!material) notFound();

  const srsMethod = material.methods.find((m) => m.slug === "srs");

  const accuracyDisplay =
    material.accuracy_rate !== null
      ? `${Math.round(material.accuracy_rate * 100)}%`
      : "---";

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      {/* 教材一覧へ戻るナビ: ユーザーが迷子にならないように階層を明示する */}
      <Link
        href="/materials"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 mb-2")}
      >
        <ChevronLeft />
        教材一覧
      </Link>

      {/* ヘッダー: タイトル・科目・編集ボタン */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold">{material.title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {material.subject.name}
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

          <div className="grid grid-cols-3 gap-3">
            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-xs text-muted-foreground">
                  期限切れ
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{material.due_count}</p>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-xs text-muted-foreground">
                  総カード数
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{material.total_cards}</p>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-xs text-muted-foreground">
                  正答率
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{accuracyDisplay}</p>
              </CardContent>
            </Card>
          </div>

          {/* SRS手法が有効かつ期限切れカードがある場合にセッション開始ボタンを表示 */}
          {srsMethod && material.due_count > 0 && (
            <div className="mt-4">
              <StartSessionButton
                materialId={material.id}
                methodId={srsMethod.id}
                label={`学習を始める (${material.due_count}枚)`}
                className="w-full rounded-lg bg-blue-500 py-3 font-medium text-white hover:bg-blue-600 disabled:opacity-50"
              />
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
                        {Math.floor(session.duration_sec / 60)}分
                        {session.self_rating !== null && (
                          <span className="ml-2">評価: {session.self_rating}</span>
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
              <Plus />
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
