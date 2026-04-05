import Link from "next/link";
import type { MaterialWithMethods } from "@/lib/types/materials";
import { CARD_BASED_SLUGS } from "@/lib/constants";
import { MethodChip } from "@/components/method-chip";

type MaterialCardProps = {
  material: MaterialWithMethods;
};

export function MaterialCard({ material }: MaterialCardProps) {
  // カードベースの手法が1つでも含まれていればカード枚数を表示する
  const isCardBased = material.methods.some((m) =>
    (CARD_BASED_SLUGS as readonly string[]).includes(m.slug)
  );
  const hasDue = material.due_count > 0;

  return (
    <Link
      href={`/materials/${material.id}`}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium leading-snug">{material.title}</p>
        {/* 復習期限の有無を色付きドットで直感的に伝える */}
        <div className="flex shrink-0 items-center gap-1">
          <span
            className={`size-2 rounded-full ${hasDue ? "bg-amber-400" : "bg-green-400"}`}
          />
          {isCardBased && (
            <span className="text-xs text-muted-foreground">
              {hasDue ? `${material.due_count}件` : ""}
              {material.total_cards}枚
            </span>
          )}
        </div>
      </div>

      {!isCardBased && (
        <p className="text-sm text-muted-foreground">セッション学習</p>
      )}

      {material.methods.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {material.methods.map((method) => (
            <MethodChip key={method.id} method={method} />
          ))}
        </div>
      )}
    </Link>
  );
}
