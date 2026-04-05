import { getDueMaterials } from "@/lib/actions/sessions";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { TodayMaterialList } from "./today-material-list";

export default async function TodayPage() {
  const materials = await getDueMaterials();
  const today = new Date();
  const dateStr = format(today, "M月d日 EEEE", { locale: ja });

  const totalCards = materials.reduce((sum, m) => sum + m.due_count, 0);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">{dateStr}</p>
        <h1 className="text-2xl font-bold">今日の学習</h1>
      </div>

      {materials.length > 0 ? (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted p-4 text-center">
              <div className="text-2xl font-bold text-orange-500">{totalCards}</div>
              <div className="text-xs text-muted-foreground">復習カード</div>
            </div>
            <div className="rounded-lg bg-muted p-4 text-center">
              <div className="text-2xl font-bold text-blue-500">
                {materials.length}
              </div>
              <div className="text-xs text-muted-foreground">教材</div>
            </div>
          </div>

          <p className="mb-3 text-sm text-muted-foreground">復習が必要な教材</p>
          <TodayMaterialList materials={materials} />
        </>
      ) : (
        <div className="py-12 text-center">
          <p className="text-lg font-medium">復習完了</p>
          <p className="mt-2 text-sm text-muted-foreground">
            今日の復習カードはすべて完了しました
          </p>
        </div>
      )}
    </div>
  );
}
