import { format } from "date-fns";
import { ja } from "date-fns/locale";
import type { MaterialElaboration } from "@/lib/actions/elaborations";

export function CardElaborationHistory({
  elaborations,
}: {
  elaborations: MaterialElaboration[];
}) {
  if (elaborations.length === 0) return null;

  return (
    <div className="mt-8 space-y-3">
      <h2 className="text-lg font-bold">記述履歴</h2>
      <div className="space-y-2">
        {elaborations.map((e) => (
          <div key={e.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground truncate">{e.card_front}</p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(e.created_at), "yyyy/MM/dd HH:mm", { locale: ja })}
              </p>
            </div>
            <p className="text-sm whitespace-pre-wrap">{e.elaboration_text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
