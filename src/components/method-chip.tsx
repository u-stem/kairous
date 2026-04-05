import { cn } from "@/lib/utils";
import { getMethodColorClasses } from "@/lib/constants";

type Method = {
  id: string;
  slug: string;
  name: string;
  category: string;
};

type MethodChipProps = {
  method: Method;
  removable?: boolean;
  onRemove?: () => void;
};

export function MethodChip({ method, removable, onRemove }: MethodChipProps) {
  const colors = getMethodColorClasses(method.category);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        colors.light,
        colors.dark
      )}
    >
      {method.name}
      {removable && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${method.name}を解除`}
          // タップ領域を確保しつつ見た目はコンパクトに保つ
          className="ml-0.5 inline-flex size-3.5 items-center justify-center rounded-full hover:opacity-70"
        >
          ×
        </button>
      )}
    </span>
  );
}
