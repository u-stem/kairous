"use client";

type Props = {
  current: number;
  // 進捗バーの上限。超過時は 100% に clamp する。0 以下のときはバー非表示
  max: number;
  // バー左側の説明 (例: "進捗"、"語数の目安 (10000 語)")。省略時は左側 <span> 自体を描画しない
  // (空文字を渡すと空要素が残り不要な DOM/アクセシビリティ干渉を生むため nullable に)
  label?: string;
  // 百分率ラベルに付ける testid (例: "note-word-percent")
  percentTestId?: string;
  ariaLabel: string;
};

// material-*-section で繰り返し使う「数値 + 進捗バー」の共通表現 (#335)。
// 各 section は current / max / ラベル / aria / testid を渡すだけで同じ視覚に揃う。
// max=0 のときは計算不能なため何も描画しない (呼び出し側が表示可否を判断する負担を減らす)。
export function MaterialProgressBar({
  current,
  max,
  label,
  percentTestId,
  ariaLabel,
}: Props) {
  if (max <= 0) return null;
  const percent = Math.min(100, Math.round((current / max) * 100));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        {label ? (
          <span className="text-muted-foreground">{label}</span>
        ) : (
          <span aria-hidden="true" />
        )}
        <span className="text-muted-foreground" data-testid={percentTestId}>
          {percent}%
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={ariaLabel}
      >
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
