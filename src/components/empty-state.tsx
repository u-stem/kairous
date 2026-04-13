import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { BookOpen } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    href: string;
  };
};

export function EmptyState({
  icon: Icon = BookOpen,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      {/* アイコンをミュートカラーの円で囲んで視覚的な重心を作る */}
      <div className="flex size-16 items-center justify-center rounded-full bg-muted">
        <Icon aria-hidden="true" className="size-8 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action && (
        <Link href={action.href} className={buttonVariants()}>
          {action.label}
        </Link>
      )}
    </div>
  );
}
